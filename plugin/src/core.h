// Ruumble plugin: core without dependency on Mumble or the network (testable with fakes).
//
// A worker thread processes all events in order: Mumble callbacks, messages from the service,
// timers. Callbacks only queue events and never wait (Analyse 2.3).
// Commands follow ADR-0003: in order, the last move wins, at least 1 s between
// state changes, confirmation via channelEntered, one retry.
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

/** Description of a channel: Mumble only loads the text once a user views it (ADR-0010). */
struct Description {
	enum class Status { Ok, Pending, Error };
	Status status = Status::Error;
	std::string text;
};

/** Access to Mumble (implemented in plugin.cpp, faked in the test). Calls only from the worker. */
class MumbleApi {
public:
	virtual ~MumbleApi() = default;
	virtual bool connected() = 0;
	virtual std::optional< uint32_t > localSession() = 0;
	virtual std::string userHash(uint32_t session) = 0;
	virtual std::optional< int32_t > channelOf(uint32_t session) = 0;
	/** true = request sent to the server (does not mean: moved) */
	virtual bool requestMove(uint32_t session, int32_t channel) = 0;
	virtual bool setMute(bool on)   = 0;
	virtual bool setDeaf(bool on)   = 0;
	virtual bool isMuted()          = 0;
	virtual bool isDeafened()       = 0;
	/** description of the root channel (ID 0) */
	virtual Description rootDescription() = 0;
	/** name of the root channel as the client shows it (the server's registername, otherwise "Root") */
	virtual std::string rootName() = 0;
	virtual void log(const std::string &message) = 0;
};

/** Connection to the service (implemented in net.cpp). Calls only from the worker. */
class Transport {
public:
	virtual ~Transport()                               = default;
	/** base URL of the service, e.g. http://ruumble.example:64080 (connects to …/ws/plugin) */
	virtual void connect(const std::string &baseUrl) = 0;
	virtual void disconnect()                        = 0;
	virtual void send(const std::string &json)       = 0;
};

struct Settings {
	std::string pluginVersion = "0.0.0";
	/** version of the Mumble client from mumble_setMumbleInfo, empty if unknown */
	std::string mumbleVersion;
	/** language of the plugin's own messages and of the service's notices */
	Locale locale = Locale::en;
	bool autoOpen             = true;
	/** fixed address from plugin.json; without it, the root description applies (ADR-0010) */
	std::optional< std::string > bridgeUrl;
	std::chrono::milliseconds spacing{ 1000 };
	std::chrono::milliseconds confirmTimeout{ 3000 };
	std::chrono::milliseconds discoveryRetry{ 3000 };
};

/** Mumble_TalkingState as protocol text; nullopt for INVALID */
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

	// events (thread-safe, never block)
	void onSynchronized();
	void onDisconnected();
	void onChannelEntered(uint32_t user, int32_t channel);
	void onTalking(uint32_t user, int state);
	void onTransportOpen();
	void onTransportClosed();
	/** failed connection attempt (DNS, TCP, TLS, HTTP status); the transport retries by itself */
	void onTransportError(std::string reason);
	void onTransportMessage(std::string json);

	// for tests
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
	struct TransportError {
		std::string reason;
	};
	struct Message {
		std::string json;
	};
	using Event = std::variant< Synchronized, Disconnected, Entered, Talking, TransportOpen, TransportClosed, TransportError, Message >;

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

	// worker only
	bool transportOpen_ = false;
	bool helloAcked_    = false;
	std::optional< uint32_t > session_;
	std::string certHash_;
	int32_t channel_ = -1;
	std::deque< Command > commands_;
	std::optional< ActiveJoin > active_;
	std::optional< std::chrono::steady_clock::time_point > lastChange_;
	bool helloAckedShared_ = false; // for helloAcknowledged(), under mutex_
	std::string bridgeUrl_;         // currently connected base URL
	std::optional< std::chrono::steady_clock::time_point > discoveryAt_;
	bool hintShown_ = false;
	bool errorShown_ = false; // connection error already in the log since the last successful connection
};

} // namespace ruumble
