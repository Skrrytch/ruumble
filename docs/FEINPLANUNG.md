# Ruumble – Feinplanung

Stand: 28.09.2026

Grundlagen:
- [PLANUNG.md](PLANUNG.md): fachliche Regeln
- [decisions/](decisions/README.md): Architekturentscheidungen
- [analyse/mumble-schnittstellen.md](analyse/mumble-schnittstellen.md): alle Mumble-Aufrufe mit Beleg im Code

Die Arbeitspakete (AP) bauen aufeinander auf. Jedes AP endet mit einem prüfbaren Ergebnis und einem eigenen Commit bzw. PR in `Skrrytch/ruumble`.

Aufwand: S = bis ½ Tag, M = 1–2 Tage, L = 3–5 Tage (grobe Schätzung bei KI-gestützter Umsetzung).

---

## Übersicht und Reihenfolge

```
AP0 Repo-Grundlage ─┬─▶ AP1 Machbarkeitstests (S1 Ice, S2 Plugin, S3 Identität) ──┐
                    │                                                              │
                    └─▶ AP2 Protokoll ─▶ AP3 building-model ─▶ AP4 UI (Mock) ──┐    │
                                                                                ▼    ▼
                                               AP5 Dienst ◀──────────────── (S1 ok)
                                               AP6 Plugin ◀──────────────── (S2 ok)
                                                    │
                                                    ▼
                                    AP7 Integration & Docker ─▶ AP8 Doku & Rollout
```

Die UI-Stränge AP2 bis AP4 hängen nicht von Mumble ab und können **parallel** zu den Machbarkeitstests laufen. Die Arbeit an Dienst und Plugin beginnt erst, wenn der jeweilige Test bestanden ist.

| AP | Titel | Aufwand | hängt ab von |
|---|---|---|---|
| AP0 | Repo-Grundlage und CI | S | – |
| AP1 | Machbarkeitstests S1–S3 | M | AP0 |
| AP2 | Protokoll und gemeinsame Typen | S | AP0 |
| AP3 | `building-model` | M | AP2 |
| AP4 | Oberfläche gegen Mock | L | AP3 |
| AP5 | Ruumble-Dienst | L | AP1 (S1, S3), AP2 |
| AP6 | Ruumble-Plugin | L | AP1 (S2), AP2 |
| AP7 | Integration und Docker Compose | M | AP4, AP5, AP6 |
| AP8 | Dokumentation und Rollout | S | AP7 |

---

## AP0 – Repo-Grundlage und CI

**Ziel:** Das Repository ist baubereit, und die einzige Abhängigkeit zu Mumble, die zwei Schnittstellendateien, wird automatisch überwacht.

**Bereits erledigt (28.09.2026):**
- README und LICENSE (BSD-3)
- `docs/` mit Planung, Analyse, ADRs und der neutralisierten Designübergabe
- `third_party/mumble/` mit v1.6.870, `VERSION`, `SHA256SUMS` und Lizenz
- `scripts/update-mumble-interfaces.sh`

**Erledigt am 28.09.2026 (Branch `ap0-grundlage`):**
1. `.gitignore` (`node_modules`, `dist`, `build`, `.env`) und `.editorconfig`
2. pnpm-Workspace im Repo-Root (`pnpm-workspace.yaml`: `protocol`, `web`, `bridge`), `.nvmrc` mit Node 22
3. GitHub-Workflow **`ci.yml`**:
   - `scripts/update-mumble-interfaces.sh` ohne Argument, das prüft die Prüfsummen
   - Lint, Tests und Build für `protocol`, `web` und `bridge`
   - Build des Plugins (CMake): folgt mit AP6
4. GitHub-Workflow **`mumble-release-watch.yml`** (wöchentlich): Neuestes Release-Tag von mumble-voip/mumble mit `third_party/mumble/VERSION` vergleichen und bei einem neueren Tag ein Issue mit dem Diff der beiden Dateien anlegen.
5. Test: Eine manipulierte Schnittstellendatei lässt die Prüfung mit Exit-Code 1 scheitern.

