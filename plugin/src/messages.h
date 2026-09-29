// Language of the plugin messages in the Mumble log: German, otherwise English (like the web UI).
// The plugin API does not reveal Mumble's own language; the system environment therefore decides.
#pragma once

#include <string>

namespace ruumble {

enum class Locale { de, en };

/** POSIX order: LC_ALL before LC_MESSAGES before LANG; "de…" → German, anything else → English */
Locale localeFromEnv(const char *lcAll, const char *lcMessages, const char *lang);
/** "de" / "en", as the service expects it */
const char *localeName(Locale locale);

namespace text {
	std::string connecting(Locale l, const std::string &url);
	std::string connected(Locale l);
	std::string unreachable(Locale l, const std::string &url, const std::string &reason);
	std::string connectionLost(Locale l);
	std::string rejected(Locale l, const std::string &reason);
	std::string noCertificate(Locale l);
	std::string hoverRoot(Locale l, const std::string &rootName);
} // namespace text

} // namespace ruumble
