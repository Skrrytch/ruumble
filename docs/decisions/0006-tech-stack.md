# ADR-0006: Tech stack

Status: accepted for Svelte and Node.js, proposed for the rest (2026-09-28)

## Decision
| Component | Technology | Reason |
|---|---|---|
| Web UI `web` | **Svelte 5 + TypeScript + Vite**, tests with **Vitest**, screenshot and E2E tests with **Playwright** | Decision E12. Small, fast, easy to test. |
| Font and icons | **Inter** (SIL OFL), self-hosted, and **Lucide** (`lucide-svelte`, ISC) | Freely licensed. Lucide offers line icons with a 2 px stroke, as the design spec requires. |
| Colours and sizes | design tokens (`tokens.css`) | from the design handoff, with neutral names |
| Service `bridge` | **Node.js LTS + TypeScript**, Ice for JavaScript 3.7 (`ice` 3.7.110 from npm, stubs generated at build time via `require("slice2js").compile()` from `third_party/mumble/src/murmur/MumbleServer.ice`), WebSocket with `ws`, HTTP with `fastify` | Decided. Message types are shared with the web UI. Polling without callbacks is enough (ADR-0002). **Confirmed in S1.** |
| Shared types `protocol` | TypeScript types plus a JSON Schema generated from them | One package for web UI and service. The plugin follows the JSON Schema. |
| Plugin `plugin` | **C++17**, own CMake, plugin API **1.0.x**, WebSocket client **IXWebSocket** (BSD-3, via FetchContent) with OpenSSL, JSON with **nlohmann/json** | Compatible from Mumble 1.4. The Mumble header is added as include path `third_party/mumble/plugins`. |
| Workspace | pnpm workspace in the repo root (`web`, `bridge`, `protocol`), **pnpm 11** via corepack | Shared dependencies, one command for the build. pnpm 12 does not run with the corepack 0.32 shipped with Node 22. |

## Consequences
- **Licence:** `ice` and `slice2js` are licensed under GPL-2.0 (ZeroC, alternatively commercial). The Ruumble code stays BSD-3, and BSD-3 is compatible with the GPL. **A distributed package of the service (e.g. a Docker image) is, as a combined work, subject to GPL-2.0.** This does not apply to the web UI and the plugin, because they do not use Ice. **Accepted by the project owner (E26, 2026-09-28).**
- Web UI, service and types share one language. C++ is used only in the plugin, and the plugin stays small.
- Ice for JavaScript has comparatively few users. The risk is checked early in feasibility study S1 (see [feasibility studies](../internal/feasibility-studies.md)).

Current state (code):
- Icons come from `@lucide/svelte` (the successor package of `lucide-svelte`), Inter from `@fontsource-variable/inter`.
- The design tokens live in `web/src/tokens.css`.
- WebSocket in the service runs via `@fastify/websocket` (built on `ws`).
- The shared types are defined as zod schemas in `protocol/src/index.ts`; `protocol/scripts/gen-schema.ts` generates `protocol/schema/protocol.schema.json` from them.
- The plugin fetches nlohmann/json 3.12.0 and IXWebSocket v12.0.1 via FetchContent.
