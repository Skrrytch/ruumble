// Machbarkeitstest S2: Minimal-Plugin "Ruumble (Spike)" gegen Plugin-API 1.0.x.
//
// - Callbacks legen nur Ereignisse ab (nie blockieren, nie auf den Worker warten).
// - Ein Worker-Thread führt Befehle aus einer Datei aus (Ersatz für den späteren WebSocket)
//   und ruft die API dabei aus einem fremden Thread auf.
// - Ergebnisse gehen als JSON-Zeilen in eine Ereignisdatei.
//
// Befehle (je Zeile in $RUUMBLE_SPIKE_DIR/cmd): "join <channelId>", "mute 0|1", "deaf 0|1", "state"

#define MUMBLE_PLUGIN_API_MINOR_MACRO 0 // Plugin-API 1.0.x (läuft ab Mumble 1.4)
#include "MumblePlugin.h"

#include <atomic>
#include <chrono>
#include <condition_variable>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <mutex>
#include <sstream>
#include <string>
#include <thread>

namespace {

using Clock = std::chrono::steady_clock;

MumbleAPI api;
mumble_plugin_id_t ownId = 0;

std::string dir() {
	const char *d = std::getenv("RUUMBLE_SPIKE_DIR");
	return d ? d : "/tmp/ruumble";
}

std::mutex logMutex;
void logEvent(const std::string &json) {
	std::lock_guard< std::mutex > lock(logMutex);
	std::ofstream out(dir() + "/events.jsonl", std::ios::app);
	const auto ms = std::chrono::duration_cast< std::chrono::milliseconds >(
						std::chrono::system_clock::now().time_since_epoch())
						.count();
	out << "{\"t\":" << ms << "," << json << "}\n";
}

std::string quote(const std::string &s) {
	std::string r = "\"";
	for (char c : s) {
		if (c == '"' || c == '\\') r += '\\';
		r += c;
	}
	return r + "\"";
}

// Zustand, den Callbacks setzen und der Worker liest.
std::atomic< bool > running{ false };
std::atomic< mumble_userid_t > selfSession{ 0 };
std::mutex enteredMutex;
std::condition_variable enteredCv;
mumble_channelid_t lastEnteredChannel = -1;
std::thread worker;

long long msSince(Clock::time_point t) {
	return std::chrono::duration_cast< std::chrono::milliseconds >(Clock::now() - t).count();
}

/** API-Aufruf aus dem Worker; bei Timeout genau einmal wiederholen (ADR-0003). */
template< typename F > mumble_error_t callWithRetry(F f, int &attempts) {
	attempts        = 1;
	mumble_error_t e = f();
	if (e == MUMBLE_EC_API_REQUEST_TIMEOUT) {
		attempts = 2;
		e        = f();
	}
	return e;
}

void reportState(const char *reason) {
	bool muted = false, deafened = false;
	api.isLocalUserMuted(ownId, &muted);
	api.isLocalUserDeafened(ownId, &deafened);
	logEvent(std::string("\"ev\":\"selfState\",\"reason\":") + quote(reason) + ",\"selfMute\":" + (muted ? "true" : "false")
			 + ",\"selfDeaf\":" + (deafened ? "true" : "false"));
}

void execute(const std::string &line) {
	std::istringstream in(line);
	std::string cmd;
	long long arg = 0;
	in >> cmd >> arg;
	const auto start = Clock::now();
	int attempts     = 0;

	if (cmd == "join") {
		mumble_connection_t conn;
		if (api.getActiveServerConnection(ownId, &conn) != MUMBLE_EC_OK) {
			logEvent("\"ev\":\"result\",\"cmd\":\"join\",\"result\":\"offline\"");
			return;
		}
		{
			std::lock_guard< std::mutex > lock(enteredMutex);
			lastEnteredChannel = -1;
		}
		const auto target = static_cast< mumble_channelid_t >(arg);
		const mumble_error_t e =
			callWithRetry([&] { return api.requestUserMove(ownId, conn, selfSession.load(), target, nullptr); }, attempts);
		const long long apiMs = msSince(start);
		std::string result;
		if (e != MUMBLE_EC_OK) {
			result = e == MUMBLE_EC_API_REQUEST_TIMEOUT ? "timeout" : "error";
		} else {
			// Bestätigung abwarten: onChannelEntered für die eigene Session (ADR-0003, 3 s)
			std::unique_lock< std::mutex > lock(enteredMutex);
			const bool confirmed = enteredCv.wait_for(lock, std::chrono::seconds(3),
													  [&] { return lastEnteredChannel == target; });
			result = confirmed ? "ok" : "rejected";
		}
		logEvent("\"ev\":\"result\",\"cmd\":\"join\",\"channel\":" + std::to_string(arg) + ",\"result\":" + quote(result)
				 + ",\"apiError\":" + std::to_string(e) + ",\"apiMs\":" + std::to_string(apiMs)
				 + ",\"totalMs\":" + std::to_string(msSince(start)) + ",\"attempts\":" + std::to_string(attempts));
	} else if (cmd == "mute" || cmd == "deaf") {
		bool current = false;
		if (cmd == "mute") api.isLocalUserMuted(ownId, &current);
		else api.isLocalUserDeafened(ownId, &current);
		const bool wanted = arg != 0;
		mumble_error_t e  = MUMBLE_EC_OK;
		if (current != wanted) { // nur bei echter Änderung aufrufen (jeder Aufruf erzeugt einen Log-Eintrag in Mumble)
			e = callWithRetry(
				[&] {
					return cmd == "mute" ? api.requestLocalUserMute(ownId, wanted) : api.requestLocalUserDeaf(ownId, wanted);
				},
				attempts);
		}
		logEvent("\"ev\":\"result\",\"cmd\":" + quote(cmd) + ",\"wanted\":" + (wanted ? "true" : "false")
				 + ",\"changed\":" + (current != wanted ? "true" : "false") + ",\"apiError\":" + std::to_string(e)
				 + ",\"apiMs\":" + std::to_string(msSince(start)) + ",\"attempts\":" + std::to_string(attempts));
		reportState(cmd.c_str());
	} else if (cmd == "state") {
		reportState("state");
	} else if (!cmd.empty()) {
		logEvent("\"ev\":\"unknownCommand\",\"line\":" + quote(line));
	}
}

void workerLoop() {
	std::streamoff offset = 0;
	while (running) {
		std::ifstream in(dir() + "/cmd");
		if (in) {
			in.seekg(offset);
			std::string line;
			while (running && std::getline(in, line)) {
				offset = in.tellg();
				if (offset < 0) break;
				execute(line);
			}
		}
		std::this_thread::sleep_for(std::chrono::milliseconds(100));
	}
}

} // namespace