**Offen:**
- Branch-Schutz für `main` (PR mit grüner CI) muss in den GitHub-Einstellungen gesetzt werden, das macht der Repo-Inhaber.

**Fertig, wenn:** Die CI läuft grün, und eine manipulierte Schnittstellendatei lässt sie fehlschlagen.

---

## AP1 – Machbarkeitstests (Spikes)

Jeder Test ist zeitlich begrenzt auf höchstens 1 Tag. Das Ergebnis ist eine kurze Notiz unter `docs/analyse/spike-<n>.md`, der Code liegt in `spikes/` und wird danach verworfen oder übernommen.

### S1 – Ice aus Node.js (prüft P1–P3, P8) · ✔ bestanden am 28.09.2026, siehe [analyse/spike-s1.md](analyse/spike-s1.md)
1. `docker compose` mit `mumblevoip/mumble-server` aufsetzen. Ice aktivieren und beide Secrets setzen. Prüfen, ob das Image mit Ice gebaut ist, wie `ice=` gesetzt wird und welches Image-Tag zu v1.6.870 passt (P8).
2. Ice for JavaScript 3.7 unter Node LTS installieren und aus `third_party/mumble/src/murmur/MumbleServer.ice` mit `slice2js` Stubs erzeugen. Die Stubs werden im Build erzeugt und nicht eingecheckt.
3. Mit dem Read-Secret aufrufen: `getVersion`, `getChannels`, `getUsers`, `getListeningUsers`, `hasPermission`, `getCertificateList`, `getConf("registername")`.
4. Gegenprobe: `setState` mit dem Read-Secret muss scheitern.
5. Last messen: 1-s-Polling mit 50 Kanälen und 30 Test-Bots (z. B. mit einem Bot-Werkzeug), Latenz von Ping und Text vorher und nachher vergleichen.

**Abbruchkriterium:** Läuft Ice for JavaScript nicht stabil, wird der Dienst in Python geschrieben (ADR-0006 Fallback).

### S2 – Minimal-Plugin (prüft P4, P5) · ✔ bestanden am 28.09.2026 mit Mumble 1.4.287, 1.5.517 und 1.5.735, siehe [analyse/spike-s2.md](analyse/spike-s2.md)
1. Eigenes CMake unter `spikes/plugin` mit dem Include-Pfad `third_party/mumble/plugins` und API 1.0.x.
2. `mumble_init` startet einen Thread. `onServerSynchronized` loggt Session und Hash, `onUserTalkingStateChanged` loggt die Ereignisse.
3. Der Thread ruft nach 5 s `requestUserMove` sowie `requestLocalUserMute/Deaf` auf. Geprüft werden Timeout-Verhalten, Bestätigung per `onChannelEntered` und Ablehnung (Kanal ohne Enter-Recht).
4. Als `.mumble_plugin` bündeln und im Mumble-Client installieren: Ubuntu 24.04, Debian 13, Fedora (aktuell), soweit verfügbar.
5. `mumble_shutdown` beim Deaktivieren und Beenden: kein Hänger, kein Absturz.

### S3 – Identität (prüft P6, P7) · P6 ✔ in S1/S2. **P7 zurückgestellt bis AP7:** Der IP-Abgleich über echtes Netz, Proxy und VPN wird mit dem Homeserver geprüft (Entscheidung 28.09.2026).
1. SHA1 von `getCertificateList(session)[0]` mit `getUserHash` im Plugin vergleichen.
2. `User.address` mit der Quell-IP der WebSocket-Verbindung vergleichen, einmal direkt, einmal über Caddy (`X-Forwarded-For`) und, wenn möglich, über VPN.

**Fertig, wenn:** Alle drei Notizen liegen vor und P1–P7 sind beantwortet. ADR-0004 und ADR-0006 sind bei Bedarf angepasst.

---

## AP2 – Protokoll und gemeinsame Typen (`protocol`)

