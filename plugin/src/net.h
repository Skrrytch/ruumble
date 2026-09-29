// Connection to the Ruumble service: outgoing WebSocket (ws/wss) with automatic reconnection (ADR-0001).
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
	WebSocketTransport();
	~WebSocketTransport() override;

	void onOpen(std::function< void() > f) { onOpen_ = std::move(f); }
	void onClose(std::function< void() > f) { onClose_ = std::move(f); }
	void onMessage(std::function< void(std::string) > f) { onMessage_ = std::move(f); }
	void onError(std::function< void(std::string) > f) { onError_ = std::move(f); }

	void connect(const std::string &baseUrl) override;
	void disconnect() override;
	void send(const std::string &json) override;

private:
	/** wait before reconnecting: grows as long as connections only last briefly (e.g. reject) */
	void backoffAfterClose();

	std::unique_ptr< ix::WebSocket > ws_;
	std::mutex mutex_;
	std::condition_variable cv_;
	bool stopping_ = false;
	bool running_  = false;
	std::chrono::steady_clock::time_point openedAt_{};
	std::chrono::milliseconds backoff_{ 0 };
	std::function< void() > onOpen_, onClose_;
	std::function< void(std::string) > onMessage_, onError_;
};

} // namespace ruumble
