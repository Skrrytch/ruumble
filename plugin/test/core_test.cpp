#define DOCTEST_CONFIG_IMPLEMENT_WITH_MAIN
#include <doctest/doctest.h>

#include "core.h"
#include "discovery.h"

#include <nlohmann/json.hpp>

#include <atomic>
#include <chrono>
#include <mutex>
#include <set>
#include <thread>
#include <vector>

using namespace ruumble;
using json  = nlohmann::json;
using Clock = std::chrono::steady_clock;
using namespace std::chrono_literals;

namespace {

const std::string HASH(40, 'a');

struct FakeApi : MumbleApi {
	std::mutex m;
	Core *core = nullptr;
	int32_t channel = 1;
	bool muted = false, deafened = false;
	bool confirmMoves = true;
	std::vector< int32_t > moves;
	std::vector< std::pair< std::string, Clock::time_point > > changes;

	bool connected() override { return true; }
	std::optional< uint32_t > localSession() override { return 7; }
	std::string userHash(uint32_t) override { return HASH; }
	std::optional< int32_t > channelOf(uint32_t) override { return channel; }
	bool requestMove(uint32_t, int32_t ch) override {
		{
			std::lock_guard< std::mutex > l(m);
			moves.push_back(ch);
			changes.emplace_back("move", Clock::now());
		}
		if (confirmMoves) {
			channel = ch;
			core->onChannelEntered(7, ch); // wie Mumble: Bestätigung kommt als Callback
		}
		return true;
	}
	bool setMute(bool on) override {
		std::lock_guard< std::mutex > l(m);
		muted = on;
		changes.emplace_back("mute", Clock::now());
		return true;
	}
	bool setDeaf(bool on) override {
		std::lock_guard< std::mutex > l(m);
		deafened = on;
		changes.emplace_back("deaf", Clock::now());
		return true;
	}
	bool isMuted() override { return muted; }
	bool isDeafened() override { return deafened; }
	Description description{ Description::Status::Ok, "ruumble: http://r.test" };
	std::vector< std::string > logs;
	std::string rootName() override { return "Musterhaus"; }
	Description rootDescription() override {
		std::lock_guard< std::mutex > l(m);
		return description;
	}
	void log(const std::string &msg) override {
		std::lock_guard< std::mutex > l(m);
		logs.push_back(msg);
	}
	size_t moveCount() {
		std::lock_guard< std::mutex > l(m);
		return moves.size();
	}
};

struct FakeTransport : Transport {
	std::mutex m;
	std::vector< json > sent;
	std::vector< std::string > connects;
	int disconnects = 0;
	void connect(const std::string &url) override {
		std::lock_guard< std::mutex > l(m);
		connects.push_back(url);
	}
	void disconnect() override {
		std::lock_guard< std::mutex > l(m);
		disconnects++;
	}
	size_t connectCount() {
		std::lock_guard< std::mutex > l(m);
		return connects.size();
	}
	void send(const std::string &s) override {
		std::lock_guard< std::mutex > l(m);
		sent.push_back(json::parse(s));
	}
	std::vector< json > of(const std::string &type) {
		std::lock_guard< std::mutex > l(m);
		std::vector< json > r;
		for (auto &j : sent)
			if (j["type"] == type) r.push_back(j);
		return r;
	}
	std::optional< json > result(const std::string &id) {
		for (auto &j : of("result"))
			if (j["id"] == id) return j;
		return std::nullopt;
	}
};

template< typename F > bool eventually(F f, std::chrono::milliseconds timeout = 2000ms) {
	const auto end = Clock::now() + timeout;
	while (Clock::now() < end) {
		if (f()) return true;
		std::this_thread::sleep_for(5ms);
	}
	return f();
}

struct Fixture {
	FakeApi api;
	FakeTransport transport;
	std::atomic< int > opened{ 0 };
	std::string openedUrl;
	std::mutex pm;
	std::set< std::string > paired;
	std::unique_ptr< Core > core;

