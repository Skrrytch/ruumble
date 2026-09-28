#include "config.h"

#include <nlohmann/json.hpp>

#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <spawn.h>
#include <sys/wait.h>

extern char **environ;

namespace ruumble {

namespace fs = std::filesystem;

std::string Config::path() {
	if (const char *p = std::getenv("RUUMBLE_CONFIG")) return p;
	const char *xdg  = std::getenv("XDG_CONFIG_HOME");
	const char *home = std::getenv("HOME");
	const fs::path base = xdg && *xdg ? fs::path(xdg) : fs::path(home ? home : ".") / ".config";
	return (base / "ruumble" / "plugin.json").string();
}

Config Config::load() {
	Config c;
	std::ifstream in(path());
	if (!in) return c;
	const auto j = nlohmann::json::parse(in, nullptr, /*allow_exceptions=*/false);
	if (!j.is_object()) return c;
	if (j.contains("bridgeUrl") && j["bridgeUrl"].is_string()) {
		std::string url = j["bridgeUrl"].get< std::string >();
		while (!url.empty() && url.back() == '/') url.pop_back();
		if (!url.empty()) c.bridgeUrl = url;
	}
	c.autoOpen = j.value("autoOpen", c.autoOpen);
	if (j.contains("pairedWith") && j["pairedWith"].is_array())
		for (const auto &u : j["pairedWith"])
			if (u.is_string()) c.pairedWith.insert(u.get< std::string >());
	// ältere Fassung: "paired": true galt für die feste Adresse
	if (j.value("paired", false) && c.bridgeUrl) c.pairedWith.insert(*c.bridgeUrl);
	return c;
}

void Config::save() const {
	const fs::path p = path();
	std::error_code ec;
	fs::create_directories(p.parent_path(), ec);
	nlohmann::json j = { { "autoOpen", autoOpen }, { "pairedWith", pairedWith } };
	if (bridgeUrl) j["bridgeUrl"] = *bridgeUrl;
	const fs::path tmp = p.string() + ".tmp";
	{
		std::ofstream out(tmp);
		out << j.dump(2) << "\n";
	}
	fs::rename(tmp, p, ec);
}

void openUrl(const std::string &url) {
	if (url.rfind("http://", 0) != 0 && url.rfind("https://", 0) != 0) return;
	// sh startet xdg-open im Hintergrund und endet sofort; die URL ist ein Argument ($1), nie Teil des Befehls.
	// So bleibt kein Kindprozess zurück, auf den das Plugin nach dem Entladen noch warten müsste.
	const char *argv[] = { "sh", "-c", "xdg-open \"$1\" >/dev/null 2>&1 &", "sh", url.c_str(), nullptr };
	pid_t pid;
	if (posix_spawnp(&pid, "sh", nullptr, nullptr, const_cast< char *const * >(argv), environ) == 0) {
		int status;
		waitpid(pid, &status, 0);
	}
}

} // namespace ruumble
