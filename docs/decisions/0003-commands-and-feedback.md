# ADR-0003: Commands and feedback

Status: proposed (2026-09-28), extended after feasibility study S2

## Context
- `requestUserMove` only reports "request sent". If the server refuses (missing permission, full channel), this only shows up in the log. A rate limit silently drops requests (`src/murmur/Messages.cpp:795-822`).
- API calls from the network thread can fail with a timeout after 800 ms.
- `requestLocalUserMute/Deaf` behave like the buttons in the Mumble client.

## Decision
1. **Lock in advance:** for the paired user, the service delivers `canEnter` per room (`hasPermission(session, cid, Enter)`). The web UI shows a lock and does not allow the click.
2. **No optimistic switching.** After the click the web UI shows a transition state. The switch counts as confirmed when the plugin reports `onChannelEntered` for its own session. If no confirmation arrives within **3 s**, the web UI shows "Switch not possible".
3. **Commands with an ID:** `{id, type: join|mute|deaf, ...}`. The plugin answers with `{id, result: ok|rejected|superseded|timeout|offline}`.
4. If an API call fails with a **timeout**, the plugin retries exactly **once**, then reports `timeout`.
5. **Mute/deafen:** the web UI sends the *target state*. The plugin calls the API only if the state really changes, and then reports the actual state (`isLocalUserMuted/Deafened`). Ruumble takes the semantics (deafen also mutes, unmute also undeafens) from Mumble and does not reimplement them.
6. Password-protected channels are not supported (`password = NULL`). Without permission to enter they appear with a lock.
7. **Order and rate limit** (S2: with the default settings the server silently drops 2 of 6 quick switches):
   - The plugin processes commands **in order**. If several `join` commands are pending, **only the last one** counts. The older ones are answered with `superseded`; the web UI then simply shows the new transition state.
   - There is at least **1 s** between two messages that change the user state (`join`, `mute`, `deaf`).
   - A `join` to the current channel is `ok` immediately, without an API call, because Mumble would not send a confirmation for it.
   - If no confirmation arrives for a room with `canEnter = true`, the rate limit was probably the cause. The plugin retries after 1 s **exactly once** and only then reports `rejected`.

## Consequences
- The web UI never shows a state that the server does not have.
- There is no separate mute/deafen logic that could differ from the client (S2: all transitions identical in 1.4 and 1.5).
- Quick clicking always ends up in the room chosen last, even when the server's rate limit kicks in.

Current state (code): the message format is `{v: 1, type: "command", id, body: {cmd: "join", channel} | {cmd: "mute", on} | {cmd: "deaf", on}}` (`protocol/src/index.ts`, see ADR-0007). The plugin's timings are in `plugin/src/core.h` (`spacing` 1000 ms, `confirmTimeout` 3000 ms). The service additionally rejects more than 5 commands per second from one web UI and rejects a `join` to an unknown channel or one without `canEnter` (`bridge/src/hub.ts`).
