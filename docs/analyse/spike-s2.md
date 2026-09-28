# Machbarkeitstest S2: Minimal-Plugin im echten Mumble-Client

Datum: 28.09.2026 · Code: `spikes/s2-plugin/` · Ergebnis: **bestanden** mit Mumble 1.4.287 (Fedora 44), 1.5.517 (Ubuntu 24.04) und 1.5.735 (Debian 13).

## Aufbau

| Teil | Beschreibung |
|---|---|
| Plugin | `src/plugin.cpp`, **eine** Übersetzungseinheit, Plugin-API **1.0.x** (`MUMBLE_PLUGIN_API_MINOR_MACRO 0`). Eigenes CMake, Include-Pfad `third_party/mumble/plugins`. libstdc++ ist statisch eingebunden, die einzige Laufzeitabhängigkeit ist die libc. |
| Muster | Callbacks legen nur Ereignisse ab. Ein Worker-Thread führt Befehle aus einer Datei aus (Ersatz für den WebSocket aus AP6) und ruft die API dabei aus einem fremden Thread auf. Ergebnisse gehen als JSON-Zeilen in eine Datei. |
| Clients | Distro-Paket `mumble` in je einem Container (`docker/Dockerfile.*`), headless mit Xvfb und PulseAudio. Die Null-Sink dient als Lautsprecher, eine **Sinus-Quelle als Mikrofon**, damit echte Sprechereignisse entstehen. |
| Server | derselbe Mumble-Server v1.6.870 wie in S1 (`spikes/s1-ice`) |
| Test | `src/s2.cjs`: steuert das Plugin und prüft **jedes Ergebnis per Ice (Read-Secret) auf dem Server** |

Ausführen:

```sh
(cd ../s1-ice && docker compose up -d)                  # Server mit Test-Kanälen (vorher einmal pnpm setup)
cmake -S . -B build && cmake --build build
docker build -t ruumble-s2-ubuntu -f docker/Dockerfile.ubuntu docker   # analog debian, fedora
./run-client.sh ubuntu Anna && node src/s2.cjs ubuntu
```

## Ergebnisse (alle drei Distributionen gleich)

| Prüfung | Ergebnis |
|---|---|
| **P4** Plugin lädt | ✔ unter 1.4.287, 1.5.517 und 1.5.735. API 1.0.x ist damit richtig gewählt. **Fedora liefert noch 1.4**, mit API 1.2.x liefe das Plugin dort nicht. |
| Session | ✔ `getLocalUserID` im Callback = Session in Ice |
| **P6** Hash | ✔ `getUserHash` (Plugin) = SHA1 des Client-Zertifikats = SHA1 von `getCertificateList[0]` (Ice) |
| Kanalwechsel aus dem Worker | ✔ Der API-Aufruf dauert 0 ms, die Bestätigung per `onChannelEntered` kommt nach 10–25 ms. |
| Wechsel ohne Enter-Recht | ✔ Die API meldet `OK`, es kommt **keine** Bestätigung, nach 3 s gilt der Wechsel als `rejected`. Der Nutzer bleibt laut Ice im alten Kanal. Das bestätigt ADR-0003. |
| Wechsel in den eigenen Kanal | Die API sendet nichts, und es kommt kein `channelEntered`. Ohne Sonderbehandlung stünde nach 3 s `rejected` da, obwohl nichts schiefging. → ADR-0003 geändert |
| **Rate-Limit** | Mit den Mumble-Standardwerten (`messagelimit=1`, `messageburst=5`) werden von 6 schnellen Wechseln **2 still verworfen**. Der Nutzer landet dann **nicht** im zuletzt angeklickten Raum. → ADR-0003 geändert |
| Stumm/Taub | ✔ Alle 10 Schritte stimmen per Ice exakt mit der Semantik der Mumble-Buttons überein: Taub stellt stumm, Unmute hebt Taub auf, Undeaf stellt den vorherigen Mute-Zustand wieder her. Ist der Zielzustand schon erreicht, ruft das Plugin die API nicht auf. |
| Sprechen, eigenes | ✔ `talking` mit Zustand 1 (TALKING) für die eigene Session |
| Sprechen, anderer Client im selben Raum | ✔ Ereignisse für Ben (1 → 0) |
| Sprechen, anderer Client in anderem Raum | ✔ keine Ereignisse. Das bestätigt ADR-0005: Es gibt nur, was der Client hört. |
| Sprechen, selbst taub | ✔ keine Ereignisse |
| Server-Neustart | ✔ `disconnected` im ServerHandler-Thread, Mumble verbindet sich automatisch neu, neues `synchronized` **mit neuer Session-ID**. Das bestätigt, dass bei jedem Sync ein neues `hello` nötig ist. |
| Beenden mit Strg+Q | ✔ `disconnected`, dann `mumble_shutdown`. Der Worker-Thread ist nach 9–96 ms beendet. |
| Beenden mit SIGTERM | ✘ Mumble beendet sich **ohne** `mumble_shutdown`. Das Plugin darf sich also nicht darauf verlassen, aufgeräumt zu werden (der Dienst erkennt das Verbindungsende selbst). |
| **P5** Timeout (800 ms) | nicht provoziert. Alle API-Aufrufe aus dem Worker dauerten 0–4 ms. Die Wiederholung nach einem Timeout ist eingebaut, aber in diesem Test nie ausgelöst worden. |