**✔ Erledigt am 28.09.2026** (Branch `ap2-protocol`):
- zod-Schemas in `protocol/src/index.ts`, `parse()` wirft nie
- `schema/protocol.schema.json` wird erzeugt, die CI prüft es mit `build`
- Fixtures: `musterhaus`, `sonderfaelle` (Eingang, zu tief, zu viele Räume, verlinkte Räume und Etagen, Mitlauschen, Schloss, Server-Mute, temporärer Kanal), `leerstand`, `nicht-gekoppelt`, `messages` (gültige und ungültige Nachrichten)
- 27 Tests, darunter die Stimmigkeit der Fixtures (symmetrische Links wie in Mumble)
- Ergänzt gegenüber ADR-0007: `TalkingState` als Text (`passive`, `talking`, `whispering`, `shouting`, `talking-muted`), Ablehnungsgründe für `reject`

Ursprünglicher Plan:

1. TypeScript-Typen für alle Nachrichten aus ADR-0007, dazu `v: 1`.
2. Laufzeitprüfung mit **zod**. Aus den zod-Schemas wird ein JSON-Schema (`protocol.schema.json`) für das Plugin erzeugt.
3. Beispielnachrichten als Fixtures, die AP3 bis AP6 in Tests nutzen.
4. Den Mock-Datensatz aus `docs/design/prototype/mock-data.json` in das Snapshot-Format überführen (mit `links`, `listeners`, `canEnter`).
5. Weitere Fixtures für die Sonderfälle anlegen: gesperrte Etagen, verlinkte Kanäle, Root-Nutzer, Leerstand.

**Fertig, wenn:** `pnpm -F protocol test` validiert alle Fixtures.

---

## AP3 – `building-model` (`web/src/lib/model`)

**✔ Erledigt am 28.09.2026** (Branch `ap3-building-model`): `web/src/lib/model/building.ts`, 32 Tests, Abdeckung 100 % Zeilen / 98 % Verzweigungen (Schwelle 95 % in `pnpm test`). Detailregeln, die bei der Umsetzung festgelegt wurden:
- Ein verlinkter Kanal verschwindet **samt allen Unterkanälen**. Die Etagennummern werden danach lückenlos vergeben.
- „Zu tief“ zählt nur **sichtbare** Unterkanäle sichtbarer Räume (O3). Treffen beide Sperrgründe zu, hat „zu tief“ Vorrang.
- Die Belegung einer Etage umfasst den ganzen sichtbaren Teilbaum, also auch die 3. Ebene gesperrter Etagen. Nutzer in ausgeblendeten Kanälen zählen nur bei „online“ (O4).
- Die Nutzer eines Raums werden alphabetisch sortiert. Die Initialen sind Grapheme-sicher.
- `homeFloor`: die eigene Etage, auch wenn sie gesperrt ist (dann erscheint der Hinweis), sonst die erste darstellbare. `isVacant`: keine darstellbare Etage.

Ursprünglicher Plan:

Reine Funktionen ohne Svelte und ohne DOM. Die Testabdeckung liegt bei mindestens 95 %.

| Funktion | Regel | Quelle |
|---|---|---|
| `sortSiblings` | `position`, dann Name (`Intl.Collator("de")`) | PLANUNG 2.2, Analyse 3.3 |
| `visibleChannels` | Kanäle mit nicht leerem `links` entfernen. Ein verlinkter Etagenkanal entfernt die ganze Etage (Annahme O2). | PLANUNG 2.4 |
| `buildBuilding` | Etagen = Kinder von Root, Räume = deren Kinder. EG = Index 0, dann `n. Obergeschoss`, Badge. | PLANUNG 2.1 |
| `floorLock` | `too-deep`, wenn ein sichtbarer Raum Kinder hat (Annahme O3), `too-many-rooms`, wenn mehr als 8 Räume da sind, sonst `null` | PLANUNG 2.3 |
| `entrance` | Nutzer im Root-Kanal | PLANUNG 2.4 |
| `locateSelf` | Wo ist der eigene Nutzer: `room` / `corridor` / `open-floor` / `entrance` / `locked-floor` / `hidden` | PLANUNG 2.3, O4 |
| `population` | je Etage und gesamt. Nutzer in ausgeblendeten Kanälen zählen gesamt mit (Annahme O4). | PLANUNG 2.4 |
| `splitRows`, `roomGrow` | aus dem Prototyp übernommen | SPEC 2 |
| `initials` | Grapheme-sicher (`Intl.Segmenter`) | Befund 4.4 |
| `roomFlags` | `muted` („(stumm)“), `listened` (jemand lauscht mit), `locked` (`!canEnter`) | PLANUNG 2.4, ADR-0003 |

