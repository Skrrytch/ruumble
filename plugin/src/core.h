// Ruumble-Plugin: Kern ohne Abhängigkeit zu Mumble oder zum Netzwerk (testbar mit Fakes).
//
// Ein Worker-Thread arbeitet alle Ereignisse der Reihe nach ab: Mumble-Callbacks, Nachrichten des Dienstes,
// Zeitgeber. Callbacks legen nur Ereignisse ab und warten nie (Analyse 2.3).
// Befehle folgen ADR-0003: der Reihe nach, der letzte Wechsel gewinnt, mindestens 1 s Abstand zwischen
// Statusänderungen, Bestätigung per channelEntered, eine Wiederholung.
#pragma once

#include "messages.h"

#include <chrono>
#include <condition_variable>
#include <cstdint>
#include <deque>
#include <functional>
#include <mutex>
#include <optional>
#include <string>
#include <thread>
#include <variant>

namespace ruumble {

/** Beschreibung eines Kanals: Mumble lädt den Text erst, wenn ein Nutzer ihn ansieht (ADR-0010). */
struct Description {
	enum class Status { Ok, Pending, Error };
	Status status = Status::Error;
	std::string text;
};

/** Zugriff auf Mumble (umgesetzt in plugin.cpp, im Test gefälscht). Aufrufe nur aus dem Worker. */
class MumbleApi {
public:
	virtual ~MumbleApi() = default;
	virtual bool connected() = 0;
	virtual std::optional< uint32_t > localSession() = 0;
	virtual std::string userHash(uint32_t session) = 0;
	virtual std::optional< int32_t > channelOf(uint32_t session) = 0;
	/** true = Anfrage an den Server gesendet (heißt nicht: verschoben) */
	virtual bool requestMove(uint32_t session, int32_t channel) = 0;
	virtual bool setMute(bool on)   = 0;
	virtual bool setDeaf(bool on)   = 0;
	virtual bool isMuted()          = 0;
	virtual bool isDeafened()       = 0;
	/** Beschreibung des Root-Kanals (ID 0) */
	virtual Description rootDescription() = 0;
	/** Name des Root-Kanals, wie ihn der Client zeigt (registername des Servers, sonst „Root“) */
	virtual std::string rootName() = 0;
	virtual void log(const std::string &message) = 0;
};

/** Verbindung zum Dienst (umgesetzt in net.cpp). Aufrufe nur aus dem Worker. */
class Transport {
public:
	virtual ~Transport()                               = default;
	/** Basis-URL des Dienstes, z. B. http://ruumble.example:8080 (verbindet mit …/ws/plugin) */
	virtual void connect(const std::string &baseUrl) = 0;
	virtual void disconnect()                        = 0;
	virtual void send(const std::string &json)       = 0;
};

struct Settings {
	std::string pluginVersion = "0.0.0";
	/** Version des Mumble-Clients aus mumble_setMumbleInfo, leer wenn unbekannt */
	std::string mumbleVersion;
	/** Sprache der eigenen Meldungen und der Hinweise des Dienstes */
	Locale locale = Locale::en;
	bool autoOpen             = true;
	/** feste Adresse aus plugin.json; ohne sie gilt die Root-Beschreibung (ADR-0010) */
	std::optional< std::string > bridgeUrl;
	std::chrono::milliseconds spacing{ 1000 };
	std::chrono::milliseconds confirmTimeout{ 3000 };
	std::chrono::milliseconds discoveryRetry{ 3000 };
};

/** Mumble_TalkingState als Protokoll-Text; nullopt für INVALID */
std::optional< std::string > talkingStateName(int state);

class Core {
public:
	using OpenUrl    = std::function< void(const std::string &) >;
	using IsPaired   = std::function< bool(const std::string &bridgeUrl) >;
	using MarkPaired = std::function< void(const std::string &bridgeUrl) >;

	Core(MumbleApi &api, Transport &transport, Settings settings, OpenUrl openUrl, IsPaired isPaired,
		 MarkPaired markPaired);
	~Core();

	void start();
	void stop();

	// Ereignisse (thread-sicher, blockieren nie)
	void onSynchronized();
	void onDisconnected();
	void onChannelEntered(uint32_t user, int32_t channel);
	void onTalking(uint32_t user, int state);
	void onTransportOpen();
	void onTransportClosed();
	void onTransportMessage(std::string json);

	// für Tests
	bool helloAcknowledged() const;

private:
	struct Synchronized {};
	struct Disconnected {};
	struct Entered {
		uint32_t user;
		int32_t channel;
	};
	struct Talking {
		uint32_t user;
		int state;
	};
	struct TransportOpen {};
	struct TransportClosed {};
	struct Message {
		std::string json;
	};
	using Event = std::variant< Synchronized, Disconnected, Entered, Talking, TransportOpen, TransportClosed, Message >;

	struct Command {
		std::string id;
		std::string cmd; // join | mute | deaf
		int32_t channel = -1;
		bool on         = false;
	};
	struct ActiveJoin {
		Command command;
		int attempts;
		std::chrono::steady_clock::time_point deadline;
	};

	void push(Event event);
	void run();
	void handle(const Event &event);
	void handleMessage(const std::string &json);
	void enqueueCommand(Command command);
	void step(std::chrono::steady_clock::time_point now);
	void execute(const Command &command, std::chrono::steady_clock::time_point now);
	void sendMove(ActiveJoin &join, std::chrono::steady_clock::time_point now);
	void reply(const std::string &id, const std::string &result);
	void sendHello();
	void sendSelfState();
	void failAll(const std::string &result);
	void resolveBridge(std::chrono::steady_clock::time_point now);
	void disconnectBridge();
	std::optional< std::chrono::steady_clock::time_point > nextDeadline() const;

	MumbleApi &api_;
	Transport &transport_;
	Settings settings_;
	OpenUrl openUrl_;
	IsPaired isPaired_;
	MarkPaired markPaired_;

	mutable std::mutex mutex_;
	std::condition_variable cv_;
	std::deque< Event > events_;
	bool running_ = false;
	std::thread worker_;

	// nur im Worker
	bool transportOpen_ = false;
	bool helloAcked_    = false;
	std::optional< uint32_t > session_;
	std::string certHash_;
	int32_t channel_ = -1;
	std::deque< Command > commands_;
	std::optional< ActiveJoin > active_;
	std::optional< std::chrono::steady_clock::time_point > lastChange_;
	bool helloAckedShared_ = false; // für helloAcknowledged(), unter mutex_
	std::string bridgeUrl_;         // aktuell verbundene Basis-URL
	std::optional< std::chrono::steady_clock::time_point > discoveryAt_;
	bool hintShown_ = false;
};

} // namespace ruumble
