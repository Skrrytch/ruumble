#include "net.h"

#include <ixwebsocket/IXWebSocket.h>

namespace ruumble {

std::string toWebSocketUrl(const std::string &url) {
	if (url.rfind("https://", 0) == 0) return "wss://" + url.substr(8);
	if (url.rfind("http://", 0) == 0) return "ws://" + url.substr(7);
	return url;
}

WebSocketTransport::WebSocketTransport(const std::string &url) : ws_(std::make_unique< ix::WebSocket >()) {
	ws_->setUrl(toWebSocketUrl(url));
	ws_->enableAutomaticReconnection();
	ws_->setMinWaitBetweenReconnectionRetries(1000);
	ws_->setMaxWaitBetweenReconnectionRetries(30000);
	ws_->setPingInterval(30);
	ix::SocketTLSOptions tls;
	tls.caFile = "SYSTEM"; // Zertifikate des Systems (z. B. für Let's Encrypt oder eine interne CA)
	ws_->setTLSOptions(tls);
	ws_->setOnMessageCallback([this](const ix::WebSocketMessagePtr &msg) {
		// IXWebSocket-Thread: nur weiterreichen, Core legt Ereignisse ab
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
			default:
				break;
		}
	});
}

WebSocketTransport::~WebSocketTransport() {
	stop();
}

void WebSocketTransport::start() {
	ws_->start();
}

void WebSocketTransport::stop() {
	{
		std::lock_guard< std::mutex > lock(mutex_);
		stopping_ = true;
	}
	cv_.notify_all(); // eine laufende Wartezeit sofort beenden
	ws_->stop();      // blockiert, bis der Netzwerk-Thread beendet ist
}

void WebSocketTransport::backoffAfterClose() {
	// Läuft im IXWebSocket-Thread direkt vor dessen Neuverbindung. IXWebSocket selbst wartet nach einer
	// zuvor erfolgreichen Verbindung gar nicht; ein sofortiges reject würde sonst eine enge Schleife ergeben.
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