**Fertig, wenn:** Jede Regel und jeder Sonderfall hat mindestens einen Test, einschließlich Live-Wechseln wie „Unterkanal angelegt → Etage gesperrt“.

---

## AP4 – Oberfläche gegen Mock (`web`)

**✔ Erledigt am 28.09.2026** (Branch `ap4-ui-mock`):
- Svelte 5 + Vite 8, Inter selbst gehostet, Lucide-Icons, Farben nur aus `docs/design/tokens.css`
- `MumbleAdapter`-Interface und `MockAdapter`:
  - Verhalten wie in S1/S2: Bestätigung, Ablehnung nach 3 s, der letzte Wechsel gewinnt, Stumm/Taub-Semantik, Sprechen nur im eigenen Raum
  - Debug-Panel mit `?debug`
- Zustände:
  - Übergang beim Wechsel, Hinweis bei nicht bestätigtem Wechsel
  - „Mumble ist nicht verbunden“, eigener Nutzer auf gesperrter Etage oder in ausgeblendetem Bereich, Leerstand
  - Eingang, Schloss, Mitlauschen, Status-Symbole
- **Layoutvergleich mit dem Prototyp per DOM** (Toleranz 3 px) statt Pixelvergleich, weil sich die Schrift unterscheidet
  - Bewusste Abweichung: Die Etagentasten sind kompakter (48 statt 52 px, Abstand 6 statt 10 px), damit 5 Etagen und der Eingang Platz haben.
  - Außerdem entfällt das Label „primary“ (E9).
- 14 Playwright-Tests, die CI führt sie mit aus (Job `e2e`)
- Vorläufige Umsetzung offener Fragen (bitte bestätigen oder ändern):
  - **O5:** Ohr-Symbol am Raum, Tooltip „N Personen hören mit“, keine Namen
  - **O6:** Server-Mute, Server-Deaf und Unterdrückt als dunkles Abzeichen mit Mikrofon-aus. Self-Mute ist hell, Self-Deaf zeigt einen Kopfhörer-aus.
  - **O7:** Der Einstellungsknopf ist sichtbar, aber deaktiviert („noch ohne Funktion“).
- Nicht umgesetzt: eine eigene Darstellung für kleine Fenster. Die Mindesthöhe ist 720 px, die Breite bis 1440 px flexibel.

Ursprünglicher Plan:

1. Vite + Svelte 5 + TypeScript einrichten. `tokens.css` einbinden, Inter selbst hosten, Lucide einbinden.
2. `MumbleAdapter`-Interface und `MockAdapter`: liest die Fixtures, simuliert Beitreten und Verlassen, Sprechen und Ablehnungen und bietet dafür ein Debug-Panel mit `?debug`.
3. Komponenten:
   - `Header`
   - `FloorPlan` mit `Row`, `Room`, `Corridor`, `OpenFloor`
   - `Core` mit `BuildingSign`, `Elevator` und `FloorButton` (gesperrt oder aktiv)
   - `Entrance`
   - `UserMenu` mit Werkzeugleiste und Versionszeile
   - `Avatar` mit Sprech-Ring und Status-Badges
   - Zustände `Notice` und `Vacancy`
4. Zustände darstellen: Übergang beim Wechsel, „Wechsel nicht möglich“, „Mumble ist nicht verbunden“, „Du bist in einem Bereich, der hier nicht darstellbar ist“, Leerstand.
5. Barrierefreiheit nach SPEC 7 und dazu `aria-disabled` für gesperrte Etagen.
6. **Playwright:** Screenshot-Vergleich mit `prototype/index.html` bei 1440 × 900 mit den Mock-Daten. Da sich die Schrift unterscheidet, gilt eine Toleranz; geprüft wird vor allem das Layout.
7. PWA-Manifest und Icon, damit die Oberfläche als App installierbar ist.

