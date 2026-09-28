// Ruumble-Plugin: Kern ohne Abhängigkeit zu Mumble oder zum Netzwerk (testbar mit Fakes).
//
// Ein Worker-Thread arbeitet alle Ereignisse der Reihe nach ab: Mumble-Callbacks, Nachrichten des Dienstes,
// Zeitgeber. Callbacks legen nur Ereignisse ab und warten nie (Analyse 2.3).
// Befehle folgen ADR-0003: der Reihe nach, der letzte Wechsel gewinnt, mindestens 1 s Abstand zwischen
// Statusänderungen, Bestätigung per channelEntered, eine Wiederholung.
#pragma once

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

/** Zugriff auf Mumble (umgesetzt in mumble_api.cpp, im Test gefälscht). Aufrufe nur aus dem Worker. */
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
	virtual void log(const std::string &message) = 0;
};

/** Verbindung zum Dienst (umgesetzt in net.cpp) */
class Transport {
public:
	virtual ~Transport()                        = default;
	virtual void send(const std::string &json) = 0;
};

struct Settings {
	std::string pluginVersion = "0.0.0";
	bool paired               = false;
	bool autoOpen             = true;
	std::chrono::milliseconds spacing{ 1000 };
	std::chrono::milliseconds confirmTimeout{ 3000 };
};

/** Mumble_TalkingState als Protokoll-Text; nullopt für INVALID */
std::optional< std::string > talkingStateName(int state);

class Core {
public:
	using OpenUrl     = std::function< void(const std::string &) >;
	using SavePaired  = std::function< void() >;

	Core(MumbleApi &api, Transport &transport, Settings settings, OpenUrl openUrl, SavePaired savePaired);
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
	bool execute(const Command &command, std::chrono::steady_clock::time_point now);
	void sendMove(ActiveJoin &join, std::chrono::steady_clock::time_point now);
	void reply(const std::string &id, const std::string &result);
	void sendHello();
	void sendSelfState();
	void failAll(const std::string &result);
	std::optional< std::chrono::steady_clock::time_point > nextDeadline() const;

	MumbleApi &api_;
	Transport &transport_;
	Settings settings_;
	OpenUrl openUrl_;
	SavePaired savePaired_;

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
};

} // namespace ruumble