	explicit Fixture(std::optional< std::string > bridgeUrl = std::nullopt) {
		Settings s;
		s.pluginVersion  = "0.1.0";
		s.bridgeUrl      = bridgeUrl;
		s.spacing        = 40ms;
		s.confirmTimeout = 150ms;
		s.discoveryRetry = 30ms;
		core = std::make_unique< Core >(
			api, transport, s, [this](const std::string &u) { openedUrl = u; opened++; },
			[this](const std::string &u) { std::lock_guard< std::mutex > l(pm); return paired.count(u) > 0; },
			[this](const std::string &u) { std::lock_guard< std::mutex > l(pm); paired.insert(u); });
		api.core = core.get();
		core->start();
	}

	/** synchronisiert, verbunden und vom Dienst begrüßt */
	void ready(const std::string &welcome = R"({"v":1,"type":"welcome"})") {
		core->onSynchronized();
		REQUIRE(eventually([&] { return transport.connectCount() == 1; }));
		core->onTransportOpen();
		REQUIRE(eventually([&] { return !transport.of("hello").empty(); }));
		core->onTransportMessage(welcome);
		REQUIRE(eventually([&] { return core->helloAcknowledged(); }));
	}

	void command(const std::string &id, const json &body) {
		core->onTransportMessage(json{ { "v", 1 }, { "type", "command" }, { "id", id }, { "body", body } }.dump());
	}

	std::string resultOf(const std::string &id) {
		std::string r;
		eventually([&] {
			auto j = transport.result(id);
			if (j) r = (*j)["result"];
			return j.has_value();
		});
		return r;
	}
};

} // namespace

TEST_CASE("talkingStateName") {
	CHECK(*talkingStateName(0) == "passive");
	CHECK(*talkingStateName(1) == "talking");
	CHECK(*talkingStateName(4) == "talking-muted");
	CHECK_FALSE(talkingStateName(-1).has_value());
}

TEST_CASE("Adresse aus der Root-Beschreibung, hello erst nach dem Verbindungsaufbau") {
	Fixture f;
	f.api.description = { Description::Status::Ok, "<p>Wichtig für Ruumble:</p><p>- ruumble: http://r.test/</p><p>Danke.</p>" };
	f.core->onSynchronized();
	REQUIRE(eventually([&] { return f.transport.connectCount() == 1; }));
	CHECK(f.transport.connects[0] == "http://r.test");
	std::this_thread::sleep_for(50ms);
	CHECK(f.transport.of("hello").empty());
	f.core->onTransportOpen();
	REQUIRE(eventually([&] { return f.transport.of("hello").size() == 1; }));
	const auto hello = f.transport.of("hello")[0];
	CHECK(hello["session"] == 7);
	CHECK(hello["certHash"] == HASH);
	CHECK(hello["paired"] == false);
}