**Fertig, wenn:** Alle Fälle aus PLANUNG Abschnitt 2 sind im Mock bedienbar, und der Screenshot-Vergleich läuft grün.

---

## AP5 – Ruumble-Dienst (`bridge`)

1. **Ice-Client:** Stubs zur Build-Zeit aus `../third_party/mumble/src/murmur/MumbleServer.ice` erzeugen. Proxy direkt auf `s/<id>:tcp -h <host> -p <port>` setzen, Read-Secret im Context mitgeben.
2. **Poller** nach ADR-0002: Differenz zum vorigen Stand bilden, Neustart über `getUptime` erkennen, Fehler mit Backoff behandeln, `InvalidSessionException` tolerieren.
3. **State-Store:** Rohdaten plus `canEnter` je gekoppeltem Nutzer
4. **Plugin-Endpunkt `/ws/plugin`:**
   - `hello` und Plausibilitätsprüfung (ADR-0004)
   - Befehle weiterleiten, `result`, `selfState` und `talking` entgegennehmen
   - Heartbeat, Verbindungen mit unbekannter Session nach 10 s schließen
5. **Kopplung:**
   - Einmal-Link erzeugen, `/pair?code=` gegen ein Geräte-Token tauschen
   - Token-Speicher als kleine SQLite-Datei im Volume
   - Token widerrufen
6. **Oberflächen-Endpunkt `/ws/ui`:**
   - Token prüfen und zum Plugin mit demselben Hash zuordnen
   - `snapshot` gebündelt über 100 ms verschicken
   - `talking` nur an die eigenen Oberflächen weiterleiten (ADR-0005)
   - Befehle prüfen: Kanal existiert, `canEnter`, Rate-Limit von **1 pro Sekunde** (S2: Mumble-Standard `messagelimit=1`)
7. **HTTP:** Statische Oberfläche, `/download` (Plugin-Bundle), `/healthz`
8. **Konfiguration** per Umgebungsvariablen: `ICE_HOST`, `ICE_PORT`, `ICE_SECRET_READ`, optional `SERVER_ID` (Standard: erster Server aus `getBootedServers`), `PUBLIC_URL`, `TRUST_PROXY`
9. **Tests:** Unit-Tests für Differenzbildung, Prüfung und Weiterleitung. Integrationstest gegen einen Mumble-Server im Container.

**Fertig, wenn:** Der Dienst zeigt gegen einen echten Server den Live-Zustand in einer WebSocket-Konsole, und alle Regeln aus ADR-0002 bis ADR-0005 sind getestet.

---

## AP6 – Ruumble-Plugin (`plugin`)

1. CMake-Projekt:
   - Include-Pfad `../third_party/mumble/plugins`
   - `MUMBLE_PLUGIN_API_MINOR_MACRO 0`
   - IXWebSocket und nlohmann/json per FetchContent
   - OpenSSL aus dem System
   - Ergebnis: `libruumble.so`
2. Aufbau:
   - `plugin.cpp` als **einzige** Übersetzungseinheit, die den Header ohne Zusatz einbindet
   - `Queue` (threadsicher)
   - `NetThread` für WebSocket, Reconnect mit Backoff und Heartbeat
   - `CommandExecutor`
   - `Config`
3. Callbacks nach Analyse 2.3: Sie legen nur Nachrichten in die Queue und warten nie auf den Thread.
4. `CommandExecutor` im Netzwerk-Thread:
   - `join`, `mute` und `deaf` nach ADR-0003
   - bei Timeout ein Wiederholungsversuch
   - Bestätigung über ein Ereignis aus der Queue (`channelEntered` der eigenen Session) mit 3 s Timeout
5. Kopplung: `pairUrl` einmalig mit `xdg-open` öffnen und das Flag `paired` in `~/.config/ruumble/plugin.json` setzen.
6. `mumble_shutdown`: Stop-Flag setzen, schließen, `join`. Dauert höchstens 1 s.
7. Bundle `ruumble-<version>.mumble_plugin` mit `manifest.xml` (`os="linux" arch="x64"`)
   - Gebaut wird im **ältesten unterstützten Distributions-Container**, wegen der glibc-Version. libstdc++ wird statisch eingebunden (S2).
