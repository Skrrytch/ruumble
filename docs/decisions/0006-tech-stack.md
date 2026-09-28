# ADR-0006: Tech-Stack

Status: angenommen für Svelte und Node.js, vorgeschlagen für den Rest (28.09.2026)

## Entscheidung
| Komponente | Technik | Begründung |
|---|---|---|
| Oberfläche `web` | **Svelte 5 + TypeScript + Vite**, Tests mit **Vitest**, Screenshot- und E2E-Tests mit **Playwright** | Entscheidung E12. Klein, schnell, gut testbar |
| Schrift und Icons | **Inter** (SIL OFL), selbst gehostet, und **Lucide** (`lucide-svelte`, ISC) | Frei lizenziert. Lucide bietet Linien-Icons mit 2 px Strich, wie in SPEC 8 gefordert. |
| Farben und Maße | `docs/design/tokens.css` | aus der Designübergabe, mit neutralen Namen |
| Dienst `bridge` | **Node.js LTS + TypeScript**, Ice for JavaScript 3.7 (`ice` 3.7.110 von npm, Stubs zur Build-Zeit per `require("slice2js").compile()` aus `third_party/mumble/src/murmur/MumbleServer.ice`), WebSocket mit `ws`, HTTP mit `fastify` | Entscheidung. Nachrichtentypen werden mit der Oberfläche geteilt. Polling ohne Callbacks reicht (ADR-0002). **In S1 bestätigt.** |
| Gemeinsame Typen `protocol` | TypeScript-Typen plus daraus erzeugtes JSON-Schema | Ein Paket für Oberfläche und Dienst. Das Plugin richtet sich nach dem JSON-Schema. |
| Plugin `plugin` | **C++17**, eigenes CMake, Plugin-API **1.0.x**, WebSocket-Client **IXWebSocket** (BSD-3, per FetchContent) mit OpenSSL, JSON mit **nlohmann/json** | Kompatibel ab Mumble 1.4. Der Mumble-Header kommt als Include-Pfad `third_party/mumble/plugins` hinein. |
| Workspace | pnpm-Workspace im Repo-Root (`web`, `bridge`, `protocol`), **pnpm 11** über corepack | Gemeinsame Abhängigkeiten, ein Befehl für den Build. pnpm 12 läuft nicht mit dem corepack 0.32 aus Node 22. |

## Konsequenzen
- **Lizenz:** `ice` und `slice2js` stehen unter GPL-2.0 (ZeroC, alternativ kommerziell). Der Ruumble-Code bleibt BSD-3, und BSD-3 ist mit der GPL verträglich. **Ein verteiltes Paket des Dienstes (z. B. ein Docker-Image) unterliegt als Gesamtwerk aber der GPL-2.0.** Für Oberfläche und Plugin gilt das nicht, weil sie Ice nicht nutzen. **Vom Auftraggeber akzeptiert (E26, 28.09.2026).**
- Für Oberfläche, Dienst und Typen gibt es eine gemeinsame Sprache. C++ kommt nur im Plugin vor, und das bleibt klein.
- Für Ice for JavaScript gibt es vergleichsweise wenige Nutzer. Das Risiko wird mit Machbarkeitstest S1 früh geprüft.
