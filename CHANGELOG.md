# Changelog

All notable changes to Ruumble. The service and the web UI share one version; the plugin has its own, noted where it changed. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versions follow [Semantic Versioning](https://semver.org/).

0.14.0 is the first published release. Earlier versions were only run by the author and are listed for reference.

## [0.14.0] - 2026-09-30

Plugin 0.5.0.

### Added
- Plugin for **Windows** (x64, Mumble 1.4+), cross-built with MinGW-w64 and TLS via Mbed TLS. One `.mumble_plugin` bundle carries the Linux and the Windows library; Mumble installs the one for its platform (ADR-0013).
- Releases: Docker image `ghcr.io/skrrytch/ruumble` for linux/amd64 and linux/arm64, and a GitHub release with the plugin bundle, the Compose template and checksums.
- `THIRD_PARTY_NOTICES.md`, also in the image under `/app`.

### Changed
- The Compose template uses the published image instead of a locally built one.

## [0.13.2] - 2026-09-29

### Changed
- Board: the confirm button for the title of the post kept on top says "Ok".

## [0.13.1] - 2026-09-29

### Changed
- Board: a post is kept on top via the pin dot instead of the popup.

## [0.13.0] - 2026-09-29

### Added
- Board: keep one post on top of the room (A3).

## [0.12.2] - 2026-09-29

### Changed
- Task lists: `[]` without a space counts as an open task.

## [0.12.1] - 2026-09-29

### Added
- Keyboard shortcut <kbd>B</kbd> shows and hides the board.

## [0.12.0] - 2026-09-29

### Added
- Board: shared task lists (A2). Service and web UI use the same parser.

## [0.11.1] - 2026-09-29

### Changed
- Board: a smiley with a plus instead of a plain plus for adding a reaction.

## [0.11.0] - 2026-09-29

### Changed
- Board: compact layout with search, filter menu and a single toolbar row.

## [0.10.1] - 2026-09-29

### Added
- Board: 14 more quick reactions, the picker is a grid.

## [0.10.0] - 2026-09-29

### Added
- Board: quick reactions with a fixed meaning (A1).

## [0.9.0] - 2026-09-29

### Added
- Pair further browsers with a 6-digit code from the Mumble log (ADR-0012).

## [0.8.3] - 2026-09-29

### Added
- The notice pages show the service and plugin version.

## [0.8.2] - 2026-09-29

### Changed
- Installed web app: reuses the app window and captures links.

## [0.8.1] - 2026-09-29

Plugin 0.4.1.

### Added
- The plugin shows connection problems in the Mumble log.

## [0.8.0] - 2026-09-29

### Changed
- **Port 64080 instead of 8080.** See the update notes in `docs/operations.md`.
- HTTPS behind a reverse proxy: WebSocket keepalive and a setup guide.

## [0.7.2] - 2026-09-28

### Changed
- `/healthz` reports unknown client versions as `unknown`.

## [0.7.0] - 2026-09-28

Plugin 0.4.0.

### Added
- Web UI in German and English (German if the browser prefers it, otherwise English).
- Plugin messages and board notices in German and English.
- Mumble compatibility watch: live tests against real Mumble servers in CI, versions in `/healthz`.

## [0.6.1] - 2026-09-28

### Changed
- Compact board header, real avatars in the user menu and on post cards.

## [0.6.0] - 2026-09-28

Plugin 0.3.0.

### Added
- Short notice in the Mumble log of the others in the room when something is pinned to the board.

## [0.5.1] - 2026-09-28

### Changed
- The opening from the elevator core to the corridor follows the height of the floor plan.

## [0.5.0] - 2026-09-28

### Added
- Board: images (with full-screen zoom) and files up to 10 MB.

## [0.4.0] - 2026-09-28

### Added
- Board in every room with text (Markdown) and source code (ADR-0011).
- Floor layout: room size follows the Mumble position.
- 0.4.1 to 0.4.5: board polish (notes only in the own room, compact header, shortcuts in tooltips, code preview without line numbers).

## Before 0.4.0 - 2026-09-28

Plugin 0.1.0 to 0.2.0.

- The building view: floors, corridor, rooms and elevator derived from the channel tree.
- Service reading the Mumble server via Ice (read-only), plugin for the Mumble client with identity, talking state and commands (join, mute, deafen).
- Pairing with a one-time link (ADR-0004); the plugin finds the service through the root channel description (ADR-0010).
- Real Mumble avatars and presence (quiet, away, recording).
- Docker image with the plugin bundle served under `/download`.

[0.14.0]: https://github.com/Skrrytch/ruumble/releases/tag/v0.14.0
