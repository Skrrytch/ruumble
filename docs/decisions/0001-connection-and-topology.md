# ADR-0001: Connection and topology – plugin and service as the hub

Status: accepted (2026-09-28)

## Context
The web UI needs four things: the complete channel tree (parent channel, position, links), the state of all users, the user's own identity, and it must be able to control the user's own client (switch channel, mute, deafen). Guardrail L1 forbids changes to the Mumble code; a PR to Mumble is ruled out. The plugin API alone knows neither the parent channel nor the position nor the state of other users. Ice alone cannot mute the user and does not know the user's identity (see [Mumble interfaces](../mumble-interfaces.md)).

## Options considered
1. **Service as the central hub:** the service reads via Ice, the plugin connects outbound, the service delivers the web UI.
2. Plugin as a local gateway (`127.0.0.1`); the web UI additionally connects to the service.
3. A separate desktop window (Tauri).
4. A Mumble fork with an extended plugin API (violates L1 and L2).

## Decision
Option 1:
```
Browser/PWA ──wss──▶ Ruumble service ──Ice (read only)──▶ Mumble server
                         ▲
                         │ wss (outbound)
                    Ruumble plugin ──plugin API──▶ Mumble client (audio unchanged)
```
- **The Mumble server via Ice** is the source of the structure: tree, users, mute state, listening, permissions, version.
- **The plugin** is the source of the identity (session, certificate hash) and of talking. It also executes the commands.
- **The service** combines both, serves the web UI and forwards commands from the web UI to the plugin of the user in question.

## Consequences
- There is no patch to Mumble. The plugin runs in the distribution's Mumble client.
- The plugin stays small: one outbound WebSocket; it opens no local port.
- Without a running plugin there is no web UI (ADR-0004).
- The service is an additional server component that has to be operated (ADR-0008).
