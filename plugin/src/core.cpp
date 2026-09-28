#include "core.h"
#include "messages.h"

#include "discovery.h"

#include <nlohmann/json.hpp>

namespace ruumble {

using json   = nlohmann::json;
using Clock  = std::chrono::steady_clock;
constexpr int V = 1; // Protokollversion (protocol/src/index.ts)

std::optional< std::string > talkingStateName(int state) {
	switch (state) {
		case 0: return "passive";
		case 1: return "talking";
		case 2: return "whispering";
		case 3: return "shouting";
		case 4: return "talking-muted";
		default: return std::nullopt;
	}
}

Core::Core(MumbleApi &api, Transport &transport, Settings settings, OpenUrl openUrl, IsPaired isPaired,
		   MarkPaired markPaired)
	: api_(api), transport_(transport), settings_(std::move(settings)), openUrl_(std::move(openUrl)),
	  isPaired_(std::move(isPaired)), markPaired_(std::move(markPaired)) {}

Core::~Core() {
	stop();
}

void Core::start() {
	std::lock_guard< std::mutex > lock(mutex_);
	if (running_) return;
	running_ = true;
	worker_  = std::thread([this] { run(); });
}

void Core::stop() {
	{
		std::lock_guard< std::mutex > lock(mutex_);
		if (!running_) return;
		running_ = false;
	}
	cv_.notify_all();
	if (worker_.joinable()) worker_.join();
}

void Core::push(Event event) {
	{
		std::lock_guard< std::mutex > lock(mutex_);
		events_.push_back(std::move(event));
	}
	cv_.notify_all();
}

void Core::onSynchronized() { push(Synchronized{}); }
void Core::onDisconnected() { push(Disconnected{}); }
void Core::onChannelEntered(uint32_t user, int32_t channel) { push(Entered{ user, channel }); }
void Core::onTalking(uint32_t user, int state) { push(Talking{ user, state }); }
void Core::onTransportOpen() { push(TransportOpen{}); }
void Core::onTransportClosed() { push(TransportClosed{}); }
void Core::onTransportMessage(std::string json) { push(Message{ std::move(json) }); }

bool Core::helloAcknowledged() const {
	std::lock_guard< std::mutex > lock(mutex_);
	return helloAckedShared_;
}

void Core::run() {
	std::unique_lock< std::mutex > lock(mutex_);
	while (running_) {
		const auto deadline = nextDeadline();
		const auto hasWork  = [this] { return !running_ || !events_.empty(); };
		if (deadline) cv_.wait_until(lock, *deadline, hasWork);
		else cv_.wait(lock, hasWork);
		if (!running_) break;
		std::deque< Event > batch;
		batch.swap(events_);
		lock.unlock();
		for (const auto &e : batch) handle(e);
		step(Clock::now());
		lock.lock();
		helloAckedShared_ = helloAcked_;
	}
}

std::optional< Clock::time_point > Core::nextDeadline() const {
	std::optional< Clock::time_point > next;
	if (active_) next = active_->deadline;
	if (!active_ && !commands_.empty() && lastChange_) next = *lastChange_ + settings_.spacing;
	if (discoveryAt_ && (!next || *discoveryAt_ < *next)) next = discoveryAt_;
	return next;
}

void Core::handle(const Event &event) {
	std::visit(
		[this](const auto &e) {
			using T = std::decay_t< decltype(e) >;
			if constexpr (std::is_same_v< T, Synchronized >) {
				session_  = api_.localSession();
				certHash_ = session_ ? api_.userHash(*session_) : "";
				channel_  = session_ ? api_.channelOf(*session_).value_or(-1) : -1;
				helloAcked_ = false;
				hintShown_  = false;
				resolveBridge(Clock::now()); // verbindet (neu) oder schickt hello auf bestehender Verbindung
			} else if constexpr (std::is_same_v< T, Disconnected >) {
				failAll("offline");
				if (transportOpen_ && helloAcked_) transport_.send(json{ { "v", V }, { "type", "bye" } }.dump());
				session_.reset();
				helloAcked_ = false;
				disconnectBridge(); // nächster Server kann einen anderen Dienst nennen
			} else if constexpr (std::is_same_v< T, Entered >) {
				if (session_ && e.user == *session_) {
					channel_ = e.channel;
					if (active_ && active_->command.channel == e.channel) {
						reply(active_->command.id, "ok");
						active_.reset();
					}
				}
			} else if constexpr (std::is_same_v< T, Talking >) {
				const auto name = talkingStateName(e.state);
				if (name && helloAcked_ && transportOpen_)
					transport_.send(json{ { "v", V }, { "type", "talking" }, { "session", e.user }, { "state", *name } }.dump());
			} else if constexpr (std::is_same_v< T, TransportOpen >) {
				transportOpen_ = true;
				sendHello();
			} else if constexpr (std::is_same_v< T, TransportClosed >) {
				transportOpen_ = false;
				helloAcked_    = false;
				// Ergebnisse hätten keinen Empfänger mehr; offene Befehle verwerfen
				commands_.clear();
				active_.reset();
			} else if constexpr (std::is_same_v< T, Message >) {
				handleMessage(e.json);
			}
		},
		event);
}

// Meldungen an api_.log: ohne „Ruumble:“ davor, das setzt Mumble selbst.
void Core::sendHello() {
	if (!transportOpen_ || !session_ || certHash_.empty()) {
		if (session_ && certHash_.empty()) api_.log(text::noCertificate(settings_.locale));
		return;
	}
	json hello{ { "v", V },
				{ "type", "hello" },
				{ "session", *session_ },
				{ "certHash", certHash_ },
				{ "pluginVersion", settings_.pluginVersion },
				{ "paired", isPaired_(bridgeUrl_) } };
	if (!settings_.mumbleVersion.empty()) hello["mumbleVersion"] = settings_.mumbleVersion;
	hello["locale"] = localeName(settings_.locale);
	transport_.send(hello.dump());
}

void Core::handleMessage(const std::string &text) {
	const json msg = json::parse(text, nullptr, /*allow_exceptions=*/false);
	if (!msg.is_object() || msg.value("v", 0) != V) return;
	const std::string type = msg.value("type", "");
	if (type == "welcome") {
		helloAcked_ = true;
		if (msg.contains("pairUrl") && msg["pairUrl"].is_string() && !isPaired_(bridgeUrl_) && settings_.autoOpen) {
			openUrl_(msg["pairUrl"].get< std::string >());
			markPaired_(bridgeUrl_);
		}
		api_.log(text::connected(settings_.locale));
	} else if (type == "reject") {
		helloAcked_ = false;
		api_.log(text::rejected(settings_.locale, msg.value("reason", std::string("?"))));
	} else if (type == "notify" && helloAcked_) {
		// Hinweis ins Mumble-Protokoll (Pinnwand, AP11.4); Mumble maskiert HTML und setzt „Ruumble:“ davor
		const std::string note = msg.value("text", "");
		if (!note.empty()) api_.log(note.substr(0, 300));
	} else if (type == "command" && helloAcked_) {
		const json body = msg.value("body", json::object());
		Command c;
		c.id      = msg.value("id", "");
		c.cmd     = body.value("cmd", "");
		c.channel = body.value("channel", -1);
		c.on      = body.value("on", false);
		if (c.id.empty() || (c.cmd != "join" && c.cmd != "mute" && c.cmd != "deaf")) return;
		enqueueCommand(std::move(c));
	}
}

void Core::enqueueCommand(Command command) {
	if (!session_ || !api_.connected()) return reply(command.id, "offline");
	if (command.cmd == "join") {
		// der letzte Wechsel gewinnt (ADR-0003)
		if (active_) {
			reply(active_->command.id, "superseded");
			active_.reset();
		}
		for (auto it = commands_.begin(); it != commands_.end();) {
			if (it->cmd == "join") {
				reply(it->id, "superseded");
				it = commands_.erase(it);
			} else {
				++it;
			}
		}
	}
	commands_.push_back(std::move(command));
}

void Core::resolveBridge(Clock::time_point now) {
	discoveryAt_.reset();
	if (!session_) return;
	std::optional< std::string > url = settings_.bridgeUrl;
	if (!url) {
		const Description d = api_.rootDescription();
		if (d.status == Description::Status::Ok) url = findBridgeUrl(d.text);
		if (!url) {
			// noch nicht geladen, leer oder ohne Zeile: später erneut prüfen (Beschreibung kann sich ändern)
			const bool pending = d.status == Description::Status::Pending;
			if (pending && !hintShown_) {
				api_.log(text::hoverRoot(settings_.locale, api_.rootName()));
				hintShown_ = true;
			}
			discoveryAt_ = now + (pending ? settings_.discoveryRetry : settings_.discoveryRetry * 10);
			if (!bridgeUrl_.empty() && d.status == Description::Status::Ok) disconnectBridge(); // Zeile entfernt
			return;
		}
	}
	if (*url != bridgeUrl_) {
		disconnectBridge();
		bridgeUrl_ = *url;
		transport_.connect(bridgeUrl_); // hello folgt mit TransportOpen
	} else {
		sendHello();
	}
}

void Core::disconnectBridge() {
	if (bridgeUrl_.empty()) return;
	transport_.disconnect();
	bridgeUrl_.clear();
	transportOpen_ = false;
	helloAcked_    = false;
}

void Core::step(Clock::time_point now) {
	if (discoveryAt_ && now >= *discoveryAt_) resolveBridge(now);
	// Bestätigung ausgeblieben: einmal wiederholen (vermutlich Rate-Limit), dann aufgeben
	if (active_ && now >= active_->deadline) {
		if (active_->attempts < 2) {
			if (lastChange_ && now < *lastChange_ + settings_.spacing) {
				active_->deadline = *lastChange_ + settings_.spacing;
			} else {
				active_->attempts++;
				sendMove(*active_, now);
			}
		} else {
			reply(active_->command.id, "rejected");
			active_.reset();
		}
	}
	while (!active_ && !commands_.empty()) {
		const Command &next = commands_.front();
		const bool changes   = !(next.cmd == "join" && next.channel == channel_);
		if (changes && lastChange_ && now < *lastChange_ + settings_.spacing) return; // Abstand halten
		Command c = next;
		commands_.pop_front();
		execute(c, now);
	}
}

void Core::execute(const Command &c, Clock::time_point now) {
	if (!session_ || !api_.connected()) {
		reply(c.id, "offline");
		return;
	}
	if (c.cmd == "join") {
		if (c.channel == channel_) {
			reply(c.id, "ok"); // Mumble würde nichts senden und nichts bestätigen (S2)
			return;
		}
		active_ = ActiveJoin{ c, 1, now };
		sendMove(*active_, now);
		return;
	}
	const bool current = c.cmd == "mute" ? api_.isMuted() : api_.isDeafened();
	if (current != c.on) {
		const bool sent = c.cmd == "mute" ? api_.setMute(c.on) : api_.setDeaf(c.on);
		lastChange_     = now;
		if (!sent) {
			reply(c.id, "timeout");
			return;
		}
	}
	reply(c.id, "ok");
	sendSelfState();
}

void Core::sendMove(ActiveJoin &join, Clock::time_point now) {
	lastChange_   = now;
	join.deadline = now + settings_.confirmTimeout;
	if (!api_.requestMove(*session_, join.command.channel) && !api_.requestMove(*session_, join.command.channel)) {
		reply(join.command.id, "timeout"); // zweimal kein Durchkommen zum Main-Thread (800 ms)
		active_.reset();
	}
}

void Core::reply(const std::string &id, const std::string &result) {
	if (transportOpen_ && !id.empty())
		transport_.send(json{ { "v", V }, { "type", "result" }, { "id", id }, { "result", result } }.dump());
}

void Core::sendSelfState() {
	if (!transportOpen_ || !helloAcked_) return;
	transport_.send(
		json{ { "v", V }, { "type", "selfState" }, { "selfMute", api_.isMuted() }, { "selfDeaf", api_.isDeafened() } }.dump());
}

void Core::failAll(const std::string &result) {
	if (active_) reply(active_->command.id, result);
	active_.reset();
	for (const auto &c : commands_) reply(c.id, result);
	commands_.clear();
}

} // namespace ruumble
