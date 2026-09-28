// Sprache der Plugin-Meldungen im Mumble-Protokoll: Deutsch, sonst Englisch (wie die Oberfläche).
// Die Plugin-API verrät Mumbles eigene Sprache nicht; maßgeblich ist deshalb die Systemumgebung.
#pragma once

#include <string>

namespace ruumble {

enum class Locale { de, en };

/** POSIX-Reihenfolge: LC_ALL vor LC_MESSAGES vor LANG; „de…“ → Deutsch, alles andere → Englisch */
Locale localeFromEnv(const char *lcAll, const char *lcMessages, const char *lang);
/** „de“ / „en“, so wie der Dienst es erwartet */
const char *localeName(Locale locale);

namespace text {
	std::string connected(Locale l);
	std::string rejected(Locale l, const std::string &reason);
	std::string noCertificate(Locale l);
	std::string hoverRoot(Locale l, const std::string &rootName);
} // namespace text

} // namespace ruumble
