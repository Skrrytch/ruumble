# Analyse: Mumble-Schnittstellen für Ruumble

Stand: 28.09.2026 · Analysiert: [mumble-voip/mumble](https://github.com/mumble-voip/mumble) Commit 7bbd2c16a (`master`, 26.09.2026). Die beiden Schnittstellendateien sind dort identisch mit dem Release **v1.6.870**, auf das Ruumble festgelegt ist (`third_party/mumble/VERSION`).

Dieses Dokument listet **jeden Aufruf**, den Ruumble an Mumble richtet, mit Beleg im Mumble-Code. Ruumble bindet ausschließlich die öffentlichen Schnittstellen an:

- **Client:** Plugin-API, Header `plugins/MumblePlugin.h`
- **Server:** Ice-Schnittstelle, `src/murmur/MumbleServer.ice`

Beide liegen unverändert unter `third_party/mumble/`. **Pfadangaben in den Belegen beziehen sich auf das Mumble-Repository**, nicht auf Ruumble. Zum Nachschlagen: `git clone https://github.com/mumble-voip/mumble && git checkout 7bbd2c16a`.

---

## 1. Trennung zwischen Mumble und Ruumble

```
┌──────────────── Mumble (unverändert, Release v1.6.870) ────────────────┐
│  Mumble-Client (Distro-Paket)            Mumble-Server (Docker-Image)  │
│        ▲ Plugin-API v1.0.x                        ▲ Ice (nur lesen)    │
└────────┼──────────────────────────────────────────┼────────────────────┘
         │ third_party/mumble/plugins/MumblePlugin.h │ …/src/murmur/MumbleServer.ice
┌────────┼────────────── Ruumble (eigenes Repo) ────┼────────────────────┐
│  plugin/ ──wss (ausgehend)──▶ bridge/ ◀──wss── web/                    │
└────────────────────────────────────────────────────────────────────────┘
```

| Regel | Umsetzung |
|---|---|
| Ruumble ist ein **eigenständiges Repository** (ADR-0009). | Aus Mumble werden nur die zwei Schnittstellendateien übernommen, unverändert und festgelegt auf ein Release-Tag, mit Prüfsumme und BSD-3-Lizenz (`third_party/mumble/`). |
| Die Schnittstellen werden nie von Hand geändert. | Aktualisiert wird nur mit `scripts/update-mumble-interfaces.sh <tag>`. Die CI prüft `SHA256SUMS`. |
| Ruumble baut Mumble nicht. | Das Plugin hat ein **eigenes CMake-Projekt** mit dem Include-Pfad `third_party/mumble/plugins`. Der Dienst erzeugt Ice-Stubs aus `third_party/mumble/src/murmur/MumbleServer.ice`. |
| Die Laufzeit ist unabhängig vom eigenen Build. | Das Plugin läuft im **Mumble-Client der Linux-Distribution**, der Dienst neben dem **offiziellen Server-Image**. Keiner der beiden Mumble-Teile wird selbst gebaut. |
| Der Server-Zustand wird nie verändert. | Der Dienst bekommt nur `icesecretread`. Callbacks und Schreibmethoden sind damit technisch gesperrt (siehe 3.1). |
| Aktionen laufen nur im eigenen Client. | Kanalwechsel, Stumm und Taub führt das Plugin im Client des Nutzers aus. Dabei gelten ACL und Rate-Limit des Servers wie beim Klick in Mumble. |

---

## 2. Client: Plugin-API

### 2.1 Grundlagen

| Thema | Befund | Beleg |
|---|---|---|
| **API-Version** | Wir nutzen **1.0.x**. Der einzige Unterschied zu 1.2.x ist `playSample(volume)`, das wir nicht brauchen. Mit 1.0.x läuft das Plugin ab Mumble 1.4. | `plugins/MumblePlugin.h:42-50, 1209-1212, 1808`; `src/mumble/Plugin.cpp:326-336` |
| **Pflicht-Exporte** | `mumble_init`, `mumble_shutdown`, `mumble_getName`, `mumble_getAPIVersion`, `mumble_registerAPIFunctions`, `mumble_releaseResource` | `src/mumble/Plugin.cpp:83-97` |
| **API-Struct** | Beim Registrieren **kopieren**. Mumble übergibt einen Zeiger auf den Stack. | `plugins/MumblePlugin.h:735-738` |
| **Header** | Nur in **einer** Übersetzungseinheit ohne Zusatz einbinden. Alle anderen setzen `MUMBLE_PLUGIN_NO_DEFAULT_FUNCTION_DEFINITIONS`, sonst entsteht ein doppeltes Symbol. | `plugins/MumblePlugin.h:12-16, 1187-1192` |
| **Laden** | Mumble lädt die `.so` schon beim Scannen per `dlopen`, auch wenn das Plugin deaktiviert ist. Den Thread deshalb erst in `mumble_init` starten. `mumble_shutdown` muss ihn per `join` beenden, weil Mumble die Bibliothek danach entlädt. | `src/mumble/Plugin.cpp:36, 54-56`; `docs/dev/plugins/PluginLifecycle.md:17-19` |
| **Threading** | Alle API-Aufrufe laufen im Main-Thread von Mumble. Ein Aufruf aus einem fremden Thread wird eingereiht und wartet **höchstens 800 ms**, danach kommt `MUMBLE_EC_API_REQUEST_TIMEOUT`. | `src/mumble/API_v_1_x_x.cpp:1654-1676` |
| **Speicher** | Strings und Arrays aus der API müssen mit `freeMemory` freigegeben werden. | `src/mumble/API_v_1_x_x.cpp:165-197` |
| **Installation** | Zip mit der Endung `.mumble_plugin` und `manifest.xml` (`os="linux"`, `arch="x64"`). Es gibt **keine Signatur**. Der Nutzer muss das Plugin **von Hand aktivieren**, der Standard ist `enabled=false`. | `src/mumble/PluginInstaller.cpp:38-133`; `src/mumble/PluginManifest.cpp:30-124`; `src/mumble/Settings.h:96-100` |
| **Berechtigungen** | Wir brauchen weder „Positional data“ noch „Keyboard monitoring“. | `src/mumble/PluginConfig.cpp:99-113` |

### 2.2 Geplante Aufrufe (Plugin → Mumble)

| Aufruf | Wann | Zweck | Beleg | Umgang mit Risiken |
|---|---|---|---|---|
| `getActiveServerConnection` | vor jedem Befehl | Connection-Handle holen | `API_v_1_x_x.cpp:199-224` | Ohne Verbindung wird der Befehl mit `offline` abgelehnt. |
| `getLocalUserID` | `onServerSynchronized` | **eigene Session-ID**. Sie ist identisch mit der Server-Session in Ice. | `API_v_1_x_x.cpp:273`; `src/mumble/Messages.cpp:129` | Mumble vergibt Session-IDs nach dem Abmelden neu. Deshalb schickt das Plugin bei jedem Sync ein neues `hello`. |
| `getUserHash(eigene ID)` | `onServerSynchronized` | Zertifikats-Hash (SHA1) als **stabiler Schlüssel** über Reconnects hinweg, für Kopplung und Plausibilitätsprüfung | `API_v_1_x_x.cpp:661-697`; `src/murmur/Server.cpp:1552` | Ein leerer Hash wird abgelehnt, die Oberfläche zeigt dann einen Hinweis. |
| `requestUserMove(conn, self, ch, NULL)` | Befehl `join` | Kanal wechseln | `API_v_1_x_x.cpp:897-943` | `OK` heißt nur „Anfrage gesendet“. **Eine Ablehnung meldet die API nicht**, sie steht nur im Log (`src/mumble/Messages.cpp:227-252`). Erfolg erkennt das Plugin am `onChannelEntered` für die eigene Session. Kommt der nicht innerhalb von 3 s, gilt der Wechsel als abgelehnt (siehe ADR-0003). Passwortgeschützte Kanäle werden nicht unterstützt (`password = NULL`). |
| `requestLocalUserMute(bool)` | Befehl `mute` | Self-Mute | `API_v_1_x_x.cpp:1006-1031`; `src/mumble/MainWindow.cpp:2779-2813` | Verhält sich **wie der Button in Mumble**: Unmute bei Taub hebt auch Taub auf. Jeder Aufruf erzeugt einen Log-Eintrag, deshalb nur bei echter Änderung aufrufen. |
| `requestLocalUserDeaf(bool)` | Befehl `deaf` | Self-Deaf | `API_v_1_x_x.cpp:1033-1058`; `MainWindow.cpp:2816-2858` | Taub stellt auch stumm. Aufheben von Taub hebt Stumm nur auf, wenn Stumm durch Taub kam. Das entspricht SPEC 3. |
| `isLocalUserMuted` / `isLocalUserDeafened` | direkt nach `mute`/`deaf` | Ergebnis an den Dienst melden, damit die Oberfläche sofort reagiert, ohne auf den nächsten Ice-Abgleich zu warten | `API_v_1_x_x.cpp:615-659` | Der Audio-Wizard setzt `bMute` vorübergehend. Maßgeblich bleibt deshalb der Stand aus Ice. |
| `freeMemory` | nach jedem Getter | Speicher freigeben | `API_v_1_x_x.cpp:165-197` | – |

**Bewusst nicht genutzt:**

| Aufruf | Grund |
|---|---|
| `getAllUsers`, `getAllChannels`, `getChannelName`, `getChannelOfUser` | Ice liefert Baum und Nutzer vollständig, ohne dass der Stand von zwei Quellen abgeglichen werden muss. Außerdem stürzt `getAllUsers` bzw. `getAllChannels` mit `nullptr` ab (`API_v_1_x_x.cpp:406, 454`). |
| `sendData` | Funktioniert nur zwischen Clients und ist auf 4 Aufrufe pro Sekunde gedrosselt. Für uns ohne Nutzen. |
| `requestSetLocalUserComment` | Wird nicht gebraucht, weil die Identität per Plausibilitätsprüfung geklärt wird (ADR-0004). |
| `playSample` | Nur in 1.2.x vorhanden und für uns ohne Zweck |

### 2.3 Geplante Callbacks (Mumble → Plugin)

**Grundregel:** Callbacks rufen die API nur synchron und kurz auf. Sie legen Nachrichten in eine threadsichere Queue und **warten nie** auf den Netzwerk-Thread (`plugins/MumblePlugin.h:1237-1246`).

| Callback | Thread | Aktion | Beleg |
|---|---|---|---|
| `mumble_init(id)` | Main | ID merken, Konfiguration lesen, Netzwerk-Thread starten | `Plugin.cpp:303-356` |
| `mumble_shutdown()` | Main | Stop-Flag setzen, WebSocket schließen, `join` | `Plugin.cpp:358-382` |
| `mumble_onServerSynchronized(conn)` | Main | Session-ID und Hash lesen, `hello` in die Queue legen | `src/mumble/Messages.cpp:193` |
| `mumble_onServerDisconnected(conn)` | **ServerHandler** | nur `offline` in die Queue legen und **nicht blockieren** | `MainWindow.cpp:1267-1268` |
| `mumble_onChannelEntered(conn, user, prev, new)` | Main | Ist `user` die eigene Session, einen offenen `join` als bestätigt melden | `src/Channel.cpp:82-85` |
| `mumble_onUserTalkingStateChanged(conn, user, state)` | Main (queued) | `talking` weiterleiten. Der Dienst gibt es **nur an die eigene Oberfläche** weiter (ADR-0005). | `ClientUser.cpp:67-68, 153-165`; `PluginManager.cpp:710-757` |

Einschränkungen bei `onUserTalkingStateChanged`:

- Gemeldet wird nur, was der Client hört: den eigenen Kanal, verlinkte Kanäle, Kanäle, denen man zuhört, sowie Whisper und Shout (`src/murmur/Server.cpp:1193-1340`).
- Bei eigenem **Taub** kommt gar nichts (`AudioReceiverBuffer.cpp:60`).
- Der eigene Nutzer ist bei Self-Mute `PASSIVE` (`AudioInput.cpp:992-1009`).

Nicht genutzt: `onServerConnected` (noch nicht synchronisiert), `onUserAdded/Removed` und `onChannel*`, weil die Struktur aus Ice kommt.

---

## 3. Server: Ice-Schnittstelle

### 3.1 Grundlagen

| Thema | Befund | Beleg |
|---|---|---|
| Ice-Versionen | 3.6 und 3.7, C++98-Mapping. Ob 3.8 funktioniert, ist nicht verifiziert. | `src/murmur/CMakeLists.txt:17, 198-212`; `MumbleServerIce.cpp:321-325` |
| Endpoint | Wird über `ice="tcp -h … -p 6502"` aktiviert. Ohne diesen Schlüssel startet Ice nicht. | `auxiliary_files/mumble-server.ini:53`; `Meta.cpp:345`; `MumbleServerIce.cpp:290-291` |
| **Secrets** | `icesecretwrite` übernimmt ohne eigenen Wert den Wert von `icesecretread`. Deshalb **immer beide mit unterschiedlichen Werten setzen**. Der Dienst bekommt nur das Read-Secret. | `Meta.cpp:346-348`; `scripts/generateIceWrapper.py:41-65` |
| **Callbacks** | `Server.addCallback` und `Meta.addCallback` brauchen das **Write-Secret**. Der Server schickt es außerdem bei jedem Callback mit. **Deshalb Polling** (ADR-0002). | `MumbleServerIce.cpp:1017-1033, 2360-2374, 313-316` |
| Ausführung | Jeder Ice-Aufruf läuft im Qt-Main-Thread des Servers und liefert einen konsistenten Stand. Zwischen zwei Aufrufen ist nichts atomar. | `generateIceWrapper.py:67-68`; `docs/dev/MurmurLocking.md:12-14` |
| Zukunft | Ice wird weiter gepflegt, z. B. 08777dfcf „Mark channel listener getter functions as read-only accessible“. gRPC wurde 2022 entfernt, ein Ersatz ist nicht angekündigt. | `git log` |

### 3.2 Geplante Aufrufe (Dienst → Mumble-Server)

Alle Aufrufe sind mit dem **Read-Secret** erlaubt.

| Aufruf | Takt | Zweck | Beleg | Hinweise |
|---|---|---|---|---|
| `Meta.getVersion` | beim Start | Server-Version für die Versionszeile | `MumbleServerIce.cpp:2348` | Braucht kein Secret. |
| `Meta.getBootedServers` | beim Start und bei Fehlern | virtuellen Server finden (in 1.6.870 hat die erste Instanz die **ID 0**, S1) | `:2332-2346` | Der Proxy enthält den Endpoint aus Sicht des Servers (die Container-IP). Deshalb nur die Identität übernehmen und `s/<id>:tcp -h mumble -p 6502` selbst bauen (S1). |
| `Server.getConf("registername")`, Fallback `Meta.getDefaultConf` | beim Start, alle 60 s | Gebäudename | `:1095-1111, 2316-2330` | Ist beides leer, heißt das Gebäude „Root“, wie im Client (`src/murmur/Messages.cpp:403-404`). |
| `Server.getChannels` | **1 s** | Baum: `id`, `name`, `parent`, `position`, `links`, `temporary` | `:1219-1233, 147-158` | Root hat `id 0` und `parent -1`. `links` sind symmetrisch und direkt (`src/Channel.cpp:188-195`). IDs temporärer Kanäle werden wiederverwendet, also nicht über Löschungen hinweg cachen. |
| `Server.getUsers` | **1 s** | `session`, `name`, `channel`, `selfMute`, `selfDeaf`, `mute`, `deaf`, `suppress`, `address` | `:1201-1217, 108-145` | Enthält nur authentifizierte Nutzer. |
| `Server.getListeningUsers(cid)` | **3 s** je Kanal | Mitlauschen (Symbol am Raum) | `:2113-2129` | Es gibt kein Ereignis dafür, deshalb Polling. |
| `Server.hasPermission(session, cid, PermissionEnter=0x04)` | nach Strukturänderung und alle 10 s, **nur für gekoppelte Nutzer** | Schloss-Symbol und Klick vorab sperren | `:1371-1382`; `.ice:150` | Nutzt den ACL-Cache des Servers. Aufwand: gekoppelte Nutzer × Räume, also klein. |
| `Server.getState(session)` | beim `hello` des Plugins | Plausibilitätsprüfung | `:1480-1492` | Ist die Session unbekannt, kommt `InvalidSessionException` und das Plugin wird abgelehnt. |
| `Server.getCertificateList(session)` | beim `hello` des Plugins | SHA1 von `certs[0]` mit dem Hash des Plugins vergleichen | `:1275-1300`; `Server.cpp:1552` | Der Hash ist öffentlich und nur ein Plausibilitätsmerkmal (ADR-0004). Dass `certs[0]` das Leaf-Zertifikat ist, wird im Machbarkeitstest S3 geprüft. |
| `Server.getUptime` | mit jedem Poll | Neustart erkennen (Uptime wird kleiner) | `:1987` | Bei einem Neustart werden die Sessions neu vergeben. Der Dienst verwirft dann alle Kopplungen zur Session, die Plugins melden sich neu an. |

**Bewusst nicht genutzt:**

| Aufruf | Grund |
|---|---|
| `setState`, `startListening` und alle anderen Schreibmethoden | Der Dienst schreibt nie. Außerdem würde `setState` die ACL umgehen. |
| `addCallback` | Braucht das Write-Secret, siehe 3.1. |
| `userTextMessage` | Würde auch private Nachrichten liefern. |
| `getTree` | Teurer als `getChannels` plus `getUsers` |
| `getListeningChannels(session)` | `getListeningUsers` je Kanal reicht für das Raumsymbol. |

### 3.3 Sortierung

Der Client sortiert Geschwisterkanäle nach `position` und bei Gleichstand nach Name, per `localeAwareCompare` (`src/Channel.cpp:177-182`, `src/mumble/UserModel.cpp:176`). Ruumble macht das mit `Intl.Collator("de")` nach. Bei exotischen Namen kann die Reihenfolge minimal abweichen, das ist akzeptiert.

### 3.4 Last

Bei der erwarteten Größe (unter 100 Nutzer, unter 50 Kanäle) ergibt das Polling etwa 2 + 50/3 ≈ 19 Aufrufe pro Sekunde im Main-Thread des Servers. Das ist vertretbar. Die Kosten wachsen linear mit der Nutzerzahl (`ServerUser.cpp:110-122`). Im Machbarkeitstest S1 wird das gemessen.

---

## 4. Prüfpunkte der Machbarkeitstests

| # | Prüfen | Test / Ergebnis |
|---|---|---|
| P1 | Ist das Docker-Image `mumblevoip/mumble-server` mit Ice gebaut? Wie wird `ice=` konfiguriert (Umgebungsvariable oder INI)? | S1 · ✔ S1: Ice 3.7, Konfiguration über `MUMBLE_CONFIG_*` |
| P2 | Funktioniert Ice for JavaScript 3.7 (`ice` von npm, `slice2js`) unter aktuellem Node LTS? | S1 · ✔ S1: funktioniert. Achtung: Die CLI von `slice2js` 3.7.110 ist kaputt, deshalb `compile()` nutzen. |
| P3 | Aufwand für Polling im Main-Thread des Servers | S1 · ✔ S1: nicht messbar (< 0,1 % CPU, Ice-Aufrufe p95 < 3 ms) |
| P4 | Lädt das Plugin mit API 1.0.x im Mumble-Client von Ubuntu, Debian und Fedora? | S2 · ✔ S2: 1.4.287 (Fedora 44), 1.5.517 (Ubuntu 24.04), 1.5.735 (Debian 13) |
| P5 | Verhalten von Befehlen aus dem Netzwerk-Thread (Timeout nach 800 ms), Bestätigung per `onChannelEntered` | S2 · ✔ S2: Bestätigung per `onChannelEntered` nach 10–25 ms. Timeout nicht provoziert (API-Aufrufe 0–4 ms). Neu: Rate-Limit verwirft Wechsel still |
| P6 | Stimmt der SHA1 von `getCertificateList()[0]` mit `getUserHash` überein? | S3 · ✔ S1 + S2: `getUserHash` = SHA1 Client-Zertifikat = SHA1 `getCertificateList[0]` |
| P7 | Stimmen die `User.address` aus Ice und die Quell-IP der Plugin-Verbindung überein, wenn ein Reverse-Proxy und VPN dazwischen liegen? | S3 |
| P8 | Gibt es das Server-Image passend zu v1.6.870 (Tag-Schema von `mumblevoip/mumble-server`)? | S1 · ✔ S1: `mumblevoip/mumble-server:v1.6.870` (`latest` kann 1.5.x sein!) |
