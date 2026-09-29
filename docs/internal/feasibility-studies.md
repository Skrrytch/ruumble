# Feasibility studies S1 and S2

Date: 2026-09-28 · Result: **both passed.**

Two spikes checked the riskiest assumptions before the service and the plugin were built:

- **S1:** Can a Node.js service read everything it needs from the Mumble server over Ice, with the read secret only?
- **S2:** Does a minimal plugin with plugin API 1.0.x work in the Mumble clients shipped by Linux distributions?

The spike code (`spikes/s1-ice/`, `spikes/s2-plugin/`) was removed after the studies and is only available in the git history. The parts that are still used (setup script, test bot, headless client images) now live in `tools/live-test/`. The checkpoints P1–P8 are listed in [../mumble-interfaces.md](../mumble-interfaces.md#5-checkpoints-of-the-feasibility-studies).

---

## S1: Ice from Node.js

**Goal:** verify that the service can be written in Node.js/TypeScript ([ADR-0006](../decisions/0006-tech-stack.md)), that all planned Ice calls work with the read secret, that writes are blocked, and that polling does not load the server (P1, P2, P3, P8, server side of P6).

### Setup

| Part | Description |
|---|---|
| Server | `mumblevoip/mumble-server:v1.6.870` via Docker Compose, Ice on `0.0.0.0:6502` inside the container, published on `127.0.0.1:6502` for the test |
| Ice client | `ice` 3.7.110 from npm, stubs generated with `slice2js` 3.7.110 from `third_party/mumble/src/murmur/MumbleServer.ice`, Node 22.15 |
| Test data | A setup script created the channel tree using the **write secret** (test preparation only): 4 floors, 16 rooms, 1 sub-channel (3rd level), 1 link, 1 room where entering is denied |
| Users | 30 test bots: a minimal Mumble client in Node (TLS + protobuf, control channel only, own certificates). It sets channel, self-mute, self-deafen and listening. |
| Test | All planned calls with the **read secret**, negative checks, load measurement |

### Results

**P1 – server image with Ice.** The image links against `libIce.so.37`, so it is built with **Ice 3.7**. Configuration is via environment variables `MUMBLE_CONFIG_<KEY>` (e.g. `MUMBLE_CONFIG_ICE`, `MUMBLE_CONFIG_ICESECRETREAD`) or Docker secrets `/run/secrets/MUMBLE_CONFIG_<KEY>`; the entrypoint treats the secrets as sensitive. Without a value the entrypoint sets `ice="tcp -h 127.0.0.1 -p 6502"`. Access from another container needs `MUMBLE_CONFIG_ICE: '"tcp -h 0.0.0.0 -p 6502"'` (do not publish the port).

**P8 – image tag.** `mumblevoip/mumble-server:v1.6.870` exists. `latest` may point to 1.5.x.

**P2 – Ice for JavaScript on Node 22.** Works, including structs, dictionaries, sequences and exceptions. Three pitfalls:

1. The `bin` entry of `slice2js` 3.7.110 is broken: it points to a module that only exports `compile()`, so the command silently does nothing and still exits with code 0. Fix: call `require("slice2js").compile([...])` from a script (today `bridge/scripts/gen-ice.mjs` and `tools/live-test/src/gen-ice.cjs`).
2. The proxy returned by `Meta.getBootedServers` contains the endpoint as seen by the server (`tcp -h 172.23.0.2 …`, the container IP). Only its identity is used; the proxy is built with our own host and port (`s/<id>:tcp -h <host> -p <port>`).
3. In 1.6.870 the first server instance has **ID 0**, not 1. The service determines the ID via `getBootedServers` and does not hard-code it.

**Calls checked (all with the read secret):**

| Call | Result |
|---|---|
| `Meta.getVersion` | 1.6.870 ✔ |
| `Meta.getBootedServers` | 1 server, ID 0 ✔ |
| `Server.getConf("registername")` | "Musterhaus" ✔. Ice returns the root channel as "Root", while clients show the registername. The service has to reproduce this. |
| `getChannels` | Root `id 0`, `parent -1` ✔. **Links are symmetric** although only one side was set ✔. `position` correct ✔. The 3rd level is visible ✔. |
| `getUsers` | 30 users ✔. **Session in Ice = session in the client** ✔. `selfMute`, `selfDeaf` (deafen also sets mute) and users in the root channel correct ✔. `address` comes as 16 bytes, IPv4 as `::ffff:a.b.c.d` ✔. |
| Refused channel change | The user stays in the old channel, the client gets `PermissionDenied` ✔. Confirms [ADR-0003](../decisions/0003-commands-and-feedback.md). |
| `getListeningUsers` | Returns the session of the listener ✔ |
| `hasPermission(…, Enter)` | Denied room `false`, normal room `true` ✔ |
| `getCertificateList[0]` | Its SHA1 equals the hash of the client certificate ✔ (server side of P6) |
| `getUptime` | ✔ |

**Negative checks.** With the read secret, `setState`, `addCallback` and `setChannelState` each fail with `InvalidSecretException`; a wrong secret fails too. **The service technically cannot change the server** ([ADR-0002](../decisions/0002-read-only-ice-polling.md) confirmed).

**P3 – load.** 30 users and 20 channels over 60 s, with the intervals from ADR-0002: base poll (`getChannels`, `getUsers`, `getUptime`) every second, `getListeningUsers` for all channels every 3 s.

| Measurement | without polling | with polling |
|---|---|---|
| Bot ping to server (p50 / p95 / max) | 1 / 3 / 1067¹ ms | 1 / 2 / 4 ms |
| CPU of the server container | 0.00 % | 0.00–0.05 % |
| Base poll (p50 / p95) | – | 1.4 / 2.8 ms |
| Listening for 20 channels (p50 / p95) | – | 1.3 / 2.6 ms |

¹ A single outlier at the start of the measurement, before polling ran.

Polling puts no measurable load on the server; the intervals from ADR-0002 stay.

**Other findings.**

- **Autoban:** many connections from one IP in a short time trigger Mumble's automatic ban ("Global ban"). The tests set `autobanAttempts=0`. This does not matter in operation, because the service does not connect as a Mumble client.
- **Licence:** `ice` and `slice2js` are **GPL-2.0** (ZeroC ships Ice under GPL or a commercial licence; the same applies to the Python packages). This became open question O13, resolved by decision E26 in the [charter](charter.md): the code stays BSD-3, a published image of the service is labelled as a GPL-2.0 combined work (ADR-0006).

### Conclusion

The service is written in Node.js/TypeScript as planned. Read-only polling via Ice is sufficient and cheap.

---

## S2: Plugin in distro Mumble clients

**Goal:** verify that a plugin with API 1.0.x loads in the distro clients, that session ID and certificate hash match Ice, and how commands, confirmations, talking events, reconnects and shutdown behave in a real client (P4, P5, plugin side of P6).

### Setup

| Part | Description |
|---|---|
| Plugin | **One** translation unit, plugin API **1.0.x** (`MUMBLE_PLUGIN_API_MINOR_MACRO 0`), own CMake, include path `third_party/mumble/plugins`. libstdc++ linked statically; the only runtime dependency is libc. |
| Pattern | Callbacks only queue events. A worker thread executed commands read from a file (standing in for the later WebSocket) and so called the API from a foreign thread. Results were written as JSON lines to a file. |
| Clients | Distro package `mumble`, one container per distribution, headless with Xvfb and PulseAudio. The null sink served as speaker, a **sine source as microphone**, so real talking events occur. |
| Server | The same Mumble server v1.6.870 as in S1 |
| Test | A script drove the plugin and checked **every result via Ice (read secret) on the server** |

### Results (identical on all three distributions)

| Check | Result |
|---|---|
| **P4** plugin loads | ✔ on 1.4.287 (Fedora 44), 1.5.517 (Ubuntu 24.04) and 1.5.735 (Debian 13). API 1.0.x is the right choice: **Fedora still ships 1.4**, where an API 1.2.x plugin would not run. |
| Session | ✔ `getLocalUserID` in the callback = session in Ice |
| **P6** hash | ✔ `getUserHash` (plugin) = SHA1 of the client certificate = SHA1 of `getCertificateList[0]` (Ice) |
| Channel change from the worker | ✔ The API call takes 0 ms; the confirmation via `onChannelEntered` arrives after 10–25 ms. |
| Change without enter permission | ✔ The API returns `OK`, **no** confirmation arrives, after 3 s the change counts as `rejected`. According to Ice the user stays in the old channel. Confirms ADR-0003. |
| Change into the current channel | The API sends nothing and no `channelEntered` arrives. Without special handling the result would be `rejected` after 3 s although nothing went wrong. → ADR-0003 changed |
| **Rate limit** | With Mumble's defaults (`messagelimit=1`, `messageburst=5`), **2 of 6** rapid changes are silently dropped. The user then does **not** end up in the room clicked last. → ADR-0003 changed |
| Mute/deafen | ✔ All 10 steps match the semantics of the Mumble buttons exactly (checked via Ice): deafen mutes, unmute undeafens, undeafen restores the previous mute state. If the target state is already reached, the plugin does not call the API. |
| Talking, own | ✔ `talking` with state 1 (TALKING) for the own session |
| Talking, other client in the same room | ✔ events for the other user (1 → 0) |
| Talking, other client in another room | ✔ no events. Confirms [ADR-0005](../decisions/0005-talking-indicator-local-only.md): only what the client hears is reported. |
| Talking, while deafened | ✔ no events |
| Server restart | ✔ `disconnected` on the ServerHandler thread, Mumble reconnects automatically, new `synchronized` **with a new session ID**. Confirms that a new `hello` is needed on every sync. |
| Quit with Ctrl+Q | ✔ `disconnected`, then `mumble_shutdown`. The worker thread ends after 9–96 ms. |
| Quit with SIGTERM | ✘ Mumble exits **without** `mumble_shutdown`. The plugin must not rely on being cleaned up; the service detects the end of the connection itself. |
| **P5** timeout (800 ms) | Not provoked. All API calls from the worker took 0–4 ms. A retry after a timeout was built in but never triggered in this test. |

### Findings for installation and tests

- **Plugin paths:** user installation `~/.local/share/Mumble/Mumble/Plugins/`; distro plugins `/usr/lib/x86_64-linux-gnu/mumble/plugins` (Debian/Ubuntu).
- **Enabling:** settings key `plugins.<sha1(file path)>.enabled`; in 1.5 as JSON (`~/.config/Mumble/Mumble/mumble_settings.json`, with `settings_version: 1` and categorised keys), in 1.4 as INI (`~/.config/Mumble/Mumble.conf`). Users enable the plugin normally in the settings dialog; only the tests preset it.
- **Quirks for automated tests** (irrelevant for real users):
  - The audio wizard and the certificate wizard appear on first start.
  - 1.4 reads the client certificate from `~/Documents/MumbleAutomaticCertificateBackup.p12`.
  - Trust in the server certificate is stored in the SQLite table `cert`.
  - `mumble --version` opens a window under 1.4 and hangs.
  - The "mute cue" notice is a modal dialog and blocks quitting.
  - Fedora 44 rejects a PKCS#12 in the old 3DES/SHA1 format; the default format works everywhere.
- **Build:** the plugin was built on Ubuntu 24.04 (glibc 2.39) and runs on all three distributions. For older distributions it has to be built in the oldest supported container.

### Conclusions

1. **ADR-0003 extended:**
   - The plugin **processes commands in order and coalesces channel changes**: of several pending `join` commands only the last one counts.
   - At least 1 s passes between two messages to the server.
   - A `join` into the current channel is `ok` at once.
   - If no confirmation arrives for a room with `canEnter = true`, the rate limit is the likely cause. The plugin then retries exactly once after 1 s and only then reports `rejected`.
2. The service's command rate limit was to be lowered from 2/s to 1/s. The code went a different way: the 1 s spacing and the 3 s confirmation timeout are enforced in the plugin (`plugin/src/core.h`), while the service accepts up to 5 commands per second per web UI (`MAX_COMMANDS_PER_SECOND` in `bridge/src/hub.ts`).
3. The plugin is built in the oldest supported distribution container, and the S2 client containers became the basis for the automated plugin tests (today `tools/live-test/clients/` and the live-test workflow).

---

## Open points and how they were resolved

| Point | Resolution |
|---|---|
| P5: 800 ms timeout of API calls from a foreign thread never observed | Not reproduced; calls take 0–4 ms. The plugin keeps its retry after a timeout. |
| P6: plugin side of the hash comparison | Resolved in S2 (see above). |
| P7: does the IP comparison (`User.address` vs. source IP of the plugin) work behind a reverse proxy and VPN? (study S3) | Deferred. The check is implemented as `ADDRESS_CHECK=off|warn|enforce` (default `warn`) and passes with `enforce` in the Docker network. Proxy (2026-09-29): proxy with hairpin NAT: `warn` required, VPN untested (see [P7](../mumble-interfaces.md#5-checkpoints-of-the-feasibility-studies)). |
| Change into the current channel, silent drops by the rate limit | Resolved by the ADR-0003 extension (see S2 conclusions). |
| SIGTERM skips `mumble_shutdown` | Accepted; the service detects the lost connection itself. |
| GPL licence of Ice (O13) | Resolved by decision E26 (see S1). |
| Support for older distributions | Build in the oldest supported container. |
