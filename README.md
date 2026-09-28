# Ruumble

Eine alternative Oberfläche für [Mumble](https://www.mumble.info/). Ruumble zeigt die Kanäle eines Mumble-Servers als **Bürogebäude**: Etagen, Flure und Büros, in denen die Personen sitzen. Ein Klick auf einen Raum wechselt den Kanal.

- Kanäle der 1. Ebene werden zu **Etagen**, der Etagenkanal selbst ist der **Flur**.
- Kanäle der 2. Ebene werden zu **Räumen**.
- Etagen mit tieferer Struktur oder mehr als 8 Räumen sind im Aufzug gesperrt.

> **Status:** Planung abgeschlossen, Umsetzung beginnt. Siehe [docs/FEINPLANUNG.md](docs/FEINPLANUNG.md).

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
