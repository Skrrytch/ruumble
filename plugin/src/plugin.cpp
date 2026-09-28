// Ruumble-Plugin für Mumble: Exporte, Callbacks und MumbleApi-Umsetzung.
// Einzige Übersetzungseinheit, die MumblePlugin.h ohne MUMBLE_PLUGIN_NO_DEFAULT_FUNCTION_DEFINITIONS einbindet.
// Plugin-API 1.0.x, damit das Plugin ab Mumble 1.4 läuft (S2: Fedora liefert 1.4).

#define MUMBLE_PLUGIN_API_MINOR_MACRO 0
#include "MumblePlugin.h"

#include "config.h"
#include "core.h"
#include "net.h"

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <memory>

#ifndef RUUMBLE_VERSION
#	define RUUMBLE_VERSION "0.0.0"
#endif
#ifndef RUUMBLE_VERSION_MAJOR
#	define RUUMBLE_VERSION_MAJOR 0
#	define RUUMBLE_VERSION_MINOR 0
#	define RUUMBLE_VERSION_PATCH 0
#endif

namespace {

MumbleAPI api;
mumble_plugin_id_t ownId = 0;

/** MumbleApi über die echte Plugin-API. Aufrufe kommen aus dem Worker-Thread (max. 800 ms, Analyse 2.1). */
class RealApi : public ruumble::MumbleApi {
public:
	bool connected() override {
		mumble_connection_t conn;
		bool synced = false;
		return api.getActiveServerConnection(ownId, &conn) == MUMBLE_EC_OK
			   && api.isConnectionSynchronized(ownId, conn, &synced) == MUMBLE_EC_OK && synced;
	}

	std::optional< uint32_t > localSession() override {
		mumble_connection_t conn;
		mumble_userid_t id = 0;
		if (api.getActiveServerConnection(ownId, &conn) != MUMBLE_EC_OK) return std::nullopt;
		if (api.getLocalUserID(ownId, conn, &id) != MUMBLE_EC_OK) return std::nullopt;
		return id;
	}

	std::string userHash(uint32_t session) override {
		mumble_connection_t conn;
		const char *hash = nullptr;
		if (api.getActiveServerConnection(ownId, &conn) != MUMBLE_EC_OK) return "";
		if (api.getUserHash(ownId, conn, session, &hash) != MUMBLE_EC_OK || !hash) return "";
		std::string result(hash);
		api.freeMemory(ownId, hash);
		return result;
	}

	std::optional< int32_t > channelOf(uint32_t session) override {
		mumble_connection_t conn;
		mumble_channelid_t channel = -1;
		if (api.getActiveServerConnection(ownId, &conn) != MUMBLE_EC_OK) return std::nullopt;
		if (api.getChannelOfUser(ownId, conn, session, &channel) != MUMBLE_EC_OK) return std::nullopt;
		return channel;
	}

	bool requestMove(uint32_t session, int32_t channel) override {
		mumble_connection_t conn;
		if (api.getActiveServerConnection(ownId, &conn) != MUMBLE_EC_OK) return false;
		return api.requestUserMove(ownId, conn, session, channel, nullptr) == MUMBLE_EC_OK;
	}

	bool setMute(bool on) override { return api.requestLocalUserMute(ownId, on) == MUMBLE_EC_OK; }
	bool setDeaf(bool on) override { return api.requestLocalUserDeaf(ownId, on) == MUMBLE_EC_OK; }

	bool isMuted() override {
		bool v = false;
		api.isLocalUserMuted(ownId, &v);
		return v;
	}

	bool isDeafened() override {
		bool v = false;
		api.isLocalUserDeafened(ownId, &v);
		return v;
	}

	ruumble::Description rootDescription() override {
		ruumble::Description d;
		mumble_connection_t conn;
		const char *text = nullptr;
		if (api.getActiveServerConnection(ownId, &conn) != MUMBLE_EC_OK) return d;
		const mumble_error_t e = api.getChannelDescription(ownId, conn, 0, &text);
		if (e == MUMBLE_EC_UNSYNCHRONIZED_BLOB) {
			d.status = ruumble::Description::Status::Pending; // Mumble lädt den Text erst beim Ansehen (ADR-0010)
		} else if (e == MUMBLE_EC_OK) {
			d.status = ruumble::Description::Status::Ok;
			if (text) {
				d.text = text;
				api.freeMemory(ownId, text);
			}
		}
		return d;
	}