## Befunde für Installation und Tests

- **Plugin-Pfade:** Nutzer-Installation `~/.local/share/Mumble/Mumble/Plugins/`, Distro-Plugins `/usr/lib/x86_64-linux-gnu/mumble/plugins` (Debian/Ubuntu).
- **Aktivierung:** Einstellungsschlüssel `plugins.<sha1(Dateipfad)>.enabled`, in 1.5 als JSON (`~/.config/Mumble/Mumble/mumble_settings.json`, mit `settings_version: 1` und kategorisierten Schlüsseln), in 1.4 als INI (`~/.config/Mumble/Mumble.conf`). Der Nutzer aktiviert das Plugin normal über den Einstellungsdialog. Die Vorbelegung braucht nur der Test.
- **Eigenheiten für automatische Tests** (für echte Nutzer ohne Bedeutung):
  - Audio-Assistent und Zertifikats-Assistent erscheinen beim ersten Start.
  - Das Client-Zertifikat liest 1.4 aus `~/Documents/MumbleAutomaticCertificateBackup.p12`.
  - Das Vertrauen ins Server-Zertifikat steht in der SQLite-Tabelle `cert`.
  - `mumble --version` öffnet unter 1.4 ein Fenster und bleibt stehen.
  - Der Hinweis „mute cue“ ist ein modaler Dialog und blockiert das Beenden.
  - Ein PKCS#12 im alten Format 3DES/SHA1 lehnt Fedora 44 ab, das Standardformat funktioniert überall.
- **Build:** Das Plugin wurde auf Ubuntu 24.04 gebaut (glibc 2.39) und läuft auf allen drei Distributionen. Für ältere Distributionen muss in AP6 im ältesten unterstützten Container gebaut werden.

## Folgen für die Planung

1. **ADR-0003 erweitert:**
   - Das Plugin **arbeitet Befehle der Reihe nach ab und fasst Wechsel zusammen**: Von mehreren offenen `join` zählt nur der letzte.
   - Zwischen zwei Nachrichten an den Server liegt mindestens 1 s Abstand.
   - Ein `join` in den aktuellen Kanal ist sofort `ok`.
   - Kommt bei einem Raum mit `canEnter = true` keine Bestätigung, liegt vermutlich das Rate-Limit vor. Das Plugin versucht es dann nach 1 s genau einmal erneut und meldet erst danach `rejected`.
2. **AP5:** Das Rate-Limit des Dienstes für Befehle wird von 2/s auf **1/s** gesenkt.
3. **AP6:** Der Build erfolgt im ältesten unterstützten Distributions-Container. Die Test-Container aus S2 werden zur Grundlage für die automatischen Plugin-Tests.