TEST_CASE("Kopplungslink nur einmal je Dienst öffnen") {
	Fixture f;
	f.ready(R"({"v":1,"type":"welcome","pairUrl":"https://r.test/pair?code=x"})");
	REQUIRE(eventually([&] { return f.opened == 1; }));
	CHECK(f.openedUrl == "https://r.test/pair?code=x");
	CHECK(f.paired.count("http://r.test") == 1);
	// erneuter Sync mit derselben Adresse: kein neuer Verbindungsaufbau, hello mit paired=true
	f.core->onSynchronized();
	REQUIRE(eventually([&] { return f.transport.of("hello").size() == 2; }));
	CHECK(f.transport.connectCount() == 1);
	CHECK(f.transport.of("hello")[1]["paired"] == true);
	f.core->onTransportMessage(R"({"v":1,"type":"welcome","pairUrl":"https://r.test/pair?code=y"})");
	std::this_thread::sleep_for(50ms);
	CHECK(f.opened == 1);
}

TEST_CASE("Beschreibung noch nicht geladen: einmal Hinweis, dann erneut prüfen") {
	Fixture f;
	f.api.description = { Description::Status::Pending, "" };
	f.core->onSynchronized();
	REQUIRE(eventually([&] { std::lock_guard< std::mutex > l(f.api.m); return !f.api.logs.empty(); }));
	std::this_thread::sleep_for(100ms);
	CHECK(f.transport.connectCount() == 0);
	{
		std::lock_guard< std::mutex > l(f.api.m);
		CHECK(f.api.logs.size() == 1); // Hinweis nur einmal
		CHECK(f.api.logs[0].find("„Musterhaus“") != std::string::npos);
		f.api.description = { Description::Status::Ok, "ruumble: r.test:8080" };
	}
	REQUIRE(eventually([&] { return f.transport.connectCount() == 1; }));
	CHECK(f.transport.connects[0] == "http://r.test:8080");
}

TEST_CASE("feste Adresse aus plugin.json übersteuert die Beschreibung") {
	Fixture f(std::string("http://fest.test"));
	f.api.description = { Description::Status::Ok, "ruumble: http://beschreibung.test" };
	f.core->onSynchronized();
	REQUIRE(eventually([&] { return f.transport.connectCount() == 1; }));
	CHECK(f.transport.connects[0] == "http://fest.test");
}

TEST_CASE("ohne ruumble-Zeile keine Verbindung, Trennung von Mumble trennt auch den Dienst") {
	Fixture f;
	f.api.description = { Description::Status::Ok, "Willkommen!" };
	f.core->onSynchronized();
	std::this_thread::sleep_for(80ms);
	CHECK(f.transport.connectCount() == 0);
	f.api.description = { Description::Status::Ok, "ruumble: http://r.test" };
	f.core->onSynchronized();
	REQUIRE(eventually([&] { return f.transport.connectCount() == 1; }));
	f.core->onDisconnected();
	REQUIRE(eventually([&] { std::lock_guard< std::mutex > l(f.transport.m); return f.transport.disconnects == 1; }));
}

TEST_CASE("Befehle vor welcome und ungültige Nachrichten werden ignoriert") {
	Fixture f;
	f.core->onSynchronized();
	REQUIRE(eventually([&] { return f.transport.connectCount() == 1; }));
	f.core->onTransportOpen();
	f.command("c1", { { "cmd", "join" }, { "channel", 2 } });
	f.core->onTransportMessage("kaputt");
	f.core->onTransportMessage(R"({"v":2,"type":"welcome"})");
	std::this_thread::sleep_for(80ms);
	CHECK(f.transport.of("result").empty());
	CHECK(f.api.moveCount() == 0);
	CHECK_FALSE(f.core->helloAcknowledged());
}

TEST_CASE("join: bestätigt → ok") {
	Fixture f;
	f.ready();
	f.command("c1", { { "cmd", "join" }, { "channel", 2 } });
	CHECK(f.resultOf("c1") == "ok");
	CHECK(f.api.moveCount() == 1);
}

TEST_CASE("join in den eigenen Kanal → sofort ok ohne API-Aufruf") {
	Fixture f;
	f.ready();
	f.command("c1", { { "cmd", "join" }, { "channel", 1 } });
	CHECK(f.resultOf("c1") == "ok");
	CHECK(f.api.moveCount() == 0);
}

TEST_CASE("join ohne Bestätigung: eine Wiederholung, dann rejected") {
	Fixture f;
	f.api.confirmMoves = false;
	f.ready();
	f.command("c1", { { "cmd", "join" }, { "channel", 2 } });
	CHECK(f.resultOf("c1") == "rejected");
	CHECK(f.api.moveCount() == 2);
}

TEST_CASE("der letzte Wechsel gewinnt") {
	Fixture f;
	f.api.confirmMoves = false;
	f.ready();
	f.command("c1", { { "cmd", "join" }, { "channel", 2 } });
	REQUIRE(eventually([&] { return f.api.moveCount() == 1; }));
	f.api.confirmMoves = true;
	f.command("c2", { { "cmd", "join" }, { "channel", 3 } });
	f.command("c3", { { "cmd", "join" }, { "channel", 4 } });
	CHECK(f.resultOf("c1") == "superseded");
	CHECK(f.resultOf("c2") == "superseded");
	CHECK(f.resultOf("c3") == "ok");
	CHECK(f.api.channel == 4);
}

TEST_CASE("Abstand zwischen Statusänderungen, keine Änderung ohne Bedarf") {
	Fixture f;
	f.ready();
	f.command("m1", { { "cmd", "mute" }, { "on", true } });
	f.command("m2", { { "cmd", "mute" }, { "on", true } });
	f.command("d1", { { "cmd", "deaf" }, { "on", true } });
	CHECK(f.resultOf("m1") == "ok");
	CHECK(f.resultOf("m2") == "ok");
	CHECK(f.resultOf("d1") == "ok");
	std::lock_guard< std::mutex > l(f.api.m);
	REQUIRE(f.api.changes.size() == 2); // m2 änderte nichts
	CHECK(f.api.changes[1].second - f.api.changes[0].second >= 40ms);
	CHECK_FALSE(f.transport.of("selfState").empty());
}

TEST_CASE("talking nur nach welcome, als Text") {
	Fixture f;
	f.core->onSynchronized();
	REQUIRE(eventually([&] { return f.transport.connectCount() == 1; }));
	f.core->onTransportOpen();
	f.core->onTalking(8, 1);
	std::this_thread::sleep_for(50ms);
	CHECK(f.transport.of("talking").empty());
	f.core->onTransportMessage(R"({"v":1,"type":"welcome"})");
	f.core->onTalking(8, 1);
	f.core->onTalking(8, -1); // INVALID wird nicht gesendet
	REQUIRE(eventually([&] { return f.transport.of("talking").size() == 1; }));
	CHECK(f.transport.of("talking")[0]["state"] == "talking");
}

TEST_CASE("Trennung von Mumble: offene Befehle offline, bye") {
	Fixture f;
	f.api.confirmMoves = false;
	f.ready();
	f.command("c1", { { "cmd", "join" }, { "channel", 2 } });
	REQUIRE(eventually([&] { return f.api.moveCount() == 1; }));
	f.core->onDisconnected();
	CHECK(f.resultOf("c1") == "offline");
	CHECK(eventually([&] { return f.transport.of("bye").size() == 1; }));
}

TEST_CASE("stop beendet den Worker zügig") {
	Fixture f;
	f.ready();
	const auto start = Clock::now();
	f.core->stop();
	CHECK(Clock::now() - start < 200ms);
}

TEST_CASE("findBridgeUrl: Zeile, die auf „ruumble: <adresse>“ endet") {
	// Beispiel des Auftraggebers (Klartext mit Begleittext)
	CHECK(*findBridgeUrl("HIer ein paart wichtige Konfigurationen für Ruumble:\n \nruumble: http://192.168.1.179:8080\n\nDanke. Bert.")
		  == "http://192.168.1.179:8080");
	CHECK(*findBridgeUrl("- ruumble: http://192.168.1.179:8080") == "http://192.168.1.179:8080");
	CHECK(*findBridgeUrl("Etwas davor ruumble: https://ruumble.example/  ") == "https://ruumble.example");
	CHECK(*findBridgeUrl("RUUMBLE: 10.0.0.5:8080") == "http://10.0.0.5:8080");
	// so speichert Mumble Beschreibungen: HTML
	CHECK(*findBridgeUrl("<!DOCTYPE HTML><html><body><p>Hallo</p><p>-&nbsp;ruumble: http://h:8080</p></body></html>") == "http://h:8080");
	CHECK(*findBridgeUrl("Hallo<br/>ruumble: http://h:8080<br>Danke") == "http://h:8080");
	CHECK(*findBridgeUrl("ruumble: <a href=\"http://h:8080\">http://h:8080</a>") == "http://h:8080");
	CHECK(*findBridgeUrl("zeile1\r\nruumble: http://h\r\n") == "http://h");
	// keine Treffer
	CHECK_FALSE(findBridgeUrl("").has_value());
	CHECK_FALSE(findBridgeUrl("Ruumble läuft unter http://h").has_value());
	CHECK_FALSE(findBridgeUrl("ruumble: http://h danke").has_value()); // Zeile endet nicht mit der Adresse
	CHECK_FALSE(findBridgeUrl("xruumble: http://h").has_value());
	CHECK_FALSE(findBridgeUrl("ruumble: ftp://h").has_value());
	CHECK_FALSE(findBridgeUrl("ruumble:").has_value());
	// erste passende Zeile gewinnt
	CHECK(*findBridgeUrl("ruumble: http://a\nruumble: http://b") == "http://a");
}
