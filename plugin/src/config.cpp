#include "config.h"

#include <nlohmann/json.hpp>

#include <cstdlib>
#include <filesystem>
#include <fstream>

#ifdef _WIN32
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#include <shellapi.h>
#include <shlobj.h>
#else
#include <spawn.h>
#include <sys/wait.h>

extern char **environ;
#endif

namespace ruumble {

namespace fs = std::filesystem;

#ifdef _WIN32
namespace {
	std::wstring widen(const std::string &utf8) {
		const int n = MultiByteToWideChar(CP_UTF8, 0, utf8.data(), static_cast< int >(utf8.size()), nullptr, 0);
		std::wstring w(static_cast< size_t >(n), L'\0');
		MultiByteToWideChar(CP_UTF8, 0, utf8.data(), static_cast< int >(utf8.size()), w.data(), n);
		return w;
	}

	std::string narrow(const wchar_t *w) {
		const int n = WideCharToMultiByte(CP_UTF8, 0, w, -1, nullptr, 0, nullptr, nullptr);
		if (n <= 1) return "";
		std::string s(static_cast< size_t >(n - 1), '\0');
		WideCharToMultiByte(CP_UTF8, 0, w, -1, s.data(), n, nullptr, nullptr);
		return s;
	}
} // namespace

// Wide strings throughout: user names with umlauts do not survive the ANSI code page.
fs::path Config::path() {
	if (const wchar_t *p = _wgetenv(L"RUUMBLE_CONFIG"); p && *p) return fs::path(p);
	fs::path base = ".";
	PWSTR appData = nullptr;
	if (SUCCEEDED(SHGetKnownFolderPath(FOLDERID_RoamingAppData, 0, nullptr, &appData))) base = fs::path(appData);
	CoTaskMemFree(appData);
	return base / L"ruumble" / L"plugin.json";
}

std::string systemLanguage() {
	wchar_t name[LOCALE_NAME_MAX_LENGTH] = {};
	if (LCIDToLocaleName(MAKELCID(GetUserDefaultUILanguage(), SORT_DEFAULT), name, LOCALE_NAME_MAX_LENGTH, 0) == 0) return "";
	return narrow(name);
}
#else
fs::path Config::path() {
	if (const char *p = std::getenv("RUUMBLE_CONFIG")) return p;
	const char *xdg  = std::getenv("XDG_CONFIG_HOME");
	const char *home = std::getenv("HOME");
	const fs::path base = xdg && *xdg ? fs::path(xdg) : fs::path(home ? home : ".") / ".config";
	return base / "ruumble" / "plugin.json";
}

std::string systemLanguage() {
	return "";
}
#endif

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
	// older format: "paired": true applied to the fixed address
	if (j.value("paired", false) && c.bridgeUrl) c.pairedWith.insert(*c.bridgeUrl);
	return c;
}

void Config::save() const {
	const fs::path p = path();
	std::error_code ec;
	fs::create_directories(p.parent_path(), ec);
	nlohmann::json j = { { "autoOpen", autoOpen }, { "pairedWith", pairedWith } };
	if (bridgeUrl) j["bridgeUrl"] = *bridgeUrl;
	fs::path tmp = p;
	tmp += ".tmp";
	{
		std::ofstream out(tmp);
		out << j.dump(2) << "\n";
	}
	fs::rename(tmp, p, ec);
}

void openUrl(const std::string &url) {
	if (url.rfind("http://", 0) != 0 && url.rfind("https://", 0) != 0) return;
#ifdef _WIN32
	// the URL is passed as the file to open, never through a shell command line
	ShellExecuteW(nullptr, L"open", widen(url).c_str(), nullptr, nullptr, SW_SHOWNORMAL);
#else
	// sh starts xdg-open in the background and exits immediately; the URL is an argument ($1), never part of the command.
	// This leaves no child process behind that the plugin would still have to wait for after unloading.
	const char *argv[] = { "sh", "-c", "xdg-open \"$1\" >/dev/null 2>&1 &", "sh", url.c_str(), nullptr };
	pid_t pid;
	if (posix_spawnp(&pid, "sh", nullptr, nullptr, const_cast< char *const * >(argv), environ) == 0) {
		int status;
		waitpid(pid, &status, 0);
	}
#endif
}

} // namespace ruumble
