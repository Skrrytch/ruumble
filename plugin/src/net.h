// Verbindung zum Ruumble-Dienst: ausgehender WebSocket (ws/wss) mit automatischer Neuverbindung (ADR-0001).
#pragma once

#include "core.h"

#include <chrono>
#include <condition_variable>
#include <functional>
#include <memory>
#include <mutex>
#include <string>

namespace ix {
class WebSocket;
}

namespace ruumble {

/** http(s)://… → ws(s)://… */
std::string toWebSocketUrl(const std::string &url);

class WebSocketTransport : public Transport {
public:
	explicit WebSocketTransport(const std::string &url);
	~WebSocketTransport() override;

	void onOpen(std::function< void() > f) { onOpen_ = std::move(f); }
	void onClose(std::function< void() > f) { onClose_ = std::move(f); }
	void onMessage(std::function< void(std::string) > f) { onMessage_ = std::move(f); }

	void start();
	void stop();
	void send(const std::string &json) override;

private:
	/** Wartezeit vor der Neuverbindung: wächst, solange Verbindungen nur kurz halten (z. B. reject) */
	void backoffAfterClose();

	std::unique_ptr< ix::WebSocket > ws_;
	std::mutex mutex_;
	std::condition_variable cv_;
	bool stopping_ = false;
	std::chrono::steady_clock::time_point openedAt_{};
	std::chrono::milliseconds backoff_{ 0 };
	std::function< void() > onOpen_, onClose_;
	std::function< void(std::string) > onMessage_;
};

} // namespace ruumble
