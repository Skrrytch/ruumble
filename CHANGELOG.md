# Changelog

All notable changes to Ruumble. The service and the web UI share one version; the plugin has its own, noted where it changed. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versions follow [Semantic Versioning](https://semver.org/).

0.14.0 is the first published release. Earlier versions were only run by the author and are listed for reference.

## [Unreleased]

## [0.22.1] - 2026-10-02

### Changed
- Board: the actions of a post appear at its bottom right instead of the top, and the post you point at is lightly tinted, so it is clear which one you are about to open, copy, react to or delete, also within a group.

### Fixed
- Board: hidden actions and pin dots no longer catch clicks meant for the post next to them.

## [0.22.0] - 2026-10-02

### Changed
- **Compact board.** A one-line post takes about half the height, a series of short posts about a third:
  - the author is one line ("Anna · 5 min ago") with a smaller avatar,
  - the actions (open, react, copy or download, "…") float on the top edge of a post when you point at it or reach it with the keyboard, instead of a row under every post; the pin dot for "keep on top" appears the same way,
  - posts by the same person at most 10 minutes apart join into one card with a single name line; the time of each is shown with its actions,
  - less space between and inside the cards.

## [0.21.1] - 2026-10-02

### Fixed
- Board: opening the "…" menu of another post closes the one that is open.
- Board: near the bottom of the list the "…" menu opens upwards instead of being cut off.

### Changed
- Board: the menu item reads "To room …" next to its icon (the full "Copy to room …" stays its accessible name and tooltip); the menu is a little wider.

## [0.21.0] - 2026-10-02

Plugin 0.5.0 (unchanged).

### Added
- **Copy to another room.** The "…" menu of every post offers "Copy to room …" with the rooms you may enter in Mumble, your own floor first, e.g. to take the final SQL from a meeting room back to your team room. The copy is your post there and says where it came from ("from “Meeting”, by Ben"); the people in that room get a notice in the Mumble log ("Anna brought code from “Meeting” to the board."). Ticks in a task list are copied, reactions are not. Attachments are not stored twice.
- **Icons in all common sizes:** PNG 192/512 (also maskable for Android), an Apple touch icon and `favicon.ico` with a pixel-drawn 16 px version, next to the existing SVG. The web app's manifest lists them, and every release carries them as `ruumble-icons.zip`.

### Changed
- The "…" menu is on every post now; "Delete" in it is still only offered where you may delete.

### Upgrading
- No configuration changes: change the image tag to `0.21.0` and restart. The board database gets two new columns on start.

## [0.20.0] - 2026-10-02

Plugin 0.5.0 (unchanged).

### Added
- **Ticket keys become links.** Once anyone on the server has posted a link to an issue (`https://jira.example.com/browse/TAG-1`), a plain "TAG-1366" in text, captions and task lists links to it, without any configuration in Ruumble or Jira. Only the shape of the URL counts, nothing is fetched. The oldest post wins, so a later link cannot redirect a known project, and what is learned goes away with the posts it came from. A board only receives the projects that appear in its own posts.

## [0.19.0] - 2026-10-02

Plugin 0.5.0 (unchanged). A new layout with more room for the floor plan, and a board that points out new posts. 0.16.0 to 0.18.0 were not published; their changes are included here.

### Added
- **New posts stand out.** With the board closed, a yellow note lands on the board toggle in your own room when someone else pins something; it stays until you open the board, and those posts light up once there. With the board open, a new post is pinned on from above and glows; if the list is scrolled down, a "1 new post" button leads up to it. What you have seen is remembered per room in the browser.
- **Delete from the card:** a "…" menu next to copy/download offers "Delete" for posts you may delete (your own, or all as a Mumble admin), with the same confirmation as the popup.
- The mock's debug panel can simulate a post by someone else.

### Changed
- **Top bar instead of the left column**, so the floor plan gets the full width. It is made of signs:
  - on the left the **floor sign** with the current floor and its head count; its elevator buttons open the **elevator** as a dropdown (floors with their head counts, the entrance below the ground floor, and a status bar with everyone online and the server name),
  - in the middle the **room sign** of your own place with its head count; when you look at another floor, it takes you back,
  - on the right mute, deafen and your **name badge**, which opens the user menu ("Go to my floor", language, versions).
- **Room widths follow occupancy:** a room gets wider with every person in it (up to 8), and the change glides. This replaces the fixed sizes by Mumble order.
- **Many rooms scroll sideways:** up to 3 rooms per row (6 per floor) are in view; with more, only the floor plan scrolls (scrollbar or mouse wheel) while the top bar and the board stay put. The corridor label stays in view and your own room is scrolled into view.
- **Full window width:** the web UI no longer stops at 1440 px. 1440 px is now the minimum width (narrower windows scroll), and the open board gets half of the width beyond it.
- The operations guide is split into short pages: setting up (`docs/operations.md`), and under `docs/operations/` HTTPS, backup and updates, troubleshooting, Mumble tips and the configuration reference.

### Removed
- The "Too many rooms" lock: floors with more than 8 rooms are shown and scroll sideways. Only floors nested deeper than two levels are still locked.

### Upgrading
- No configuration changes: change the image tag to `0.19.0` and restart. The board data stays as it is.

## [0.15.0] - 2026-09-30

Plugin 0.5.0 (unchanged). Easier setup: the Compose templates need no edits.

### Added
- `deploy/compose/mumble-with-ruumble.docker-compose.yml`: Mumble server and Ruumble in one file for a new setup, and `setup.sh`, which creates the Ice secrets and prints the line for the root channel description.
- The operations guide starts with a four-step quick setup; troubleshooting table with the typical log messages.
- Demo of the web UI against the mock on GitHub Pages: <https://skrrytch.github.io/ruumble/>.
- README with a quick start, security policy, contribution guide, issue templates.

### Changed
- **`PUBLIC_URL` is optional.** Without it, pairing links use the address the plugin connected to (behind a reverse proxy with `TRUST_PROXY` including `X-Forwarded-Proto`), which is the address users open. Existing setups that set it keep working unchanged.
- The Compose templates publish port 64080 on all interfaces instead of a `<LAN-IP>` placeholder; on a server with a public address, bind it to the LAN or VPN address (see the operations guide).

### Fixed
- An unreadable `ICE_SECRET_READ_FILE` (e.g. owned by root with mode 600) now stops the service with a clear message; the guide recommends mode 644 for the files and 700 for the `secrets` folder.
- The Mumble Compose template no longer requires the external network `homeserver-network`.

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
- **Port 64080 instead of 8080.** When updating from 0.7, change the port binding (`64080:64080`) and `PUBLIC_URL` in the Compose file, the `ruumble:` line in the root channel description, the link in the welcome message and, behind a reverse proxy, its forward target (`ruumble:64080`). Browsers that used the old address pair once more; users with a fixed `bridgeUrl` in `plugin.json` change it too. To keep the old address instead, set `PORT: 8080`.
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

[0.19.0]: https://github.com/Skrrytch/ruumble/releases/tag/v0.19.0
[0.15.0]: https://github.com/Skrrytch/ruumble/releases/tag/v0.15.0
[0.14.0]: https://github.com/Skrrytch/ruumble/releases/tag/v0.14.0
