# ADR-0010: Service address from the root channel description

Status: accepted (2026-09-28)

## Context
The plugin has to know at which address the Ruumble service runs. The plugin API, however, provides no server address, not even the host name of the Mumble connection, only a hash of the server certificate. Until now the address was fixed in the plugin at build time. Then every installation would need its own plugin, and several Mumble servers would not be possible.

## Options
1. Fix the address at build time (previous approach)
2. Only `~/.config/ruumble/plugin.json`, maintained by hand by every user
3. **The server names the address in the root channel description**; the plugin reads it with `getChannelDescription`.
4. Discovery in the local network (DNS-SD/mDNS): complex, and it does not work over VPN

## Decision
Option 3, with `plugin.json` as an override:
- **Format:** a line of the root channel description *ends* with `ruumble: <address>`. Any text may come before it, e.g. `- `. Mumble stores descriptions as HTML: tags are removed, `<br>` and paragraph ends become line breaks, entities are decoded. If the scheme is missing, `http://` is added. Only http and https are allowed. The first matching line counts.
- **Precedence:** `bridgeUrl` in `plugin.json`, then the root channel description. Without a matching line the plugin stays silent on this server.
- **When:** on every sync. When Mumble disconnects, the plugin also disconnects from the service. A different server can name a different service.
- **Pairing per service:** `pairedWith` in `plugin.json` instead of a single `paired`. The older value `"paired": true` still applies to a fixed `bridgeUrl`.

## Limitation (checked in the Mumble code and live)
The server sends descriptions of **128 characters or more** only as a hash (`Server::hashAssign`, `Messages.cpp`). The client loads the text only when a user looks at it, i.e. on the tooltip over the channel or when editing it. Until then the API returns `MUMBLE_EC_UNSYNCHRONIZED_BLOB`. After that, the client caches the text permanently.
- Shorter descriptions work immediately. In Mumble's HTML editor, however, a description easily becomes longer than the visible text.
- With a long description, the plugin writes a note to the Mumble log once (*"Hover once over the top channel "<server name>" …"*) and checks again every 3 s. In the client the channel is named after the `registername`, not "Root".

## Consequences
- **One plugin for all servers**, without a build per installation. The CMake option `RUUMBLE_DEFAULT_BRIDGE_URL` is dropped.
- The line in the root channel description is visible to everyone. This is not critical, because the service is reachable only in the home network or VPN anyway.
- Slight deviation from L3: besides the channel structure, Ruumble reads a technical setting. The presentation is not affected.
- Live test: short description → paired immediately. Long description → paired only after a hover (`web/e2e-live`).

Current state (code): the note in the Mumble log is localised (German or English, from the user's locale). The line pattern is in `plugin/src/discovery.cpp`; `ruumble:` must stand as a separate word (e.g. not `xruumble:`).
