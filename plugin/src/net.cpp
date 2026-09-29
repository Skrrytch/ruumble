#include "net.h"

#include <ixwebsocket/IXWebSocket.h>

namespace ruumble {

std::string toWebSocketUrl(const std::string &url) {
	if (url.rfind("https://", 0) == 0) return "wss://" + url.substr(8);
	if (url.rfind("http://", 0) == 0) return "ws://" + url.substr(7);
	return url;
}

WebSocketTransport::WebSocketTransport() : ws_(std::make_unique< ix::WebSocket >()) {
	ws_->enableAutomaticReconnection();
	ws_->setMinWaitBetweenReconnectionRetries(1000);
	ws_->setMaxWaitBetweenReconnectionRetries(30000);
	ws_->setPingInterval(30);
	ix::SocketTLSOptions tls;
	tls.caFile = "SYSTEM"; // system certificates (e.g. for Let's Encrypt or an internal CA)
	ws_->setTLSOptions(tls);
	ws_->setOnMessageCallback([this](const ix::WebSocketMessagePtr &msg) {
		// IXWebSocket thread: only pass on, Core queues events
		switch (msg->type) {
			case ix::WebSocketMessageType::Open: {
				std::lock_guard< std::mutex > lock(mutex_);
				openedAt_ = std::chrono::steady_clock::now();
			}
				if (onOpen_) onOpen_();
				break;
			case ix::WebSocketMessageType::Close:
				if (onClose_) onClose_();
				backoffAfterClose();
				break;
			case ix::WebSocketMessageType::Message:
				if (!msg->binary && onMessage_) onMessage_(msg->str);
				break;
			case ix::WebSocketMessageType::Error:
				if (onError_) onError_(msg->errorInfo.reason);
				break;
			default:
				break;
		}
	});
}

WebSocketTransport::~WebSocketTransport() {
	disconnect();
}

void WebSocketTransport::connect(const std::string &baseUrl) {
	disconnect();
	{
		std::lock_guard< std::mutex > lock(mutex_);
		stopping_ = false;
		backoff_  = std::chrono::milliseconds(0);
		running_  = true;
	}
	ws_->setUrl(toWebSocketUrl(baseUrl) + "/ws/plugin");
	ws_->start();
}

void WebSocketTransport::disconnect() {
	{
		std::lock_guard< std::mutex > lock(mutex_);
		if (!running_) return;
		running_  = false;
		stopping_ = true;
	}
	cv_.notify_all(); // end a running wait immediately
	ws_->stop();      // blocks until the network thread has finished
}

void WebSocketTransport::backoffAfterClose() {
	// Runs in the IXWebSocket thread right before its reconnection. IXWebSocket itself does not wait at all after a
	// previously successful connection; an immediate reject would otherwise cause a tight loop.
	using namespace std::chrono;
	std::unique_lock< std::mutex > lock(mutex_);
	const auto lived = steady_clock::now() - openedAt_;
	backoff_ = lived > seconds(30) ? milliseconds(0) : std::min< milliseconds >(std::max(backoff_ * 2, milliseconds(2000)), seconds(60));
	cv_.wait_for(lock, backoff_, [this] { return stopping_; });
}

void WebSocketTransport::send(const std::string &json) {
	ws_->sendText(json);
}

} // namespace ruumble
