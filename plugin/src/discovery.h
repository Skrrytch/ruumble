// Adresse des Ruumble-Dienstes aus der Beschreibung des Root-Kanals (ADR-0010).
// Gesucht wird eine Zeile, die auf „ruumble: <adresse>“ endet; davor darf beliebiger Text stehen (z. B. „- “).
#pragma once
#include <optional>
#include <string>

namespace ruumble {

/** Mumble-Beschreibung (HTML oder Text) → Basis-URL (http/https, ohne abschließenden Schrägstrich) */
std::optional< std::string > findBridgeUrl(const std::string &description);

} // namespace ruumble
