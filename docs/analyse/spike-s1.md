# Machbarkeitstest S1: Ice aus Node.js

Datum: 28.09.2026 · Code: `spikes/s1-ice/` · Ergebnis: **bestanden**. Der Dienst wird in Node.js/TypeScript geschrieben, wie in ADR-0006 vorgesehen.

## Aufbau

| Teil | Beschreibung |
|---|---|
| Server | `mumblevoip/mumble-server:v1.6.870` per Docker Compose, Ice auf `0.0.0.0:6502` im Container, für den Test auf `127.0.0.1:6502` veröffentlicht |
| Ice-Client | `ice` 3.7.110 von npm, Stubs mit `slice2js` 3.7.110 aus `third_party/mumble/src/murmur/MumbleServer.ice`, Node 22.15 |
| Testdaten | `src/setup.cjs` legt mit dem **Write-Secret** den Kanalbaum an. Das ist reine Testvorbereitung: 4 Etagen, 16 Räume, 1 Unterkanal (3. Ebene), 1 Verlinkung, 1 Raum mit Enter-Verbot. |
| Nutzer | 30 Test-Bots (`src/bot.cjs`): ein minimaler Mumble-Client in Node (TLS + protobuf, nur Steuerkanal, eigene Zertifikate). Er setzt Kanal, Self-Mute, Self-Deaf und Mitlauschen und lässt sich in AP7 wiederverwenden. |
| Test | `src/s1.cjs`: alle geplanten Aufrufe mit dem **Read-Secret**, Gegenproben, Lastmessung |

Ausführen:

```sh
cd spikes/s1-ice
docker compose up -d
pnpm install && pnpm gen && pnpm setup && pnpm s1
```

## Ergebnisse

### P1 – Server-Image mit Ice
- Das Image ist gegen `libIce.so.37` gelinkt, also mit **Ice 3.7** gebaut.
- Konfiguriert wird über Umgebungsvariablen `MUMBLE_CONFIG_<SCHLÜSSEL>` (z. B. `MUMBLE_CONFIG_ICE`, `MUMBLE_CONFIG_ICESECRETREAD`) oder über Docker-Secrets `/run/secrets/MUMBLE_CONFIG_<SCHLÜSSEL>`. Die Secrets sind im Entrypoint als sensibel markiert.
- Ohne eigenen Wert setzt der Entrypoint `ice="tcp -h 127.0.0.1 -p 6502"`. Für Zugriff aus einem anderen Container braucht es `MUMBLE_CONFIG_ICE: '"tcp -h 0.0.0.0 -p 6502"'` (Port nicht veröffentlichen).

### P2 – Ice for JavaScript unter Node 22
- Funktioniert. Alle Aufrufe gelingen, darunter Strukturen, Dictionaries, Sequenzen und Exceptions.
- **Falle 1:** `slice2js` 3.7.110 hat einen kaputten `bin`-Eintrag. Er zeigt auf ein Modul, das nur `compile()` exportiert, und tut deshalb als Befehl still nichts, endet aber mit Exit-Code 0. Lösung: `require("slice2js").compile([...])` aus einem Skript aufrufen (`src/gen-ice.cjs`).
- **Falle 2:** Der Proxy aus `Meta.getBootedServers` enthält den Endpoint aus Sicht des Servers (`tcp -h 172.23.0.2 …`, die Container-IP). Deshalb wird nur die Identität übernommen und der Proxy mit eigenem Host und Port gebaut (`s/<id>:tcp -h <host> -p <port>`).
- **Falle 3:** Die erste Server-Instanz hat in 1.6.870 die **ID 0**, nicht 1. Der Dienst ermittelt die ID deshalb über `getBootedServers` und legt sie nicht fest.

### Geprüfte Aufrufe (alle mit dem Read-Secret)
| Aufruf | Ergebnis |
|---|---|
| `Meta.getVersion` | 1.6.870 ✔ |
| `Meta.getBootedServers` | 1 Server, ID 0 ✔ |
| `Server.getConf("registername")` | „Musterhaus“ ✔. Ice liefert den Root-Kanal als „Root“, Clients sehen den registername. Der Dienst muss das nachbilden (wie in der Analyse beschrieben). |
| `getChannels` | Root `id 0`, `parent -1` ✔. **Links symmetrisch**, obwohl nur eine Seite gesetzt wurde ✔. `position` stimmt ✔. Die 3. Ebene ist sichtbar ✔. |
| `getUsers` | 30 Nutzer ✔. **Session in Ice = Session im Client** ✔. `selfMute`, `selfDeaf` (Deaf setzt Mute mit) und Nutzer im Root-Kanal sind korrekt ✔. `address` kommt als 16 Byte, IPv4 als `::ffff:a.b.c.d` ✔. |
| Abgelehnter Wechsel | Der Nutzer bleibt im alten Kanal, der Client erhält `PermissionDenied` ✔. Das bestätigt ADR-0003. |
| `getListeningUsers` | Liefert die Session des Mithörers ✔. |
| `hasPermission(…, Enter)` | Raum mit Verbot `false`, normaler Raum `true` ✔ |
| `getCertificateList[0]` | Der SHA1 davon entspricht dem Hash des Client-Zertifikats ✔. Das ist die **Serverseite von P6**. Die Plugin-Seite (`getUserHash`) folgt in S2 und S3. |
| `getUptime` | ✔ |

### Gegenproben
Mit dem Read-Secret scheitern `setState`, `addCallback` und `setChannelState` jeweils mit `InvalidSecretException`. Ein falsches Secret scheitert ebenfalls. **Der Dienst kann den Server also technisch nicht verändern** (ADR-0002 bestätigt).

### P3 – Last
Gemessen wurden 30 Nutzer und 20 Kanäle über 60 s. Takt wie in ADR-0002: Grundabfrage (`getChannels`, `getUsers`, `getUptime`) jede Sekunde, `getListeningUsers` für alle Kanäle alle 3 s.

| Messung | ohne Polling | mit Polling |
|---|---|---|
| Ping der Bots zum Server (p50 / p95 / max) | 1 / 3 / 1067¹ ms | 1 / 2 / 4 ms |
| CPU des Server-Containers | 0,00 % | 0,00–0,05 % |
| Grundabfrage (p50 / p95) | – | 1,4 / 2,8 ms |
| Mitlauschen für 20 Kanäle (p50 / p95) | – | 1,3 / 2,6 ms |

¹ Ein einzelner Ausreißer beim Start der Messung, bevor das Polling lief.

**Bewertung:** Das Polling belastet den Server nicht messbar. Der Takt aus ADR-0002 kann bleiben.

## Weitere Befunde
- **Autoban:** Viele Verbindungen von einer IP in kurzer Zeit lösen die automatische Sperre von Mumble aus („Global ban“). Für die Tests ist `autobanAttempts=0` gesetzt. Für Ruumble im Betrieb spielt das keine Rolle, weil der Dienst sich nicht als Mumble-Client verbindet.
- **Lizenz:** `ice` und `slice2js` stehen unter **GPL-2.0**. ZeroC vertreibt Ice unter GPL oder kommerzieller Lizenz, das gilt auch für die Python-Pakete. Siehe Frage O13 in PLANUNG.md.
