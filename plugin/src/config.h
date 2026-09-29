// Configuration: ~/.config/ruumble/plugin.json (or $XDG_CONFIG_HOME, $RUUMBLE_CONFIG),
// on Windows %APPDATA%\ruumble\plugin.json (or %RUUMBLE_CONFIG%).
#pragma once
#include <filesystem>
#include <optional>
#include <set>
#include <string>

namespace ruumble {

struct Config {
	/** fixed address of the service; without it, the root channel's description applies (ADR-0010) */
	std::optional< std::string > bridgeUrl;
	/** open the pairing link in the browser on first connecting to a service (ADR-0004, E21) */
	bool autoOpen = true;
	/** services already paired with */
	std::set< std::string > pairedWith;

	static std::filesystem::path path();
	static Config load();
	void save() const;
};

/** opens a URL in the default browser (xdg-open or ShellExecute, without shell interpolation) */
void openUrl(const std::string &url);

/** Windows display language as a tag like "de-DE"; empty on Linux, where the environment decides */
std::string systemLanguage();

} // namespace ruumble
