# ADR-0009: Standalone repository instead of a Mumble fork

Status: accepted (2026-09-28)

## Context
Originally, development was to take place in a fork of Mumble (`Skrrytch/roomble`) in the folder `rooms/`. With the architecture from ADR-0001, however, Ruumble builds neither the Mumble client nor the server. Only two interface files are needed from Mumble.

## Options
1. **Standalone repository** (`Skrrytch/ruumble`); the two interface files are pinned under `third_party/mumble/`.
2. Fork with `rooms/`, upstream sync and a CI check that ensures nothing changes outside `rooms/`.
3. Git submodule pointing to Mumble (full checkout at a tag).

## Decision
Option 1.
- The files `plugins/MumblePlugin.h` and `src/murmur/MumbleServer.ice` are taken **unchanged** from a **release tag**, not from `master`. Reason: Ruumble is meant to run against released versions. Currently this is **v1.6.870**.
- Mumble's `VERSION`, `SHA256SUMS` and BSD-3 `LICENSE` are kept next to them.
- Updates happen only via `tools/update-mumble-interfaces.sh <tag>`. Afterwards, [Mumble interfaces](../mumble-interfaces.md) is checked against the differences.
- A CI job checks `SHA256SUMS`. A weekly job reports a newer Mumble release as an issue.
- The name in the plugin and in the product is **Ruumble**.

## Consequences
- The Mumble history, the submodules and the Mumble CI are gone, as is the risk of accidentally opening a PR at mumble-voip.
- The only dependency on Mumble is clearly visible, versioned and verifiable.
- The fork `Skrrytch/roomble` is no longer needed and can be archived.
