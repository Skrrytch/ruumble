# ADR-0007: Protocol and where the building is derived

Status: proposed (2026-09-28)

## Decision
1. **Transport:** JSON over WebSocket. Every message has the form `{v: 1, type, ...}`. There are two endpoints: `/ws/ui` and `/ws/plugin`.
2. **Complete states instead of individual changes:** after every change the service sends the complete `snapshot` to the web UIs, bundled over 100 ms. With fewer than 100 users and 50 channels this is a few KB. Individual changes (deltas) will only come if a measurement makes them necessary.
3. **The service delivers the raw Mumble data**, i.e. channels with `parent`, `position` and `links`, as well as users, listening and `canEnter`. **The building is derived in the web UI**, in the `building-model` module as pure functions. The building rules (section 3 of the [charter](../internal/charter.md)) (sorting, hiding linked channels, reasons for locking, entrance) live there in exactly one place and are covered by unit tests.
4. **Adapter interface** in the web UI: `MumbleAdapter { snapshot, onChange, join, setSelfMute, setSelfDeaf, onTalking, status }`. There are two implementations: `MockAdapter` (mock data and simulated events) and `LiveAdapter` (WebSocket to the service).

## Messages (version 1)
| Direction | Type | Content |
|---|---|---|
| Plugin → service | `hello` | `session`, `certHash`, `pluginVersion`, `paired` |
| Service → plugin | `welcome` / `reject` | With a reason on rejection. Optional `pairUrl` |
| Service → plugin | `command` | `id`, `join{channel}` / `mute{on}` / `deaf{on}` |
| Service → plugin | `notify` | `text`: a note for the Mumble log, e.g. when something is pinned to the board (ADR-0011) |
| Plugin → service | `result` | `id`, `ok` / `rejected` / `superseded` / `timeout` / `offline` |
| Plugin → service | `selfState` | `selfMute`, `selfDeaf` |
| Plugin → service | `talking` | `session`, `state` |
| Plugin → service | `bye` | Mumble was disconnected. |
| Web UI → service | `command` | as above; it is forwarded to the plugin with the same hash |
| Service → web UI | `snapshot` | `server{name, version}`, `self{session}`, `channels[]`, `users[]` (with `avatar`, `idleMinutes`, `recording`), `listeners{cid: session[]}`, `canEnter{cid: bool}` |
| Service → web UI | `talking`, `result`, `status` | `status` reports `plugin: connected/disconnected`, optionally `preview` |
| Service → web UI | `board` | `channelId`: something has changed on the board of this room (only to those present, without content) |

The board content does not go over the WebSocket but over REST under `/api/board` (posts, uploads, attachments; ADR-0011). The complete schemas are in `protocol/src/index.ts`, the JSON Schema in `protocol/schema/`.

## Consequences
- The service stays simple and does not know the building rules. If a rule changes, only the web UI needs to be adapted.
- Each web UI computes the derivation itself. With this amount of data that costs nothing.

## Current state (code)
- **No 100 ms bundling:** the service sends a snapshot whenever a poll round (every 1 s) produces a changed state, and again on a few other events (e.g. a new avatar image, a plugin connecting or disconnecting). Each web UI gets its own snapshot, because `self` and `canEnter` depend on the paired user. `self` is `null` while no paired plugin is connected (`bridge/src/hub.ts`).
- **Command format:** `command` carries `id` and `body`, where `body` is `{cmd: "join", channel}`, `{cmd: "mute", on}` or `{cmd: "deaf", on}`.
- **`hello`** additionally carries the optional fields `mumbleVersion` and `locale` (`de` / `en`), sent from plugin 0.4 on. `reject` carries `reason`: `unknown-session`, `hash-mismatch`, `address-mismatch` or `no-certificate`.
- **Building derivation:** it lives in `web/src/lib/model/building.ts`.
- **Adapter interface:** it has become `MumbleAdapter { start(events), stop(), command(body), board, avatarUrl? }` (`web/src/lib/adapter/types.ts`). Events (`snapshot`, `talking`, `status`, `board`, `connection`) arrive via the `events` object passed to `start`. `board` is the REST client for the board. Implementations: `MockAdapter` and `LiveAdapter` (WebSocket and REST).
