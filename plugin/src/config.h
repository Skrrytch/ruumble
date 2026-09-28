// Konfiguration: ~/.config/ruumble/plugin.json (bzw. $XDG_CONFIG_HOME, $RUUMBLE_CONFIG).
#pragma once
#include <optional>
#include <set>
#include <string>

namespace ruumble {

struct Config {
	/** feste Adresse des Dienstes; ohne sie gilt die Beschreibung des Root-Kanals (ADR-0010) */
	std::optional< std::string > bridgeUrl;
	/** Kopplungslink beim ersten Verbinden mit einem Dienst im Browser öffnen (ADR-0004, E21) */
	bool autoOpen = true;
	/** Dienste, mit denen bereits gekoppelt wurde */
	std::set< std::string > pairedWith;

	static std::string path();
	static Config load();
	void save() const;
};

/** öffnet eine URL im Standardbrowser (xdg-open, ohne Shell-Interpolation) */
void openUrl(const std::string &url);

} // namespace ruumble
