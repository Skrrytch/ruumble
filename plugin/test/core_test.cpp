#define DOCTEST_CONFIG_IMPLEMENT_WITH_MAIN
#include <doctest/doctest.h>

#include "core.h"
#include "discovery.h"

#include <nlohmann/json.hpp>

#include <algorithm>
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
			core->onChannelEntered(7, ch); // like Mumble: confirmation arrives as a callback
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
	std::string rootName() override { return "Acme HQ"; }
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
		s.mumbleVersion  = "1.5.735";
		s.locale         = Locale::en;
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

	/** synchronised, connected and welcomed by the service */
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

TEST_CASE("address from the root description, hello only once connected") {
	Fixture f;
	f.api.description = { Description::Status::Ok, "<p>Important for Ruumble:</p><p>- ruumble: http://r.test/</p><p>Thanks.</p>" };
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
	CHECK(hello["mumbleVersion"] == "1.5.735");
	CHECK(hello["locale"] == "en");
}

TEST_CASE("open the pairing link only once per service") {
	Fixture f;
	f.ready(R"({"v":1,"type":"welcome","pairUrl":"https://r.test/pair?code=x"})");
	REQUIRE(eventually([&] { return f.opened == 1; }));
	CHECK(f.openedUrl == "https://r.test/pair?code=x");
	CHECK(f.paired.count("http://r.test") == 1);
	// repeated sync with the same address: no new connection, hello with paired=true
	f.core->onSynchronized();
	REQUIRE(eventually([&] { return f.transport.of("hello").size() == 2; }));
	CHECK(f.transport.connectCount() == 1);
	CHECK(f.transport.of("hello")[1]["paired"] == true);
	f.core->onTransportMessage(R"({"v":1,"type":"welcome","pairUrl":"https://r.test/pair?code=y"})");
	std::this_thread::sleep_for(50ms);
	CHECK(f.opened == 1);
}

TEST_CASE("description not loaded yet: hint once, then check again") {
	Fixture f;
	f.api.description = { Description::Status::Pending, "" };
	f.core->onSynchronized();
	REQUIRE(eventually([&] { std::lock_guard< std::mutex > l(f.api.m); return !f.api.logs.empty(); }));
	std::this_thread::sleep_for(100ms);
	CHECK(f.transport.connectCount() == 0);
	{
		std::lock_guard< std::mutex > l(f.api.m);
		CHECK(f.api.logs.size() == 1); // hint only once
		CHECK(f.api.logs[0].find("“Acme HQ”") != std::string::npos);
		f.api.description = { Description::Status::Ok, "ruumble: r.test:64080" };
	}
	REQUIRE(eventually([&] { return f.transport.connectCount() == 1; }));
	CHECK(f.transport.connects[0] == "http://r.test:64080");
}

TEST_CASE("fixed address from plugin.json overrides the description") {
	Fixture f(std::string("http://fixed.test"));
	f.api.description = { Description::Status::Ok, "ruumble: http://description.test" };
	f.core->onSynchronized();
	REQUIRE(eventually([&] { return f.transport.connectCount() == 1; }));
	CHECK(f.transport.connects[0] == "http://fixed.test");
}

TEST_CASE("no ruumble line, no connection; disconnecting from Mumble also disconnects the service") {
	Fixture f;
	f.api.description = { Description::Status::Ok, "Welcome!" };
	f.core->onSynchronized();
	std::this_thread::sleep_for(80ms);
	CHECK(f.transport.connectCount() == 0);
	f.api.description = { Description::Status::Ok, "ruumble: http://r.test" };
	f.core->onSynchronized();
	REQUIRE(eventually([&] { return f.transport.connectCount() == 1; }));
	f.core->onDisconnected();
	REQUIRE(eventually([&] { std::lock_guard< std::mutex > l(f.transport.m); return f.transport.disconnects == 1; }));
}

TEST_CASE("commands before welcome and invalid messages are ignored") {
	Fixture f;
	f.core->onSynchronized();
	REQUIRE(eventually([&] { return f.transport.connectCount() == 1; }));
	f.core->onTransportOpen();
	f.command("c1", { { "cmd", "join" }, { "channel", 2 } });
	f.core->onTransportMessage("broken");
	f.core->onTransportMessage(R"({"v":2,"type":"welcome"})");
	std::this_thread::sleep_for(80ms);
	CHECK(f.transport.of("result").empty());
	CHECK(f.api.moveCount() == 0);
	CHECK_FALSE(f.core->helloAcknowledged());
}

TEST_CASE("join: confirmed → ok") {
	Fixture f;
	f.ready();
	f.command("c1", { { "cmd", "join" }, { "channel", 2 } });
	CHECK(f.resultOf("c1") == "ok");
	CHECK(f.api.moveCount() == 1);
}

TEST_CASE("join into the own channel → ok at once without an API call") {
	Fixture f;
	f.ready();
	f.command("c1", { { "cmd", "join" }, { "channel", 1 } });
	CHECK(f.resultOf("c1") == "ok");
	CHECK(f.api.moveCount() == 0);
}

TEST_CASE("join without confirmation: one retry, then rejected") {
	Fixture f;
	f.api.confirmMoves = false;
	f.ready();
	f.command("c1", { { "cmd", "join" }, { "channel", 2 } });
	CHECK(f.resultOf("c1") == "rejected");
	CHECK(f.api.moveCount() == 2);
}

TEST_CASE("the last move wins") {
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

TEST_CASE("spacing between state changes, no change unless needed") {
	Fixture f;
	f.ready();
	f.command("m1", { { "cmd", "mute" }, { "on", true } });
	f.command("m2", { { "cmd", "mute" }, { "on", true } });
	f.command("d1", { { "cmd", "deaf" }, { "on", true } });
	CHECK(f.resultOf("m1") == "ok");
	CHECK(f.resultOf("m2") == "ok");
	CHECK(f.resultOf("d1") == "ok");
	std::lock_guard< std::mutex > l(f.api.m);
	REQUIRE(f.api.changes.size() == 2); // m2 changed nothing
	CHECK(f.api.changes[1].second - f.api.changes[0].second >= 40ms);
	CHECK_FALSE(f.transport.of("selfState").empty());
}

TEST_CASE("notify: notice in the Mumble log, only after welcome") {
	Fixture f;
	f.core->onSynchronized();
	REQUIRE(eventually([&] { return f.transport.connectCount() == 1; }));
	f.core->onTransportOpen();
	f.core->onTransportMessage(R"({"v":1,"type":"notify","text":"too early"})");
	f.core->onTransportMessage(R"({"v":1,"type":"welcome"})");
	f.core->onTransportMessage(R"({"v":1,"type":"notify","text":"Ben pinned code to the board."})");
	f.core->onTransportMessage(R"({"v":1,"type":"notify","text":""})");
	REQUIRE(eventually([&] {
		std::lock_guard< std::mutex > l(f.api.m);
		return std::find(f.api.logs.begin(), f.api.logs.end(), "Ben pinned code to the board.") != f.api.logs.end();
	}));
	std::lock_guard< std::mutex > l(f.api.m);
	CHECK(std::find(f.api.logs.begin(), f.api.logs.end(), "too early") == f.api.logs.end());
	CHECK(std::count_if(f.api.logs.begin(), f.api.logs.end(), [](const std::string &s) { return s.empty(); }) == 0);
}

TEST_CASE("connection problems in the Mumble log: address, error once per streak, lost connection") {
	Fixture f;
	const auto count = [&](const std::string &part) {
		std::lock_guard< std::mutex > l(f.api.m);
		return std::count_if(f.api.logs.begin(), f.api.logs.end(), [&](const std::string &s) { return s.find(part) != std::string::npos; });
	};
	f.core->onSynchronized();
	REQUIRE(eventually([&] { return count("connecting to the service http://r.test") == 1; }));
	f.core->onTransportError("SSL handshake failed");
	f.core->onTransportError("SSL handshake failed");
	REQUIRE(eventually([&] { return count("cannot reach the service http://r.test, retrying: SSL handshake failed") == 1; }));
	std::this_thread::sleep_for(50ms);
	CHECK(count("cannot reach") == 1);
	f.core->onTransportOpen();
	f.core->onTransportMessage(R"({"v":1,"type":"welcome"})");
	REQUIRE(eventually([&] { return f.core->helloAcknowledged(); }));
	f.core->onTransportClosed();
	REQUIRE(eventually([&] { return count("connection to the service lost") == 1; }));
	// after a successful connection, a new failure is reported again
	f.core->onTransportError("Connection refused");
	REQUIRE(eventually([&] { return count("cannot reach") == 2; }));
	f.core->onTransportClosed(); // closed without welcome: no second "lost"
	std::this_thread::sleep_for(50ms);
	CHECK(count("connection to the service lost") == 1);
}

TEST_CASE("language: German, otherwise English, POSIX order") {
	CHECK(localeFromEnv(nullptr, nullptr, "de_DE.UTF-8") == Locale::de);
	CHECK(localeFromEnv("en_US.UTF-8", nullptr, "de_DE.UTF-8") == Locale::en); // LC_ALL wins
	CHECK(localeFromEnv("", "de_AT.UTF-8", "en_GB.UTF-8") == Locale::de);       // empty values do not count
	CHECK(localeFromEnv(nullptr, nullptr, "fr_FR.UTF-8") == Locale::en);
	CHECK(localeFromEnv(nullptr, nullptr, "C") == Locale::en);
	CHECK(localeFromEnv(nullptr, nullptr, nullptr) == Locale::en);
	CHECK(text::hoverRoot(Locale::en, "Root").find("“Root”") != std::string::npos);
	CHECK(text::connected(Locale::de) == "mit dem Dienst verbunden");
	CHECK(text::unreachable(Locale::de, "https://r.test", "x") == "Dienst https://r.test nicht erreichbar, neuer Versuch läuft: x");
}

TEST_CASE("talking only after welcome, as text") {
	Fixture f;
	f.core->onSynchronized();
	REQUIRE(eventually([&] { return f.transport.connectCount() == 1; }));
	f.core->onTransportOpen();
	f.core->onTalking(8, 1);
	std::this_thread::sleep_for(50ms);
	CHECK(f.transport.of("talking").empty());
	f.core->onTransportMessage(R"({"v":1,"type":"welcome"})");
	f.core->onTalking(8, 1);
	f.core->onTalking(8, -1); // INVALID is not sent
	REQUIRE(eventually([&] { return f.transport.of("talking").size() == 1; }));
	CHECK(f.transport.of("talking")[0]["state"] == "talking");
}

TEST_CASE("disconnect from Mumble: pending commands offline, bye") {
	Fixture f;
	f.api.confirmMoves = false;
	f.ready();
	f.command("c1", { { "cmd", "join" }, { "channel", 2 } });
	REQUIRE(eventually([&] { return f.api.moveCount() == 1; }));
	f.core->onDisconnected();
	CHECK(f.resultOf("c1") == "offline");
	CHECK(eventually([&] { return f.transport.of("bye").size() == 1; }));
}

TEST_CASE("stop ends the worker promptly") {
	Fixture f;
	f.ready();
	const auto start = Clock::now();
	f.core->stop();
	CHECK(Clock::now() - start < 200ms);
}

TEST_CASE("findBridgeUrl: line ending in “ruumble: <address>”") {
	// plain text with surrounding text, as admins write it (typos included)
	CHECK(*findBridgeUrl("HEre a cuple of importnt settings for Ruumble:\n \nruumble: http://192.0.2.10:64080\n\nThanks.")
		  == "http://192.0.2.10:64080");
	CHECK(*findBridgeUrl("- ruumble: http://192.0.2.10:64080") == "http://192.0.2.10:64080");
	CHECK(*findBridgeUrl("Something before ruumble: https://ruumble.example/  ") == "https://ruumble.example");
	CHECK(*findBridgeUrl("RUUMBLE: 10.0.0.5:64080") == "http://10.0.0.5:64080");
	// this is how Mumble stores descriptions: HTML
	CHECK(*findBridgeUrl("<!DOCTYPE HTML><html><body><p>Hello</p><p>-&nbsp;ruumble: http://h:64080</p></body></html>") == "http://h:64080");
	CHECK(*findBridgeUrl("Hello<br/>ruumble: http://h:64080<br>Thanks") == "http://h:64080");
	CHECK(*findBridgeUrl("ruumble: <a href=\"http://h:64080\">http://h:64080</a>") == "http://h:64080");
	CHECK(*findBridgeUrl("line1\r\nruumble: http://h\r\n") == "http://h");
	// no matches
	CHECK_FALSE(findBridgeUrl("").has_value());
	CHECK_FALSE(findBridgeUrl("Ruumble runs at http://h").has_value());
	CHECK_FALSE(findBridgeUrl("ruumble: http://h thanks").has_value()); // line does not end with the address
	CHECK_FALSE(findBridgeUrl("xruumble: http://h").has_value());
	CHECK_FALSE(findBridgeUrl("ruumble: ftp://h").has_value());
	CHECK_FALSE(findBridgeUrl("ruumble:").has_value());
	// first matching line wins
	CHECK(*findBridgeUrl("ruumble: http://a\nruumble: http://b") == "http://a");
}
