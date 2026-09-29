# Mumble interfaces used by Ruumble

As of 2026-09-28 · Analysed: [mumble-voip/mumble](https://github.com/mumble-voip/mumble) commit 7bbd2c16a (`master`, 2026-09-26). The two interface files there are identical to release **v1.6.870**, which Ruumble is pinned to (`third_party/mumble/VERSION`).

This document lists **every call** Ruumble makes to Mumble, each with a reference into the Mumble code. Ruumble uses only the public interfaces:

- **Client:** the plugin API, header `plugins/MumblePlugin.h`
- **Server:** the Ice interface, `src/murmur/MumbleServer.ice`

Both are kept unchanged under `third_party/mumble/`. **Paths in the references point into the Mumble repository**, not into Ruumble. To look them up: `git clone https://github.com/mumble-voip/mumble && git checkout 7bbd2c16a`.

The results of the feasibility studies S1 and S2 mentioned below are summarised in [internal/feasibility-studies.md](internal/feasibility-studies.md).

---

## 1. Separation between Mumble and Ruumble

```
┌──────────────── Mumble (unchanged, release v1.6.870) ──────────────────┐
│  Mumble client (distro package)          Mumble server (Docker image)  │
│        ▲ plugin API v1.0.x                        ▲ Ice (read-only)    │
└────────┼──────────────────────────────────────────┼────────────────────┘
         │ third_party/mumble/plugins/MumblePlugin.h │ …/src/murmur/MumbleServer.ice
┌────────┼──────────────── Ruumble (own repo) ──────┼────────────────────┐
│  plugin/ ──wss (outgoing)──▶ bridge/ ◀──wss── web/                     │
└────────────────────────────────────────────────────────────────────────┘
```

| Rule | Implementation |
|---|---|
| Ruumble is a **standalone repository** ([ADR-0009](decisions/0009-standalone-repository.md)). | Only the two interface files are taken from Mumble, unchanged and pinned to a release tag, with checksums and the BSD-3 licence (`third_party/mumble/`). |
| The interfaces are never edited by hand. | They are updated only with `tools/update-mumble-interfaces.sh <tag>`. CI checks `SHA256SUMS`. |
| Ruumble does not build Mumble. | The plugin has its **own CMake project** with the include path `third_party/mumble/plugins`. The service generates Ice stubs from `third_party/mumble/src/murmur/MumbleServer.ice`. |
| The runtime does not depend on our own build of Mumble. | The plugin runs in the **Mumble client of the Linux distribution** or the official Windows client, the service next to the **official server image**. Neither Mumble part is built by us. |
| The server state is never changed. | The service only gets `icesecretread`. Callbacks and write methods are therefore technically blocked (see 3.1). |
| Actions run only in the user's own client. | Channel changes, mute and deafen are carried out by the plugin in the user's client. The server's ACL and rate limit apply exactly as for a click in Mumble. |

---

## 2. Client: plugin API

### 2.1 Basics

| Topic | Finding | Reference |
|---|---|---|
| **API version** | We use **1.0.x**. The only difference to 1.2.x is `playSample(volume)`, which we do not need. With 1.0.x the plugin runs on Mumble 1.4 and later. | `plugins/MumblePlugin.h:42-50, 1209-1212, 1808`; `src/mumble/Plugin.cpp:326-336` |
| **Required exports** | `mumble_init`, `mumble_shutdown`, `mumble_getName`, `mumble_getAPIVersion`, `mumble_registerAPIFunctions`, `mumble_releaseResource` | `src/mumble/Plugin.cpp:83-97` |
| **Optional exports** | Ruumble also exports `mumble_setMumbleInfo` (Mumble calls it first, before `mumble_init`, with the client version; the plugin sends that version in its `hello`, see section 4), plus `mumble_getVersion`, `mumble_getAuthor` and `mumble_getDescription` for the plugin list. | `plugins/MumblePlugin.h` |
| **API struct** | **Copy** it on registration. Mumble passes a pointer to the stack. | `plugins/MumblePlugin.h:735-738` |
| **Header** | Include it without extras in **one** translation unit only. All others set `MUMBLE_PLUGIN_NO_DEFAULT_FUNCTION_DEFINITIONS`, otherwise a duplicate symbol results. | `plugins/MumblePlugin.h:12-16, 1187-1192` |
| **Loading** | Mumble loads the library (`dlopen`, `LoadLibrary`) while scanning, even if the plugin is disabled. So the thread is only started in `mumble_init`. `mumble_shutdown` must stop it with `join`, because Mumble unloads the library afterwards. | `src/mumble/Plugin.cpp:36, 54-56`; `docs/dev/plugins/PluginLifecycle.md:17-19` |
| **Threading** | All API calls run on Mumble's main thread. A call from another thread is queued and waits **at most 800 ms**, then `MUMBLE_EC_API_REQUEST_TIMEOUT` is returned. | `src/mumble/API_v_1_x_x.cpp:1654-1676` |
| **Memory** | Strings and arrays returned by the API must be released with `freeMemory`. | `src/mumble/API_v_1_x_x.cpp:165-197` |
| **Installation** | A zip with the extension `.mumble_plugin` and a `manifest.xml`; ours lists `libruumble.so` (`os="linux"`) and `ruumble.dll` (`os="windows"`), both `arch="x64"`, and Mumble installs the one for its platform (ADR-0013). There is **no signature**. The user must **enable the plugin by hand**; the default is `enabled=false`. | `src/mumble/PluginInstaller.cpp:38-133`; `src/mumble/PluginManifest.cpp:30-124`; `src/mumble/Settings.h:96-100` |
| **Permissions** | We need neither "Positional data" nor "Keyboard monitoring". | `src/mumble/PluginConfig.cpp:99-113` |

### 2.2 Calls (plugin → Mumble)

| Call | When | Purpose | Reference | Handling of risks |
|---|---|---|---|---|
| `getActiveServerConnection` | before every command | get the connection handle | `API_v_1_x_x.cpp:199-224` | Without a connection the command is rejected with `offline`. |
| `isConnectionSynchronized` | together with `getActiveServerConnection`, and in `mumble_init` | only treat a synchronized connection as "connected" | `API_v_1_x_x.cpp` (`isConnectionSynchronized_v_1_0_x`) | If the plugin is enabled while a connection already exists, no `onServerSynchronized` follows. `mumble_init` therefore checks this and starts the sync handling itself. |
| `getLocalUserID` | `onServerSynchronized` | **own session ID**. It is identical to the server session in Ice. | `API_v_1_x_x.cpp:273`; `src/mumble/Messages.cpp:129` | Mumble assigns new session IDs after a reconnect. The plugin therefore sends a new `hello` on every sync. |
| `getUserHash(own ID)` | `onServerSynchronized` | certificate hash (SHA1) as a **stable key** across reconnects, for pairing and the plausibility check | `API_v_1_x_x.cpp:661-697`; `src/murmur/Server.cpp:1552` | An empty hash is rejected; the plugin then writes a note to the Mumble log. |
| `getChannelOfUser(own ID)` | `onServerSynchronized` | own current channel | `API_v_1_x_x.cpp` (`getChannelOfUser_v_1_0_x`) | Used so that a `join` into the current channel is answered `ok` at once (no `onChannelEntered` would come, see [ADR-0003](decisions/0003-commands-and-feedback.md)). After that the plugin tracks its channel via `onChannelEntered`. |
| `requestUserMove(conn, self, ch, NULL)` | command `join` | change channel | `API_v_1_x_x.cpp:897-943` | `OK` only means "request sent". **The API does not report a refusal**; it only shows up in the log (`src/mumble/Messages.cpp:227-252`). The plugin detects success by `onChannelEntered` for its own session. If that does not arrive within 3 s, the change counts as rejected (see ADR-0003). Password-protected channels are not supported (`password = NULL`). |
| `requestLocalUserMute(bool)` | command `mute` | self-mute | `API_v_1_x_x.cpp:1006-1031`; `src/mumble/MainWindow.cpp:2779-2813` | Behaves **like the button in Mumble**: unmuting while deafened also undeafens. Every call writes a log entry, so it is only called on a real change. |
| `requestLocalUserDeaf(bool)` | command `deaf` | self-deafen | `API_v_1_x_x.cpp:1033-1058`; `MainWindow.cpp:2816-2858` | Deafen also mutes. Undeafen only unmutes if the mute came from deafen. This matches SPEC 3. |
| `isLocalUserMuted` / `isLocalUserDeafened` | right after `mute`/`deaf` | report the result to the service so the web UI reacts immediately, without waiting for the next Ice poll | `API_v_1_x_x.cpp:615-659` | The audio wizard sets `bMute` temporarily. The state from Ice therefore remains authoritative. |
| `getChannelDescription(conn, 0)` | on sync, then every 3 s while needed | address of the service from the root channel description ([ADR-0010](decisions/0010-address-from-root-description.md)) | `API_v_1_x_x.cpp` (`getChannelDescription_v_1_0_x`) | From 128 characters on, the server only sends a hash (`Server::hashAssign`); the call then returns `MUMBLE_EC_UNSYNCHRONIZED_BLOB` until a user looks at the tooltip. If the description is loaded but has no address line, the plugin checks again after 30 s. |
| `getChannelName(conn, 0)` | for the hint | name of the top channel as the client shows it (`registername`) | `API_v_1_x_x.cpp:344-362` | – |
| `log` | connect, connection problems and retries (from 0.4.1), rejection, missing certificate, the "hover over the root channel" hint, and `notify` texts from the service (board notices, pairing codes) | messages in the Mumble log window | `API_v_1_x_x.cpp` (`log_v_1_0_x`) | Mumble prefixes the plugin name itself. |
| `freeMemory` | after every getter | release memory | `API_v_1_x_x.cpp:165-197` | – |

**Deliberately not used:**

| Call | Reason |
|---|---|
| `getAllUsers`, `getAllChannels` | Ice provides the tree and the users completely, so there is no need to reconcile two sources. Also, `getAllUsers` and `getAllChannels` crash with `nullptr` (`API_v_1_x_x.cpp:406, 454`). |
| `sendData` | Works only between clients and is throttled to 4 calls per second. Of no use for us. |
| `requestSetLocalUserComment` | Not needed, because identity is settled by the plausibility check ([ADR-0004](decisions/0004-identity-and-pairing.md)). |
| `playSample` | Only available in 1.2.x and of no use for us. |

### 2.3 Callbacks (Mumble → plugin)

**Ground rule:** callbacks call the API only synchronously and briefly. They put messages into a thread-safe queue and **never wait** for the network thread (`plugins/MumblePlugin.h:1237-1246`).

| Callback | Thread | Action | Reference |
|---|---|---|---|
| `mumble_setMumbleInfo(version, …)` | Main | remember the client version (before `mumble_init`) | `plugins/MumblePlugin.h` |
| `mumble_init(id)` | Main | remember the ID, read the configuration, start the network thread; if already connected, run the sync handling | `Plugin.cpp:303-356` |
| `mumble_shutdown()` | Main | set the stop flag, close the WebSocket, `join` | `Plugin.cpp:358-382` |
| `mumble_onServerSynchronized(conn)` | Main | read session ID, hash and channel, put `hello` into the queue | `src/mumble/Messages.cpp:193` |
| `mumble_onServerDisconnected(conn)` | **ServerHandler** | only put `offline` into the queue and **do not block** | `MainWindow.cpp:1267-1268` |
| `mumble_onChannelEntered(conn, user, prev, new)` | Main | if `user` is the own session, report a pending `join` as confirmed | `src/Channel.cpp:82-85` |
| `mumble_onUserTalkingStateChanged(conn, user, state)` | Main (queued) | forward `talking`. The service passes it on **only to the user's own web UI** ([ADR-0005](decisions/0005-talking-indicator-local-only.md)). | `ClientUser.cpp:67-68, 153-165`; `PluginManager.cpp:710-757` |

Limits of `onUserTalkingStateChanged`:

- Only what the client hears is reported: the own channel, linked channels, channels being listened to, and whisper and shout (`src/murmur/Server.cpp:1193-1340`).
- When the user is **deafened**, nothing arrives at all (`AudioReceiverBuffer.cpp:60`).
- The own user is `PASSIVE` while self-muted (`AudioInput.cpp:992-1009`).

Not used: `onServerConnected` (not yet synchronized), `onUserAdded/Removed` and `onChannel*` except `onChannelEntered`, because the structure comes from Ice.

---

## 3. Server: Ice interface

### 3.1 Basics

| Topic | Finding | Reference |
|---|---|---|
| Server version | **Mumble server 1.5 or later.** In 1.5 the Ice module was renamed from `Murmur` to `MumbleServer`. The service looks up `MumbleServer::Meta`; against a 1.4 server this lookup fails and the service stops with a clear error message (`bridge/src/mumble.ts`). | `src/murmur/MumbleServer.ice` |
| Ice versions | 3.6 and 3.7, C++98 mapping. Whether 3.8 works is not verified. The service uses `ice` 3.7.110 from npm. | `src/murmur/CMakeLists.txt:17, 198-212`; `MumbleServerIce.cpp:321-325` |
| Endpoint | Enabled with `ice="tcp -h … -p 6502"`. Without this key Ice does not start. | `auxiliary_files/mumble-server.ini:53`; `Meta.cpp:345`; `MumbleServerIce.cpp:290-291` |
| **Secrets** | Without its own value, `icesecretwrite` takes the value of `icesecretread`. So **always set both, with different values**. The service only gets the read secret. | `Meta.cpp:346-348`; `scripts/generateIceWrapper.py:41-65` |
| **Callbacks** | `Server.addCallback` and `Meta.addCallback` need the **write secret**. The server also sends it along with every callback. **Hence polling** ([ADR-0002](decisions/0002-read-only-ice-polling.md)). | `MumbleServerIce.cpp:1017-1033, 2360-2374, 313-316` |
| Execution | Every Ice call runs on the server's Qt main thread and returns a consistent state. Nothing is atomic across two calls. | `generateIceWrapper.py:67-68`; `docs/dev/MurmurLocking.md:12-14` |
| Future | Ice is still maintained, e.g. 08777dfcf "Mark channel listener getter functions as read-only accessible". gRPC was removed in 2022; no replacement has been announced. | `git log` |

### 3.2 Calls (service → Mumble server)

All calls are allowed with the **read secret**. The intervals are those in `bridge/src/poller.ts` (base tick 1 s).

| Call | Interval | Purpose | Reference | Notes |
|---|---|---|---|---|
| `Meta.getVersion` | at start, then every 60 s (with the server name) | server version for the version line | `MumbleServerIce.cpp:2348` | Needs no secret. |
| `Meta.getBootedServers` | on connect | find the virtual server (in 1.6.870 the first instance has **ID 0**, S1) | `:2332-2346` | Skipped if `SERVER_ID` is set. The proxy contains the endpoint as seen by the server (the container IP). So only its identity is used and `s/<id>:tcp -h <host> -p <port>` is built by the service (S1). |
| `Server.getConf("registername")`, fallback `Meta.getDefaultConf` | at start, every 60 s | building name | `:1095-1111, 2316-2330` | If both are empty the building is called "Root", as in the client (`src/murmur/Messages.cpp:403-404`). |
| `Server.getChannels` | **1 s** | tree: `id`, `name`, `parent`, `position`, `links`, `temporary` | `:1219-1233, 147-158` | Root has `id 0` and `parent -1`. `links` are symmetric and direct (`src/Channel.cpp:188-195`). IDs of temporary channels are reused, so do not cache them across deletions. |
| `Server.getUsers` | **1 s** | `session`, `name`, `channel`, `selfMute`, `selfDeaf`, `mute`, `deaf`, `suppress`, `userid`, `idlesecs`, `recording`, `address` | `:1201-1217, 108-145` | Contains authenticated users only. `userid` (registered users) is used for avatars, `idlesecs` and `recording` for the quiet/away and recording indicators. |
| `Server.getListeningUsers(cid)` | **3 s** per channel | listening (icon on the room) | `:2113-2129` | There is no event for this, hence polling. |
| `Server.hasPermission(session, cid, PermissionEnter=0x04)` | after a structure change and every 10 s, **only for paired users** | lock icon, and block the click in advance | `:1371-1382`; `.ice:150` | Uses the server's ACL cache. Cost: paired users × rooms, so small. |
| `Server.hasPermission(session, cid, PermissionWrite)` | on board requests | who may moderate the board of a room ([ADR-0011](decisions/0011-own-storage-for-the-board.md)) | `:1371-1382` | Only a read of the ACL; nothing is written to Mumble. |
| `Server.getCertificateList(session)` | on the plugin's `hello` | compare SHA1 of `certs[0]` with the plugin's hash | `:1275-1300`; `Server.cpp:1552` | The hash is public and only a plausibility feature (ADR-0004). S1 and S2 confirmed that `certs[0]` is the client's own certificate. |
| `Server.getTexture(userid)` | on first appearance, then every 5 min | avatar image of registered users | `MumbleServerIce.cpp` (`impl_Server_getTexture`) | **Broken since 1.6:** throws `InvalidUserException` for registered users (inverted condition; correct in 1.5.735). Ruumble then falls back to initials. |
| `Server.getUptime` | with every poll | detect a restart (uptime decreases) | `:1987` | Sessions are reassigned after a restart. The service then drops all pairings to sessions; the plugins log in again. |

The plausibility check on the plugin's `hello` uses the user list from the last `getUsers` (the service polls once more at once if the session is not yet known), `getCertificateList` and the comparison of `User.address` with the source IP of the plugin connection (`ADDRESS_CHECK`). `Server.getState(session)`, which the original plan listed for this, is not needed.

**Deliberately not used:**

| Call | Reason |
|---|---|
| `setState`, `startListening` and all other write methods | The service never writes. Also, `setState` would bypass the ACL. |
| `addCallback` | Needs the write secret, see 3.1. |
| `userTextMessage` | Would also deliver private messages. |
| `getTree` | More expensive than `getChannels` plus `getUsers`. |
| `getListeningChannels(session)` | `getListeningUsers` per channel is enough for the room icon. |
| `getState(session)` | The user list from `getUsers` already contains the session. |

### 3.3 Sorting

The client sorts sibling channels by `position` and, on a tie, by name using `localeAwareCompare` (`src/Channel.cpp:177-182`, `src/mumble/UserModel.cpp:176`). Ruumble reproduces this with `Intl.Collator("de")`. With exotic names the order may differ slightly; this is accepted.

### 3.4 Load

At the expected size (fewer than 100 users, fewer than 50 channels) polling amounts to about 2 + 50/3 ≈ 19 calls per second on the server's main thread. That is acceptable. The cost grows linearly with the number of users (`ServerUser.cpp:110-122`). Feasibility study S1 measured it: not measurable (< 0.1 % CPU, Ice calls p95 < 3 ms).

---

## 4. Version compatibility and change detection

**Tested versions** (automated live tests with real servers and distro clients):

| Part | Versions |
|---|---|
| Mumble server (`mumblevoip/mumble-server`) | 1.5.735, 1.6.870 (plus the current `latest` tag) |
| Mumble client (distro package) | 1.4.287 (Fedora 44), 1.5.517 (Ubuntu 24.04), 1.5.735 (Debian 13) |

Minimum requirements: server 1.5 (Ice module `MumbleServer`, see 3.1), client 1.4 (plugin API 1.0.x, see 2.1). Known deviation: `getTexture` is broken in server 1.6 and later, so avatars only work with 1.5.x (see 3.2).

**Change detection:**

- **Release watch** (`.github/workflows/mumble-release-watch.yml`, weekly on Mondays and on demand): compares the latest Mumble release with `third_party/mumble/VERSION`. If there is a newer one, it opens an issue with a diff of the two interface files (produced with `tools/update-mumble-interfaces.sh`) and starts the live tests against that release.
- **Live tests** (`.github/workflows/live.yml`, weekly on Tuesdays, on demand, and triggered by the release watch): start a real Mumble server and headless Mumble clients with the Ruumble plugin, and run the Playwright tests in `web/e2e-live`. The standard matrix is server v1.5.735, v1.6.870 and `latest` with the Ubuntu client, plus server v1.6.870 with the Debian and Fedora clients. These catch behaviour changes that a diff of the interface files does not show. The client images and test tools are in `tools/live-test/`.
- **Client versions in operation:** the plugin reports the Mumble client version (from `mumble_setMumbleInfo`) and its own version in its `hello`. The service counts connected plugins per version and shows them under `"clients"` in `/healthz`, e.g. `{ "mumble 1.5.735 / plugin 0.4.1": 2 }`.

---

## 5. Checkpoints of the feasibility studies

| # | Check | Study / result |
|---|---|---|
| P1 | Is the Docker image `mumblevoip/mumble-server` built with Ice? How is `ice=` configured (environment variable or INI)? | S1 · ✔ S1: Ice 3.7, configured via `MUMBLE_CONFIG_*` |
| P2 | Does Ice for JavaScript 3.7 (`ice` from npm, `slice2js`) work on current Node LTS? | S1 · ✔ S1: works. Caution: the `slice2js` 3.7.110 CLI is broken, so use `compile()`. |
| P3 | Cost of polling on the server's main thread | S1 · ✔ S1: not measurable (< 0.1 % CPU, Ice calls p95 < 3 ms) |
| P4 | Does the plugin with API 1.0.x load in the Mumble client of Ubuntu, Debian and Fedora? | S2 · ✔ S2: 1.4.287 (Fedora 44), 1.5.517 (Ubuntu 24.04), 1.5.735 (Debian 13) |
| P5 | Behaviour of commands from the network thread (timeout after 800 ms), confirmation via `onChannelEntered` | S2 · ✔ S2: confirmation via `onChannelEntered` after 10–25 ms. Timeout not provoked (API calls 0–4 ms). New: the rate limit silently drops channel changes |
| P6 | Does the SHA1 of `getCertificateList()[0]` match `getUserHash`? | S3 · ✔ S1 + S2: `getUserHash` = SHA1 of the client certificate = SHA1 of `getCertificateList[0]` |
| P7 | Do `User.address` from Ice and the source IP of the plugin connection match when a reverse proxy and VPN are in between? | S3 · answered for the proxy: passes in the Docker network with `ADDRESS_CHECK=enforce`; behind the reverse proxy on the home server (2026-09-29), browser and plugin reach the service through the router's public address (hairpin NAT, `TRUST_PROXY=true`), while Mumble sees the LAN address of the client. The addresses never match, so `enforce` rejects every plugin there and `warn` is required. VPN not tested. The default is `ADDRESS_CHECK=warn`. |
| P8 | Is there a server image matching v1.6.870 (tag scheme of `mumblevoip/mumble-server`)? | S1 · ✔ S1: `mumblevoip/mumble-server:v1.6.870` (`latest` may be 1.5.x!) |