8. Tests:
   - Unit-Tests für Queue, Executor und Config gegen einen API-Stub. Das ist ein eigenes Fake-Struct, Mumble wird dafür nicht gebraucht.
   - Automatische Tests mit echten Clients: die Container aus S2 (Ubuntu, Debian, Fedora, headless, Sinus-Mikrofon), geprüft per Ice
   - Ergänzend ein manueller Testplan für den Desktop

**Fertig, wenn:** Das Plugin übersteht 100 Mal Aktivieren und Deaktivieren sowie Trennen und Neuverbinden ohne Hänger, und alle Befehle funktionieren gegen einen echten Server.

---

## AP7 – Integration und Docker Compose (`deploy`)

1. `LiveAdapter` in der Oberfläche (WebSocket, Reconnect, Status)
2. `docker-compose.yml`:
   - `mumble` (offizielles Image, Ice nur intern)
   - `ruumble` (Multi-Stage-Build: Oberfläche und Dienst)
   - `proxy` (Caddy)
   - `.env.example` ohne Secrets
3. **E2E-Tests:**
   - Playwright gegen den Compose-Stack
   - Mumble-Nutzer werden durch Test-Bots simuliert. Ein echter Client mit Plugin wird manuell getestet (Testplan unter `deploy/TESTPLAN.md`).
4. Latenz messen: vom Klick bis zur Bestätigung und von einer Änderung in Mumble bis zur Oberfläche. Ziel: unter 1,5 s.

**Fertig, wenn:** Der Ablauf „Mumble starten → Plugin koppelt → Oberfläche zeigt das Gebäude → Raumwechsel, Stumm und Taub funktionieren“ ist mit zwei echten Clients abgenommen.

---

## AP8 – Dokumentation und Rollout

1. `docs/installation-nutzer.md`: Plugin installieren, aktivieren, erste Kopplung, PWA installieren.
2. `docs/betrieb.md`: Compose, Secrets, Updates, Healthcheck, Token widerrufen.
3. `docs/sicherheit.md`: Restrisiko aus ADR-0004 und Umgang mit Tokens.
4. Pilot mit 2–3 Kollegen, Rückmeldungen als Issues erfassen.

---

## Risiken

| Risiko | Wahrscheinlichkeit | Wirkung | Maßnahme |
|---|---|---|---|
| Ice for JavaScript unter Node LTS nicht nutzbar | mittel | Dienst muss in anderer Sprache geschrieben werden | S1 zuerst, Fallback Python |
| Offizielles Server-Image ohne Ice | niedrig | eigenes Image nötig (Mumble-Code bleibt unverändert, nur der Build ist anders) | S1 |
| Plugin-API 1.0.x in Distro-Clients anders als erwartet | niedrig | Kompatibilitätsprobleme | S2 mit mehreren Distributionen |
| IP-Abgleich scheitert an VPN oder Proxy | mittel | schwächere Prüfung | S3, dann ohne IP-Prüfung und nur intern erreichbar |
| Polling belastet den Server | niedrig | Latenz im Sprachdienst | Messung in S1, sonst Takt anpassen |
| Mumble ändert in einem neuen Release die Plugin-API oder die Ice-Slice | niedrig | Anpassung nötig | Release-Watch (AP0). Übernahme nur per Skript, danach die Analyse abgleichen. |

---

## Getroffene Annahmen (bitte bei Widerspruch melden)

- **O2:** Ist ein Etagenkanal verlinkt, verschwindet die ganze Etage.
- **O3:** Unterkanäle eines ausgeblendeten Raums sperren die Etage nicht.
- **O4:** Nutzer in ausgeblendeten Kanälen zählen gesamt mit. Ist man selbst in einem solchen Kanal, erscheint der Hinweis „nicht darstellbar“.
- Passwortgeschützte Kanäle werden nicht unterstützt (ADR-0003).
- Die Designübergabe (`docs/design/`) ist neutralisiert (keine Firmen-Tokens, keine internen Namen und Personen) und bleibt ansonsten Referenz. Wo sie abweicht, gilt `PLANUNG.md`.
