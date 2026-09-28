// Konfiguration: ~/.config/ruumble/plugin.json (bzw. $XDG_CONFIG_HOME). Fehlende Werte kommen aus dem Build.
#pragma once
#include <string>

#ifndef RUUMBLE_DEFAULT_BRIDGE_URL
#	define RUUMBLE_DEFAULT_BRIDGE_URL "http://127.0.0.1:8080"
#endif

namespace ruumble {

struct Config {
	/** Basis-URL des Dienstes (http/https); die Plugin-API liefert keine Serveradresse (ADR-0008) */
	std::string bridgeUrl = RUUMBLE_DEFAULT_BRIDGE_URL;
	/** Kopplungslink beim ersten Verbinden im Browser öffnen (ADR-0004, E21) */
	bool autoOpen = true;
	/** bereits gekoppelt: kein Link mehr öffnen */
	bool paired = false;

	static std::string path();
	static Config load();
	void save() const;
};

/** öffnet eine URL im Standardbrowser (xdg-open, ohne Shell) */
void openUrl(const std::string &url);

} // namespace ruumble
