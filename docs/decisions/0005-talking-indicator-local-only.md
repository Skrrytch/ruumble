# ADR-0005: Talking indicator only for what you can hear

Status: accepted (2026-09-28)

## Context
`onUserTalkingStateChanged` only reports users whose audio reaches the user's own client: the own channel, linked channels, channels one is listening to, as well as whisper and shout. When the user is deafened, nothing arrives at all. The service could combine the reports of all plugins.

## Decision
Each web UI shows **only the talking events of its own plugin**. The service forwards `talking` to the paired web UIs of the same user. It does not store the events and does not pass them on to other users.

## Consequences
- Ruumble reveals no more than the Mumble client itself.
- In other rooms there is no talking indicator unless one is listening there.
- When the user is deafened there is no talking indicator. The web UI then hides it and shows no stale state.
