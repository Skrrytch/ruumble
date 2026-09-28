# Anleitung für Entwickler

## Voraussetzungen

| Werkzeug | Version | Wofür |
|---|---|---|
| Node.js | 22 (siehe `.nvmrc`) | Dienst, Oberfläche, Protokoll |
| pnpm | über corepack (`corepack enable`), Version aus `package.json` | Paketverwaltung (Workspace) |
| CMake, g++ | CMake ≥ 3.20, C++17 | Plugin |
| OpenSSL-Header | z. B. `libssl-dev` | Plugin (WebSocket über TLS) |
| Docker | aktuell | lokaler Stack mit echtem Mumble, Live-Tests, Image |

Beim ersten CMake-Lauf lädt das Plugin seine Abhängigkeiten (nlohmann/json, IXWebSocket, doctest) aus dem Netz.

## Aufbau

| Ordner | Inhalt |
|---|---|
| `protocol/` | Nachrichten zwischen Plugin, Dienst und Oberfläche (zod), Fixtures, erzeugtes JSON-Schema |
| `bridge/` | Dienst (Node, Fastify): Ice nur lesend, WebSocket, Pinnwand (SQLite) |
| `web/` | Oberfläche (Svelte 5, Vite): Gebäude, Aufzug, Pinnwand; Mock-Adapter für die Entwicklung |
| `plugin/` | Mumble-Plugin (C++17, Plugin-API 1.0) |
| `third_party/mumble/` | die zwei Schnittstellendateien aus Mumble, unverändert ([README](../third_party/mumble/README.md)) |
| `deploy/` | Dockerfile, Compose-Vorlagen für den Betrieb, lokaler Stack für Tests |
| `tools/live-test/` | Setup-Skript, Test-Bot und Client-Images für Live-Tests |
| `docs/` | Planung, Architekturentscheidungen, Analysen, Design, Anleitungen |

## Bauen und testen

```sh
corepack enable
pnpm install
pnpm lint && pnpm test && pnpm build      # alle Pakete: Typprüfung, Unit-Tests, Build
pnpm -F @ruumble/web e2e                   # Browser-Tests (Playwright) gegen den Mock
```

Plugin:

```sh
cmake -S plugin -B plugin/build -DCMAKE_BUILD_TYPE=Release
cmake --build plugin/build -j
(cd plugin/build && ctest --output-on-failure)
# → plugin/build/ruumble-<version>.mumble_plugin
```

Image des Dienstes (enthält Oberfläche und Plugin):

```sh
docker build -f deploy/Dockerfile -t ruumble:<version> .
```

## Oberfläche entwickeln

```sh
pnpm -F @ruumble/web dev                   # http://localhost:5173
```

Im Dev-Server läuft die Oberfläche standardmäßig gegen den **Mock** (simuliertes Mumble mit Beispieldaten). URL-Parameter:

| Parameter | Wirkung |
|---|---|
| `?fixture=musterhaus` / `sonderfaelle` / `leerstand` / `nicht-gekoppelt` | Beispieldaten wählen |
| `?debug` | Debug-Panel (Fixture wechseln, Plugin trennen, Kanäle anlegen …) |
| `?talking=0` | simulierte Sprechereignisse aus |
| `?live` | gegen einen laufenden Dienst auf `127.0.0.1:8080` (Proxy für `/ws`, `/api`, `/avatar`, `/download`, `/pair`) |

## Lokaler Stack mit echtem Mumble

`deploy/local/` startet einen Mumble-Server 1.6.870 mit festen **Test**-Secrets und den Ruumble-Dienst:

```sh
docker compose -f deploy/local/docker-compose.yml up -d --build
(cd tools/live-test && pnpm install && pnpm gen && node src/setup.cjs)   # Kanäle, Rechte, Beschreibung
# Oberfläche: http://127.0.0.1:8080 – koppeln über einen Test-Client:
deploy/local/run-client.sh ubuntu Anna     # headless Mumble-Client mit Plugin; Kopplungslink in deploy/local/out/Anna/pair-url.txt
```

Die Client-Images einmalig bauen: siehe [tools/live-test/README.md](../tools/live-test/README.md).

## Live-Tests

Echter Mumble-Server, echter Dienst, headless Clients mit dem echten Plugin:

```sh
pnpm -F @ruumble/web exec playwright test -c playwright.live.config.ts
RUUMBLE_CLIENT=fedora pnpm -F @ruumble/web exec playwright test -c playwright.live.config.ts   # anderer Client
```

Voraussetzung: lokaler Stack läuft, `plugin/build` ist gebaut, Client-Images sind vorhanden. Eine andere Server-Version: `MUMBLE_VERSION=v1.5.735 docker compose -f deploy/local/docker-compose.yml up -d` (vorher `down -v`, ältere Server lesen die Datenbank neuerer nicht).

In GitHub laufen die Live-Tests als Workflow `live.yml`: wöchentlich gegen Server 1.5.735, 1.6.870 und `latest` (Ubuntu-Client) sowie 1.6.870 mit Debian- und Fedora-Client, dazu von Hand mit beliebigem Tag.

## Mumble-Schnittstellen aktualisieren

Ein wöchentlicher GitHub-Workflow meldet neue Mumble-Releases als Issue, mit dem Diff der Schnittstellendateien, und startet die Live-Tests gegen das neue Release. So fallen auch Verhaltensänderungen auf, die ein Diff nicht zeigt. Übernehmen:

```sh
scripts/update-mumble-interfaces.sh v1.6.870     # gewünschtes Tag
```

Danach die Änderungen gegen [analyse/mumble-schnittstellen.md](analyse/mumble-schnittstellen.md) prüfen und die Live-Tests laufen lassen. Die Dateien unter `third_party/mumble/` werden nie von Hand geändert; die CI prüft ihre Prüfsummen.

## Beiträge

- Neue Arbeit auf einem eigenen Branch von `main`, Commit-Messages auf Englisch, dann ein Pull Request.
- Die CI (`.github/workflows/ci.yml`) prüft Schnittstellen, Lint, Tests, Build, Browser-Tests und das Plugin.
- Entscheidungen mit Tragweite als ADR unter [decisions/](decisions/README.md) festhalten.
