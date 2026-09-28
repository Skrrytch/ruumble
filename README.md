# Ruumble

Eine alternative Oberfläche für [Mumble](https://www.mumble.info/): Ruumble zeigt die Kanäle eines Mumble-Servers als **Bürogebäude** im Browser. Man sieht, wer wo sitzt, wechselt per Klick den Raum und heftet Notizen, Code, Bilder und Dateien an die Pinnwand des Raums. Gesprochen wird weiter über den normalen Mumble-Client.

## Anleitungen

| Für wen | Anleitung |
|---|---|
| **Nutzer**: Plugin installieren, koppeln, bedienen | [docs/anleitung.md](docs/anleitung.md) |
| **Betreiber** eines Mumble-Servers: Ruumble daneben einrichten | [docs/betrieb.md](docs/betrieb.md) |
| **Entwickler**: bauen, testen, mitarbeiten | [docs/entwicklung.md](docs/entwicklung.md) |

![Ruumble: eine Etage mit Räumen, Aufzug und Pinnwand](docs/images/ruumble.png)

## Was Ruumble kann

- Kanäle der 1. Ebene werden zu **Etagen**, der Etagenkanal selbst ist der **Flur**, Kanäle der 2. Ebene sind **Räume**. Die Reihenfolge kommt aus dem Feld **Position** in Mumble; der erste Kanal ist das Erdgeschoss.
- Etagen mit tieferer Struktur oder mehr als 8 Räumen sind im Aufzug gesperrt, verlinkte Kanäle werden ausgeblendet.
- **Anwesenheit:** Sprechanzeige, stumm und taub, „still“ und „abwesend“, Mitlauschen, Aufnahme, Avatare aus Mumble.
- **Pinnwand** in jedem Raum: Text (Markdown), Quellcode mit Hervorhebung, Bilder mit Vollbild und Zoom, Dateien bis 10 MB. Wer im Raum ist, sieht und bearbeitet sie; die anderen bekommen einen Hinweis im Mumble-Protokoll.

**Voraussetzungen:** Mumble-Server ab 1.5 mit aktiviertem Ice, Mumble-Client ab 1.4 unter Linux. Details: [docs/betrieb.md](docs/betrieb.md#voraussetzungen).

> **Status:** Version 0.6 (Dienst und Oberfläche), Plugin 0.3. Stand der Arbeitspakete: [docs/FEINPLANUNG.md](docs/FEINPLANUNG.md).

## Architektur

```
Browser ──http(s)──▶ Ruumble-Dienst ──Ice (nur lesen)──▶ Mumble-Server
                          ▲
                          │ WebSocket (ausgehend)
                     Ruumble-Plugin ──Plugin-API──▶ Mumble-Client (Audio unverändert)
```

- **Mumble bleibt unverändert.** Ruumble nutzt den normalen Mumble-Client und das offizielle Server-Image.
- **Plugin** (`plugin/`): liefert die eigene Identität und das Sprechen, führt Kanalwechsel, Stumm und Taub im eigenen Client aus.
- **Dienst** (`bridge/`): liest Kanalbaum und Nutzerstatus per Ice **nur lesend**, liefert die Oberfläche aus, leitet Befehle an das Plugin weiter und speichert die Pinnwand.
- **Oberfläche** (`web/`): Svelte. Das Gebäude wird dort aus dem Kanalbaum abgeleitet.

## Weitere Dokumentation

| Dokument | Inhalt |
|---|---|
| [docs/PLANUNG.md](docs/PLANUNG.md) | Ziele, Leitplanken, fachliche Regeln, Entscheidungen, offene Fragen |
| [docs/FEINPLANUNG.md](docs/FEINPLANUNG.md) | Arbeitspakete mit Schritten und Abnahmekriterien |
| [docs/decisions/](docs/decisions/README.md) | Architekturentscheidungen (ADR) |
| [docs/analyse/mumble-schnittstellen.md](docs/analyse/mumble-schnittstellen.md) | Jeder genutzte Mumble-Aufruf, mit Beleg im Mumble-Code |
| [docs/design/](docs/design/README.md) | Designspezifikation, Referenzprototyp, Tokens |
| [third_party/mumble/](third_party/mumble/README.md) | Die zwei übernommenen Mumble-Schnittstellendateien |

## Lizenz

[BSD-3-Clause](LICENSE). Die Dateien unter `third_party/mumble/` stehen unter der BSD-3-Lizenz von Mumble (© The Mumble Developers).

Der Dienst nutzt Ice for JavaScript (GPL-2.0). Ein verteiltes Docker-Image des Dienstes ist deshalb als Gesamtwerk GPL-2.0 (ADR-0006); für Oberfläche und Plugin gilt das nicht.
