# ADR-0002: Read-only Ice access by polling

Status: proposed (2026-09-28)

## Context
Ice callbacks (`Server.addCallback`) need the write secret. The server also sends this secret to the receiver with every callback (`MumbleServerIce.cpp:1017-1033, 313-316`). Whoever uses callbacks therefore has write access, and "read only" becomes merely a matter of discipline in the code. For listening (channel listeners) there is no event anyway. Ice for JavaScript cannot receive callbacks.

## Options
1. **Polling with the read secret**
2. Callbacks with the write secret, and polling as a safety net

## Decision
Option 1. The service gets **only** `icesecretread`. `icesecretwrite` is set to a different random value and is not given to the service. Polling intervals:

| Data | Interval |
|---|---|
| `getChannels`, `getUsers`, `getUptime` | 1 s |
| `getListeningUsers` per channel | 3 s |
| `hasPermission` for paired users | on structure change and every 10 s |
| `registername` | 60 s |

The service computes the difference to the previous state. It sends a new state to the web UIs only when something has changed.

## Consequences
- Writing is technically impossible: the service cannot change the server, not even through a bug.
- Changes appear with up to 1 s delay, listening with up to 3 s. The plugin reports the user's own actions (mute, deafen, switch) immediately (ADR-0003), so feedback on one's own actions comes without delay.
- The server has a small base load (about 20 calls/s with 50 channels). It is measured in feasibility study S1 (see [feasibility studies](../internal/feasibility-studies.md)).

Current state (code, `bridge/src/poller.ts`): the poller runs in rounds of 1 s. Listeners are fetched every 3rd round, permissions every 10th round (and after a structure change, a server restart or a newly paired session), server info (`registername`, version) every 60th round.
