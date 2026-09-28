# ADR-0007: Protokoll und Ort der Ableitung

Status: vorgeschlagen (28.09.2026)

## Entscheidung
1. **Transport:** JSON über WebSocket. Jede Nachricht hat die Form `{v: 1, type, ...}`. Es gibt zwei Endpunkte: `/ws/ui` und `/ws/plugin`.
2. **Vollständige Stände statt Einzeländerungen:** Nach jeder Änderung schickt der Dienst den kompletten `snapshot` an die Oberflächen, gebündelt über 100 ms. Bei unter 100 Nutzern und 50 Kanälen sind das wenige KB. Einzeländerungen (Deltas) kommen erst, wenn eine Messung sie nötig macht.
3. **Der Dienst liefert die Mumble-Rohdaten**, also Kanäle mit `parent`, `position` und `links` sowie Nutzer, Mitlauschen und `canEnter`. **Das Gebäude wird in der Oberfläche abgeleitet**, im Modul `building-model` als reine Funktionen. Dort liegen die Regeln aus PLANUNG Abschnitt 2 (Sortierung, Ausblenden verlinkter Kanäle, Sperrgründe, Eingang) an genau einer Stelle und sind mit Unit-Tests abgedeckt.
4. **Adapter-Interface** in der Oberfläche: `MumbleAdapter { snapshot, onChange, join, setSelfMute, setSelfDeaf, onTalking, status }`. Es gibt zwei Umsetzungen: `MockAdapter` (Mock-Daten und simulierte Ereignisse) und `LiveAdapter` (WebSocket zum Dienst).

## Nachrichten (Version 1)
| Richtung | Typ | Inhalt |
|---|---|---|
| Plugin → Dienst | `hello` | `session`, `certHash`, `pluginVersion`, `paired` |
| Dienst → Plugin | `welcome` / `reject` | Bei Ablehnung mit Grund. Optional `pairUrl` |
| Dienst → Plugin | `command` | `id`, `join{channel}` / `mute{on}` / `deaf{on}` |
| Dienst → Plugin | `notify` | `text`: Hinweis für das Mumble-Protokoll, z. B. beim Anheften an der Pinnwand (ADR-0011) |
| Plugin → Dienst | `result` | `id`, `ok` / `rejected` / `superseded` / `timeout` / `offline` |
| Plugin → Dienst | `selfState` | `selfMute`, `selfDeaf` |
| Plugin → Dienst | `talking` | `session`, `state` |
| Plugin → Dienst | `bye` | Mumble wurde getrennt. |
| Oberfläche → Dienst | `command` | wie oben, die Weiterleitung geht an das Plugin mit demselben Hash |
| Dienst → Oberfläche | `snapshot` | `server{name, version}`, `self{session}`, `channels[]`, `users[]` (mit `avatar`, `idleMinutes`, `recording`), `listeners{cid: session[]}`, `canEnter{cid: bool}` |
| Dienst → Oberfläche | `talking`, `result`, `status` | `status` meldet `plugin: connected/disconnected`, optional `preview` |
| Dienst → Oberfläche | `board` | `channelId`: An der Pinnwand dieses Raums hat sich etwas geändert (nur an Anwesende, ohne Inhalt) |

Die Inhalte der Pinnwand laufen nicht über den WebSocket, sondern über REST unter `/api/board` (Beiträge, Uploads, Anhänge; ADR-0011). Die vollständigen Schemas stehen in `protocol/src/index.ts`, das JSON-Schema in `protocol/schema/`.

## Konsequenzen
- Der Dienst bleibt einfach und kennt die Gebäuderegeln nicht. Ändert sich eine Regel, muss nur die Oberfläche angepasst werden.
- Jede Oberfläche rechnet die Ableitung selbst. Bei dieser Datenmenge kostet das nichts.
