# Developer guide

## Requirements

| Tool | Version | Used for |
|---|---|---|
| Node.js | 22 (see `.nvmrc`) | service, web UI, protocol |
| pnpm | via corepack (`corepack enable`), version from `package.json` | package management (workspace) |
| CMake, g++ | CMake ≥ 3.20, C++17 | plugin |
| OpenSSL headers | e.g. `libssl-dev` | plugin (WebSocket over TLS) |
| Docker | current | local stack with a real Mumble, live tests, image |

On the first CMake run the plugin downloads its dependencies (nlohmann/json, IXWebSocket, doctest).

## Layout

| Folder | Contents |
|---|---|
| `protocol/` | messages between plugin, service and web UI (zod), fixtures, generated JSON Schema |
| `bridge/` | service (Node, Fastify): read-only Ice, WebSocket, board (SQLite) |
| `web/` | web UI (Svelte 5, Vite): building, elevator, board; mock adapter for development |
| `plugin/` | Mumble plugin (C++17, plugin API 1.0) |
| `third_party/mumble/` | the two interface files from Mumble, unmodified ([README](../third_party/mumble/README.md)) |
| `deploy/` | Dockerfile (with `Dockerfile.dockerignore`), Compose templates for operation, local stack for tests |
| `tools/` | `update-mumble-interfaces.sh`; `live-test/`: setup script, test bot and client images for live tests |
| `docs/` | architecture decisions, analyses, guides |

## Build and test

```sh
corepack enable
pnpm install
pnpm lint && pnpm test && pnpm build      # all packages: type checks, unit tests, build
pnpm -F @ruumble/web e2e                   # browser tests (Playwright) against the mock
```

Plugin:

```sh
cmake -S plugin -B plugin/build -DCMAKE_BUILD_TYPE=Release
cmake --build plugin/build -j
(cd plugin/build && ctest --output-on-failure)
# → plugin/build/ruumble-<version>.mumble_plugin
```

Service image (contains the web UI and the plugin):

```sh
docker build -f deploy/Dockerfile -t ruumble:<version> .
```

## Developing the web UI

```sh
pnpm -F @ruumble/web dev                   # http://localhost:5173
```

In the dev server the web UI runs against the **mock** by default (a simulated Mumble with sample data). URL parameters:

| Parameter | Effect |
|---|---|
| `?fixture=sample` / `edge-cases` / `vacant` / `unpaired` | choose sample data (sample building / edge cases / vacant / not paired) |
| `?paired=0` | browser not paired yet: "Pair this browser", code `123456` pairs (ADR-0012) |
| `?debug` | debug panel (switch fixture, disconnect plugin, create channels …) |
| `?talking=0` | turn off simulated talking events |
| `?live` | against a running service on `127.0.0.1:64080` (proxy for `/ws`, `/api`, `/avatar`, `/download`, `/pair`) |

## Translations

The web UI, the plugin and the board notices speak German and English.

- **Web UI:** `web/src/lib/i18n/`. `de.ts` is the template and defines the shape (`Messages`); `en.ts` must have exactly the same shape. `t()` from `index.svelte.ts` returns the dictionary of the current language (reactive). Detection: the first of the browser's languages (`navigator.languages`) that is German or English wins, otherwise English; a choice made with the language button in the user menu overrides this and is stored in the browser. The unit test `web/test/i18n.test.ts` checks that both dictionaries match.
- **Plugin:** messages in `plugin/src/messages.cpp`. The language comes from `LC_ALL`, then `LC_MESSAGES`, then `LANG`: `de…` gives German, anything else English.
- **Board notices** in the Mumble log: `bridge/src/board/notify.ts`, in the language each recipient's plugin reports (German if none is reported).
- **Browser tests:** `web/playwright.config.ts` and `web/playwright.live.config.ts` pin the browser locale to `en-US`, so tests match English texts. `web/e2e/i18n.spec.ts` covers the German UI (with a `de-DE` browser) and the language switch in both directions.

## Local stack with a real Mumble

`deploy/local/` starts a Mumble server (default 1.6.870) with fixed **test** secrets and the Ruumble service:

```sh
docker compose -f deploy/local/docker-compose.yml up -d --build
(cd tools/live-test && pnpm install && pnpm gen && node src/setup.cjs)   # channels, permissions, description
# web UI: http://127.0.0.1:64080 – pair through a test client:
deploy/local/run-client.sh ubuntu Anna     # headless Mumble client with plugin; pairing link in deploy/local/out/Anna/pair-url.txt
```

Build the client images once: see [tools/live-test/README.md](../tools/live-test/README.md).

Environment variables for the local stack:

| Variable | Used by | Default | Effect |
|---|---|---|---|
| `MUMBLE_VERSION` | `deploy/local/docker-compose.yml` | `v1.6.870` | Docker tag of `mumblevoip/mumble-server` |
| `CLIENT_LANG` | `deploy/local/run-client.sh` | `de_DE.UTF-8` | `LANG` of the test client, and thus the plugin's language (e.g. `CLIENT_LANG=en_US.UTF-8`) |
| `BRIDGE_URL` | `deploy/local/run-client.sh` | `http://ruumble:64080` | fixed service address for the plugin; empty = discover it from the root channel description |
| `PLUGIN_DIR` | `deploy/local/run-client.sh` | `plugin/build` | directory with another plugin build |

## Live tests

Real Mumble server, real service, headless clients with the real plugin:

```sh
pnpm -F @ruumble/web exec playwright test -c playwright.live.config.ts
RUUMBLE_CLIENT=fedora pnpm -F @ruumble/web exec playwright test -c playwright.live.config.ts   # other client
```

Prerequisites: the local stack is running, `plugin/build` is built, the client images exist. Another server version: `MUMBLE_VERSION=v1.5.735 docker compose -f deploy/local/docker-compose.yml up -d` (run `down -v` first; older servers cannot read the database of newer ones).

On GitHub the live tests run as the workflow `.github/workflows/live.yml`: weekly against servers 1.5.735, 1.6.870 and `latest` (Ubuntu client) and 1.6.870 with Debian and Fedora clients; also manually with any server tag, and after a new Mumble release (triggered by `mumble-release-watch.yml`).

## Updating the Mumble interfaces

A weekly GitHub workflow (`mumble-release-watch.yml`) reports new Mumble releases as an issue, with the diff of the interface files, and starts the live tests against the new release. This also catches behaviour changes that a diff does not show. To take over a release:

```sh
tools/update-mumble-interfaces.sh v1.6.870     # desired tag
```

Then check the changes against [mumble-interfaces.md](mumble-interfaces.md) and run the live tests. The files under `third_party/mumble/` are never edited by hand; CI checks their checksums.

## Contributing

- New work on its own branch from `main`, commit messages in English, then a pull request.
- CI (`.github/workflows/ci.yml`) checks interfaces, lint, tests, build, browser tests and the plugin.
- Record decisions with wider impact as an ADR under [decisions/](decisions/README.md).
