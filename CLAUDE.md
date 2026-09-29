# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Ruumble is an alternative web UI for Mumble that shows a server's channels as an office building. Voice stays in the regular Mumble client; Mumble itself is never modified or forked (ADR-0009).

## Commands

pnpm workspace (`protocol`, `bridge`, `web`), Node 22, pnpm via `corepack enable`.

```sh
pnpm install
pnpm lint && pnpm test && pnpm build        # all packages (what CI runs)
pnpm -F @ruumble/web e2e                     # Playwright against the mock (builds + previews on :4173)
pnpm -F @ruumble/web dev                     # http://localhost:5173, mock adapter by default
pnpm -F @ruumble/bridge dev                  # service with --watch (needs ICE_* env, see bridge/src/main.ts header)
pnpm -F @ruumble/protocol gen:schema         # regenerate protocol/schema/protocol.schema.json after changing protocol/src/index.ts
```

Single tests:

```sh
pnpm -F @ruumble/web exec vitest run test/building.test.ts
pnpm -F @ruumble/bridge exec vitest run test/board.test.ts -t "some name"
pnpm -F @ruumble/web exec playwright test e2e/board.spec.ts
```

Plugin (C++17, CMake ≥ 3.20, needs `libssl-dev`; deps fetched on first configure):

```sh
cmake -S plugin -B plugin/build -DCMAKE_BUILD_TYPE=Release
cmake --build plugin/build -j
plugin/build/ruumble_tests                   # doctest; supports -tc="name" for a single case
```

Local stack with real Mumble + live tests: see `docs/development.md` (`deploy/local/`, `tools/live-test/`, `playwright.live.config.ts`).

Gotchas:
- `bridge` lint/build/dev first run `scripts/gen-ice.mjs`, which generates `bridge/gen/MumbleServer.cjs` from the Ice file (the slice2js CLI is broken, so `compile()` is called directly). Run `pnpm -F @ruumble/bridge gen` if `gen/` is missing.
- `protocol` build is `gen-schema.ts --check`: it fails if the committed JSON Schema is stale.
- `web` lint is `svelte-check --fail-on-warnings`; unit tests run with coverage thresholds of 95% on `src/lib/model/**`, `src/lib/board/model.ts`, `src/lib/board/render.ts`, `src/lib/i18n/**`.
- Files under `third_party/mumble/` are never edited by hand; CI verifies their checksums. Update only via `tools/update-mumble-interfaces.sh <tag>`.

## Architecture

```
Browser ──http(s)/ws──▶ bridge (service) ──Ice, read-only polling──▶ Mumble server
                           ▲
                           │ WebSocket (outbound from plugin)
                        plugin ──plugin API──▶ Mumble client
```

Each source provides what the other can't (ADR-0001, `docs/mumble-interfaces.md`):
- **Ice** (bridge, read-only secret only): channel tree, users, mute state, listeners, permissions (`canEnter`). Polled, not callback-based (ADR-0002): `bridge/src/poller.ts` — basics every 1 s, listeners every 3 rounds, permissions every 10, server info every 60; only emits on real changes.
- **Plugin**: the user's identity (session + cert hash), talking events, and it *executes* commands (join/mute/deaf) in the user's own client. It only opens an outbound WebSocket; it discovers the service URL from the root channel description (ADR-0010). `plugin/src/core.*` etc. form `ruumble_core` with no Mumble dependency (unit-tested); `plugin.cpp`/`net.cpp` are the Mumble/IXWebSocket glue.
- **bridge** (`bridge/src/`, Fastify): `hub.ts` is the center — connects plugin and UI WebSockets, pairing (`pairing.ts`: one-time link ADR-0004, 6-digit code via `requestPairing` and `/api/pair/*` ADR-0012), forwards commands from a UI to the plugin of the same paired user, builds per-viewer snapshots (`self` and `canEnter` depend on the viewer; `self` is null without a connected paired plugin). Talking events go only to that user's own UIs and are never stored or shared (ADR-0005). `board/` is the per-room board: SQLite + files in `DATA_DIR`, REST under `/api/board`, Mumble-log notices via the plugin's `notify` (ADR-0011). All config is env vars, documented at the top of `bridge/src/main.ts`.
- **protocol** (`protocol/src/index.ts`): zod schemas for every message (`{v: 1, type, ...}`) on `/ws/ui` and `/ws/plugin`, shared by bridge and web; `tasks.ts` is the task-list parser (A2) both use, so they see the same tasks; `fixtures/` are sample snapshots used by the web mock and tests. The plugin does not use zod — it validates on its own, so C++ must be kept in sync by hand.
- **web** (Svelte 5 runes, Vite): the service sends *raw* Mumble data; the building (floors = top-level channels, corridor, rooms, locking rules, hidden linked channels) is derived **only** in `web/src/lib/model/building.ts` as pure functions (ADR-0007). `lib/state.svelte.ts` holds the UI state; no optimistic updates — the own channel changes only with the next snapshot (ADR-0003). `lib/adapter/` has the `MumbleAdapter` interface with `MockAdapter` (fixtures, simulated events; URL params `?fixture=sample|edge-cases|vacant|unpaired` or `?mock`, `?debug`, `?talking=0`, `?paired=0` with code 123456) and `LiveAdapter` (`?live` proxies to a service on 127.0.0.1:64080).

The Docker image (`deploy/Dockerfile`) bundles service, built web UI and the plugin bundle (served under `/download`).

## Conventions

- **i18n** (German + English): web `web/src/lib/i18n/de.ts` is the template defining the `Messages` shape, `en.ts` must match exactly (checked by `test/i18n.test.ts`); plugin texts in `plugin/src/messages.cpp`; board notices in `bridge/src/board/notify.ts`; the pairing-code notice in `bridge/src/pairing.ts`, the `/pair` error page in `bridge/src/main.ts`. Unit tests and both Playwright configs run in English (`en-US`), so tests assert the English texts; `web/test/i18n.test.ts` and `web/e2e/i18n.spec.ts` cover the German UI and switching.
- Everything in the repo is English: code, comments, log messages, test titles and data, commits, PRs and docs. German appears only as the German translation of UI, plugin and notice texts and in the tests that check it.
- Versioning: `bridge/package.json` and `web/package.json` share one version and are bumped together, noted in the commit subject, e.g. `(0.7.2)`; the plugin version lives in `plugin/CMakeLists.txt` (`project(... VERSION ...)`).
- Commit and push directly to `main` (no feature branches or PRs); run `pnpm lint && pnpm test && pnpm build` (plus e2e or plugin tests when touched) before pushing. Decisions with wider impact get an ADR in `docs/decisions/` (short MADR; ADRs Claude decides are marked "proposed"). When code diverges from an ADR, add a "Current state" note instead of rewriting it.
