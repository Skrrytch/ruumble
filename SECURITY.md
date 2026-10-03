# Security policy

## Supported versions

Security fixes go into the latest release only. Please update to it before reporting.

## Reporting a vulnerability

Please **do not open a public issue**. Report it privately through GitHub instead: [Report a vulnerability](https://github.com/Skrrytch/ruumble/security/advisories/new) (tab *Security* → *Report a vulnerability*).

Please include the affected component (service, web UI or plugin) and its version, and steps to reproduce. You get an answer within a week. Once a fix is released, the advisory is published, and you are credited if you like.

## Scope and design

Things that are relevant to a report:

- The service is meant to run **inside a home or company network or a VPN**, not openly on the internet (ADR-0004). Findings that need the service to be exposed to the internet are still welcome, but rated accordingly.
- The service only gets Ice's **read secret**; it never changes the Mumble server. Commands (move, mute, deafen) are carried out by the plugin in the user's own client.
- A browser is bound to a Mumble user by pairing (one-time link or 6-digit code from the Mumble log, ADR-0004 and ADR-0012) and then holds a device token in a cookie. Anything that lets one user act as another, read another room's board, or learn another user's talking state (ADR-0005) is in scope.
- Board uploads (files up to 10 MB by default, at most 100 MB; set in the building maintenance) and Markdown rendering in the web UI.