// ---------------------------------------------------------------- Pflicht-Exporte

mumble_error_t mumble_init(mumble_plugin_id_t id) {
	ownId   = id;
	running = true;
	worker  = std::thread(workerLoop);
	logEvent("\"ev\":\"init\",\"pluginId\":" + std::to_string(id));
	return MUMBLE_STATUS_OK;
}

void mumble_shutdown() {
	const auto start = Clock::now();
	running          = false;
	if (worker.joinable()) worker.join();
	logEvent("\"ev\":\"shutdown\",\"joinMs\":" + std::to_string(msSince(start)));
}

MumbleStringWrapper mumble_getName() {
	static const char name[] = "Ruumble (Spike)";
	return { name, std::strlen(name), false };
}

mumble_version_t mumble_getAPIVersion() {
	return MUMBLE_PLUGIN_API_VERSION;
}

void mumble_registerAPIFunctions(void *apiStruct) {
	api = MUMBLE_API_CAST(apiStruct); // kopieren: Mumble übergibt einen Zeiger auf den Stack
}

void mumble_releaseResource(const void *) {
}

mumble_version_t mumble_getVersion() {
	return { 0, 0, 1 };
}

MumbleStringWrapper mumble_getAuthor() {
	static const char author[] = "Ruumble";
	return { author, std::strlen(author), false };
}

MumbleStringWrapper mumble_getDescription() {
	static const char desc[] = "Machbarkeitstest S2 für Ruumble";
	return { desc, std::strlen(desc), false };
}

// ---------------------------------------------------------------- Callbacks

void mumble_onServerSynchronized(mumble_connection_t connection) {
	// Main-Thread: API-Aufrufe laufen hier direkt und synchron.
	mumble_userid_t session = 0;
	const mumble_error_t e1 = api.getLocalUserID(ownId, connection, &session);
	selfSession             = session;
	const char *hash        = nullptr;
	const mumble_error_t e2 = api.getUserHash(ownId, connection, session, &hash);
	const std::string hashStr = hash ? hash : "";
	if (hash) api.freeMemory(ownId, hash);
	logEvent("\"ev\":\"synchronized\",\"session\":" + std::to_string(session) + ",\"hash\":" + quote(hashStr)
			 + ",\"errors\":[" + std::to_string(e1) + "," + std::to_string(e2) + "]");
}

void mumble_onServerDisconnected(mumble_connection_t) {
	// ServerHandler-Thread: nur festhalten, nichts blockieren.
	selfSession = 0;
	logEvent("\"ev\":\"disconnected\"");
}

void mumble_onChannelEntered(mumble_connection_t, mumble_userid_t user, mumble_channelid_t prev,
							 mumble_channelid_t next) {
	if (user != selfSession.load()) return;
	{
		std::lock_guard< std::mutex > lock(enteredMutex);
		lastEnteredChannel = next;
	}
	enteredCv.notify_all();
	logEvent("\"ev\":\"channelEntered\",\"from\":" + std::to_string(prev) + ",\"to\":" + std::to_string(next));
}

void mumble_onUserTalkingStateChanged(mumble_connection_t, mumble_userid_t user, mumble_talking_state_t state) {
	logEvent("\"ev\":\"talking\",\"session\":" + std::to_string(user) + ",\"state\":" + std::to_string(state));
}
