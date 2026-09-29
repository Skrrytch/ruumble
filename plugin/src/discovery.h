// Address of the Ruumble service from the root channel's description (ADR-0010).
// Looks for a line ending in "ruumble: <address>"; any text may precede it (e.g. "- ").
#pragma once
#include <optional>
#include <string>

namespace ruumble {

/** Mumble description (HTML or text) → base URL (http/https, without trailing slash) */
std::optional< std::string > findBridgeUrl(const std::string &description);

} // namespace ruumble
