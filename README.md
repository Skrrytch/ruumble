# Ruumble

Eine alternative Oberfläche für [Mumble](https://www.mumble.info/). Ruumble zeigt die Kanäle eines Mumble-Servers als **Bürogebäude**: Etagen, Flure und Büros, in denen die Personen sitzen. Ein Klick auf einen Raum wechselt den Kanal.

- Kanäle der 1. Ebene werden zu **Etagen**, der Etagenkanal selbst ist der **Flur**.
- Kanäle der 2. Ebene werden zu **Räumen**.
- Etagen mit tieferer Struktur oder mehr als 8 Räumen sind im Aufzug gesperrt.
- Die Reihenfolge kommt aus dem Feld **Position** der Kanäle in Mumble; der erste Kanal ist das Erdgeschoss.

Außerdem:
- **Anwesenheit:** Sprechanzeige, Stumm und Taub, „still“ und „abwesend“, Mitlauschen, Aufnahme, Avatare aus Mumble.
- **Pinnwand** in jedem Raum: Text (Markdown), Quellcode mit Hervorhebung, Bilder mit Vollbild und Zoom, Dateien bis 10 MB. Wer im Raum ist, sieht und bearbeitet sie; die anderen Anwesenden bekommen einen Hinweis im Mumble-Protokoll.

> **Status:** Version 0.6 (Dienst und Oberfläche), Plugin 0.3. Im Einsatz auf einem privaten Homeserver. Stand der Arbeitspakete: [docs/FEINPLANUNG.md](docs/FEINPLANUNG.md).

## Architektur

```
Browser/PWA ──wss──▶ Ruumble-Dienst ──Ice (nur lesen)──▶ Mumble-Server
                         ▲
                         │ wss (ausgehend)
                    Ruumble-Plugin ──Plugin-API──▶ Mumble-Client (Audio unverändert)
```

- **Mumble bleibt unverändert.** Ruumble nutzt den normalen Mumble-Client und das offizielle Server-Image.
- **Plugin** (`plugin/`): Liefert die eigene Identität und das Sprechen, führt Kanalwechsel, Stumm und Taub im eigenen Client aus.
- **Dienst** (`bridge/`): Liest Kanalbaum und Nutzerstatus per Ice **nur lesend**, liefert die Oberfläche aus und leitet Befehle an das Plugin weiter.
- **Oberfläche** (`web/`): Svelte. Das Gebäude wird dort aus dem Kanalbaum abgeleitet.

Die Begründungen stehen in den [Architekturentscheidungen](docs/decisions/README.md).

## Betrieb und Installation

1. **Dienst** als Docker-Container neben dem Mumble-Server, mit dem Ice-**Read**-Secret (nie dem Write-Secret). Vorlage und Ablauf: [deploy/homeserver/](deploy/homeserver/README.md).
2. **Adresse bekanntgeben:** Eine Zeile in der Beschreibung des obersten Kanals, die auf `ruumble: <adresse>` endet, z. B. `ruumble: http://192.0.2.10:8080` (ADR-0010).
3. **Plugin** für jeden Nutzer: `http://<dienst>/download` lädt `ruumble-<version>.mumble_plugin`; Doppelklick oder in Mumble unter Einstellungen → Plugins installieren. Beim ersten Verbinden öffnet das Plugin die Oberfläche mit einem Kopplungslink.

## Entwickeln

Voraussetzungen: Node 22 und corepack (`corepack enable`).

```sh
pnpm install
pnpm -F @ruumble/web dev          # Oberfläche gegen den Mock: http://localhost:5173/?debug
pnpm lint && pnpm test            # Typprüfung und Unit-Tests aller Pakete
pnpm -F @ruumble/web e2e          # Browser-Tests inkl. Layoutvergleich mit dem Prototyp
cmake -S plugin -B plugin/build && cmake --build plugin/build && (cd plugin/build && ctest)   # Plugin
```

Live-Tests gegen einen echten Mumble-Server mit headless Clients: [tools/live-test/](tools/live-test/README.md) und `web/playwright.live.config.ts`.

URL-Parameter der Oberfläche, solange sie gegen den Mock läuft:
- `?fixture=musterhaus|sonderfaelle|leerstand|nicht-gekoppelt`
- `?debug` für das Debug-Panel
- `?talking=0` schaltet die simulierten Sprechereignisse ab

## Dokumentation

| Dokument | Inhalt |
|---|---|
| [docs/PLANUNG.md](docs/PLANUNG.md) | Ziele, Leitplanken, fachliche Regeln, Entscheidungen, offene Fragen |
| [docs/FEINPLANUNG.md](docs/FEINPLANUNG.md) | Arbeitspakete mit Schritten und Abnahmekriterien |
| [docs/analyse/mumble-schnittstellen.md](docs/analyse/mumble-schnittstellen.md) | Jeder genutzte Mumble-Aufruf, mit Beleg im Mumble-Code |
| [docs/decisions/](docs/decisions/README.md) | Architekturentscheidungen (ADR) |
| [docs/design/](docs/design/README.md) | Designspezifikation, Referenzprototyp, Tokens |

## Abhängigkeit zu Mumble

Aus Mumble werden nur zwei Schnittstellendateien übernommen, unverändert und festgelegt auf ein Release: [third_party/mumble/](third_party/mumble/README.md).

## Lizenz

[BSD-3-Clause](LICENSE). Die Dateien unter `third_party/mumble/` stehen unter der BSD-3-Lizenz von Mumble (© The Mumble Developers).

Der Dienst nutzt Ice for JavaScript (GPL-2.0). Ein verteiltes Docker-Image des Dienstes ist deshalb als Gesamtwerk GPL-2.0 (ADR-0006); für Oberfläche und Plugin gilt das nicht.
