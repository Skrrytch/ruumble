#include "messages.h"

namespace ruumble {

Locale localeFromEnv(const char *lcAll, const char *lcMessages, const char *lang) {
	for (const char *v : { lcAll, lcMessages, lang }) {
		if (!v || !*v) continue;
		const std::string s(v);
		return s.rfind("de", 0) == 0 ? Locale::de : Locale::en;
	}
	return Locale::en;
}

const char *localeName(Locale locale) {
	return locale == Locale::de ? "de" : "en";
}

namespace text {
	std::string connecting(Locale l, const std::string &url) {
		return (l == Locale::de ? "verbinde mit dem Dienst " : "connecting to the service ") + url;
	}
	std::string connected(Locale l) {
		return l == Locale::de ? "mit dem Dienst verbunden" : "connected to the service";
	}
	std::string unreachable(Locale l, const std::string &url, const std::string &reason) {
		return (l == Locale::de ? "Dienst " + url + " nicht erreichbar, neuer Versuch läuft: "
								: "cannot reach the service " + url + ", retrying: ")
			   + reason;
	}
	std::string connectionLost(Locale l) {
		return l == Locale::de ? "Verbindung zum Dienst unterbrochen, verbinde neu"
							   : "connection to the service lost, reconnecting";
	}
	std::string rejected(Locale l, const std::string &reason) {
		return (l == Locale::de ? "vom Dienst abgelehnt (" : "rejected by the service (") + reason + ")";
	}
	std::string noCertificate(Locale l) {
		return l == Locale::de ? "kein Client-Zertifikat, Anmeldung beim Dienst nicht möglich"
							   : "no client certificate, cannot sign in to the service";
	}
	std::string hoverRoot(Locale l, const std::string &rootName) {
		return l == Locale::de ? "Fahre einmal mit der Maus über den obersten Kanal „" + rootName
									 + "“, damit die Ruumble-Adresse aus seiner Beschreibung geladen wird."
							   : "Hover once over the top channel “" + rootName
									 + "” so that the Ruumble address can be loaded from its description.";
	}
} // namespace text

} // namespace ruumble