	std::string rootName() override {
		mumble_connection_t conn;
		const char *name = nullptr;
		if (api.getActiveServerConnection(ownId, &conn) != MUMBLE_EC_OK) return "Root";
		if (api.getChannelName(ownId, conn, 0, &name) != MUMBLE_EC_OK || !name) return "Root";
		std::string result(name);
		api.freeMemory(ownId, name);
		return result;
	}

	void log(const std::string &message) override {
		api.log(ownId, message.c_str());
		// Live-Tests lesen das Protokoll mit, Mumble selbst schreibt es nicht auf die Konsole
		if (logToStderr) std::fprintf(stderr, "ruumble-log: %s\n", message.c_str());
	}

	const bool logToStderr = std::getenv("RUUMBLE_LOG_STDERR") != nullptr;
};

std::unique_ptr< RealApi > realApi;
std::unique_ptr< ruumble::WebSocketTransport > transport;
std::unique_ptr< ruumble::Core > core;
ruumble::Config config;

} // namespace

// ---------------------------------------------------------------- Pflicht-Exporte

mumble_error_t mumble_init(mumble_plugin_id_t id) {
	ownId  = id;
	config = ruumble::Config::load();
	realApi = std::make_unique< RealApi >();
	transport = std::make_unique< ruumble::WebSocketTransport >();

	ruumble::Settings settings;
	settings.pluginVersion = RUUMBLE_VERSION;
	settings.autoOpen      = config.autoOpen;
	settings.bridgeUrl     = config.bridgeUrl;
	core = std::make_unique< ruumble::Core >(
		*realApi, *transport, settings, ruumble::openUrl,
		[](const std::string &url) { return config.pairedWith.count(url) > 0; },
		[](const std::string &url) {
			config.pairedWith.insert(url);
			config.save();
		});

	transport->onOpen([] { core->onTransportOpen(); });
	transport->onClose([] { core->onTransportClosed(); });
	transport->onMessage([](std::string msg) { core->onTransportMessage(std::move(msg)); });
	core->start();
	// Wird das Plugin bei bestehender Verbindung aktiviert, kommt kein onServerSynchronized mehr.
	if (realApi->connected()) core->onSynchronized();
	return MUMBLE_STATUS_OK;
}

void mumble_shutdown() {
	// Reihenfolge: erst der Worker (er steuert das Netz), dann das Netz. Danach entlädt Mumble die Bibliothek.
	if (core) core->stop();
	if (transport) transport->disconnect();
	core.reset();
	transport.reset();
	realApi.reset();
}

MumbleStringWrapper mumble_getName() {
	static const char name[] = "Ruumble";
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
	return { RUUMBLE_VERSION_MAJOR, RUUMBLE_VERSION_MINOR, RUUMBLE_VERSION_PATCH };
}

MumbleStringWrapper mumble_getAuthor() {
	static const char author[] = "Ruumble";
	return { author, std::strlen(author), false };
}

MumbleStringWrapper mumble_getDescription() {
	static const char desc[] = "Zeigt den Mumble-Server als Bürogebäude (Ruumble-Oberfläche im Browser)";
	return { desc, std::strlen(desc), false };
}

// ---------------------------------------------------------------- Callbacks: nur Ereignisse ablegen

void mumble_onServerSynchronized(mumble_connection_t) {
	if (core) core->onSynchronized();
}

void mumble_onServerDisconnected(mumble_connection_t) {
	if (core) core->onDisconnected(); // ServerHandler-Thread: nicht blockieren
}

void mumble_onChannelEntered(mumble_connection_t, mumble_userid_t user, mumble_channelid_t, mumble_channelid_t next) {
	if (core) core->onChannelEntered(user, next);
}

void mumble_onUserTalkingStateChanged(mumble_connection_t, mumble_userid_t user, mumble_talking_state_t state) {
	if (core) core->onTalking(user, static_cast< int >(state));
}
