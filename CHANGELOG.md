# Changelog

All notable changes to Ruumble. The service and the web UI share one version; the plugin has its own, noted where it changed. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versions follow [Semantic Versioning](https://semver.org/).

0.14.0 is the first published release. Earlier versions were only run by the author and are listed for reference. 0.16.0–0.18.0 and 0.20.0–0.24.0 were not published either; their changes are in 0.19.0 and 0.25.0.

## [Unreleased]

### Added
- **Status.** The speech bubble in the top bar (or the key S) sets a short status of your own, such as "In a meeting until 2 pm" (up to 80 characters). Everyone in Ruumble sees it as a speech bubble at your avatar, with the text and the expiry in its tooltip. It expires after 2 hours by default; choose 30 minutes to 8 hours or "never" instead, or clear it any time. The five texts you used last are offered for a quick choice. The service keeps it per person in `statuses.json` in the data directory, so it follows you to other browsers; plain Mumble clients do not see it, because Mumble's plugin API cannot set the comment (ADR-0018).
- **Building overview.** Click "N online" at the bottom of the elevator, or press H: the whole building from the side (floors stacked, the elevator with your cabin, everyone as a small avatar, grouped by room; for building admins the lantern beside it opens the building maintenance and the plant the building care) next to the lobby's directory board (every floor with its people, their room and status). Search by name, room, status or floor; click a person to go to them, Enter goes to the first match, a room in the cross-section moves you there (ADR-0019).
- **Who uses Mumble without Ruumble.** A small plug at the bottom left of the avatar marks people without a connected Ruumble plugin; the tooltip says "without Ruumble (Mumble only)".

### Changed
- The wrench and the plant are no longer at the entrance in the elevator: building maintenance and building care open from the lantern and the plant beside the building in the building overview.
- **Care is for building admins.** Every plant (room, floor and building) needs Mumble's Write permission on the root channel. Write on a single room or floor no longer opens its plant; it still lets you delete others' posts on that board.

## [0.26.0] - 2026-10-03

Plugin 0.5.0 (unchanged). A new floor plan with flatter rooms, and exports through a "Save as" dialog.

### Changed
- **Flatter rooms, names at the door.** Name and head count of a room are a door plate on the corridor side next to the door, with the board and the plant beside it; the people fill the room from the far wall. A room needs about 200 px for two rows of people instead of about 270, so the web UI fits windows down to about 640 px high. The people stand in the middle of their area, every row centred. Where more people are in a room than fit, the last tile shows "+n" with the others' names in its tooltip; your own avatar always stays visible. Narrow rooms show the head count as a small number behind the name. Names under the avatars are a little smaller, so most fit whole.
- **The door tells whether you may enter.** It stands ajar (45°) where you may and is closed where Mumble does not let you in.
- **Calmer top bar.** The room sign shows only the room's name, centred; the floor sign has no head count any more (the elevator lists every floor with its count), and the elevator opens with a plain chevron.
- "Entering …" appears on a room only when Mumble takes longer than 0.6 s, instead of flickering on every move.
- **Export with a "Save as" dialog** where the browser has one (Chrome, Edge and other Chromium browsers on the desktop, over HTTPS): you choose the place, and the ZIP is written there while it downloads instead of being held in the browser first. In an installed web app this also avoids the download bubble at the window edge. Other browsers download as before.
- Building maintenance: hints about invalid values or changes that delete data are shorter and stand in the footer instead of the house rules, so the dialog keeps its height.

### Upgrading
- No configuration changes: change the image tag to `0.26.0` and restart.

## [0.25.1] - 2026-10-03

Plugin 0.5.0 (unchanged).

### Changed
- **Smaller windows.** The web UI scales down to 1000 px wide (before: 1440 px) and in height until every room still holds two rows of people (about 780 px); only below that does the page scroll. From 1440 px on nothing changes: the open board keeps 340 px and gets half of every pixel beyond.
- Ruumble may be reachable from the internet behind an HTTPS reverse proxy; the operations guide says what the service protects itself and what the operator should do ([HTTPS → On the internet](docs/operations/https.md#on-the-internet)). Plain HTTP stays for LAN and VPN.

### Upgrading
- No configuration changes: change the image tag to `0.25.1` and restart.

## [0.25.0] - 2026-10-03

Plugin 0.5.0 (unchanged). Care of the stored data for Mumble admins, settings and keys in the web UI, a richer and more compact board, and protection against forged identities. 0.20.0 to 0.24.0 were not published; their changes are included here.

### Added
- **Care of the stored data.** A potted plant stands in every room, at the end of every corridor and at the entrance in the elevator. Mumble admins (Write permission on that room, floor or the root channel) can click it; for everyone else it is decoration.
  - **Room care**: see how many posts and how much attachment space a board holds, delete posts older than 7 days, 14 days, 1, 3 or 6 months, clear the board (the people in the room get a notice in the Mumble log for both), and export the board as a ZIP (all posts as Markdown plus the attachments).
  - **Floor care**: all rooms of the floor with their numbers; move a board from any room, current or deleted, to a room of the floor (e.g. after a room was recreated in Mumble); rooms of the floor that were deleted in Mumble or moved out of the floor plan and still hold data, removed one by one or all.
  - **Building care**: storage used and per floor; floors that were deleted, with their data; every learned ticket link of the building with a reset per project or for all, e.g. after a first link to the wrong Jira.
- **Building maintenance.** A wrench next to the plant at the entrance, for admins: how long posts are kept, the storage quota, the largest file, how long data of deleted rooms is kept and the Mumble notice for new posts, changeable without a restart; the environment variables are the defaults. Changes that make the next cleanup delete data ask first. Everyone else's keys are listed there too, each revocable.
- **My keys.** In the user menu: every paired browser is a key. Everyone sees their own (browser and system, paired on, last used) and can revoke one, e.g. after losing a laptop.
- The care dialogs, the building maintenance and "My keys" share one look along the building metaphor: a site plan of the level, door plate or floor button, a breadcrumb to move between building, floor and room, the house rules in the footer, and confirmations in a small popup of their own instead of a browser prompt.
- **Copy to another room.** The "…" menu of every post offers "Copy to room …" with the rooms you may enter in Mumble, your own floor first, e.g. to take the final SQL from a meeting room back to your team room. The copy is your post there and says where it came from ("from “Meeting”, by Ben"); the people in that room get a notice in the Mumble log. Ticks in a task list are copied, reactions are not. Attachments are not stored twice.
- **Ticket keys become links.** Once anyone on the server has posted a link to an issue (`https://jira.example.com/browse/TAG-1`), a plain "TAG-1366" in text, captions and task lists links to it, without any configuration in Ruumble or Jira. Only the shape of the URL counts, nothing is fetched. The oldest post wins, so a later link cannot redirect a known project, and what is learned goes away with the posts it came from. A board only receives the projects that appear in its own posts.
- **Links in code are clickable.** URLs in code posts, logs and stack traces open in a new tab, and below a code post its links are listed (up to three, then "+ N more", which opens the post), so a ticket or PR link far down in a log is one click away.
- **Short form for well-known links.** Instead of a long URL, a link shows what it points to, read only from the shape of the URL (nothing is fetched, self-hosted instances work too): "PR #13 · ruumble", "MR !42 · app", "#42 · ruumble", "a1b2c3d · ruumble", "CI · ruumble", "Pipeline #98765 · app", "TAG-1366", the title of a Confluence page or Stack Overflow question, otherwise the host and a shortened path. The full URL is in the tooltip. Links with their own text stay as written.
- **Icons in all common sizes:** PNG 192/512 (also maskable for Android), an Apple touch icon and `favicon.ico` with a pixel-drawn 16 px version, next to the existing SVG. The web app's manifest lists them, and every release carries them as `ruumble-icons.zip`.

### Security
- **Nobody can take over a connected identity.** A second plugin connection for a user who is already connected is refused unless it comes from the same address or from the address Mumble sees for that user. Before, it replaced the real plugin and could receive a pairing link for that user.
- **New browsers are announced.** When a browser is paired, the owner gets a notice in the Mumble log ("… If that was not you, revoke the key under My keys"), and once more when their plugin connects from another address within 30 days.
- **Only Ruumble's own pages may use the login cookie.** Requests to the web UI's WebSocket and every changing request from another page are refused, and no web page can pose as the plugin.
- `TRUST_PROXY` takes the proxy's address or network instead of `true`, so clients that reach the port directly cannot fake their address ([ADR-0017](docs/decisions/0017-threat-model-after-board-and-care.md)).

### Changed
- **Posts are kept for one year** by default instead of 30 days (`RETENTION_DAYS`).
- **Compact board.** A one-line post takes about half the height, a series of short posts about a third:
  - the author is one line ("Anna · 5 min ago") with a smaller avatar,
  - the actions (open, react, copy or download, "…") appear at the bottom right of a post when you point at it or reach it with the keyboard, and the post you point at is lightly tinted; the pin dot for "keep on top" appears the same way,
  - posts by the same person at most 10 minutes apart join into one card with a single name line; the time of each is shown with its actions,
  - less space between and inside the cards.
- The "…" menu is on every post; "Delete" in it is still only offered where you may delete. Its item reads "To room …" next to its icon.
- **Large boards export without strain.** The ZIP is streamed while it downloads instead of being built in memory, so the service stays responsive and within its memory limit; archives above 4 GB work too (ZIP64). An attachment missing on the server is named in `board.md` instead of failing the export.
- **Uploads go straight to disk.** A file is written while it arrives and stops at the size limit, instead of being held in memory first.
- An image built from an untagged commit shows that commit under `/api/version` and in the start log (`BUILD_VERSION`, docs/development.md).

### Fixed
- Board: hidden actions and pin dots no longer catch clicks meant for the post next to them.
- Board: opening the "…" menu of another post closes the one that is open; near the bottom of the list it opens upwards instead of being cut off.

### Upgrading
- Back up the volume, change the image tag to `0.25.0` and restart. The board database migrates itself (new columns and tables); rooms deleted before the upgrade appear under "Unknown floor" in building care.
- If `RETENTION_DAYS` is not set, posts are now kept for a year. Set `RETENTION_DAYS=30` to keep the old behaviour. `RETENTION_DAYS` must be a whole number from 1 to 3650 and `BOARD_QUOTA_MB` at least 10; otherwise the service does not start and says which value is wrong.
- Behind a reverse proxy, set `TRUST_PROXY` to the proxy's address or Docker network (e.g. `"172.18.0.0/16"`); `"true"` still works but logs a warning. If the proxy does not pass the original `Host`, set `PUBLIC_URL`, otherwise the web UI cannot post or save.
- Behind a reverse proxy, allow request bodies a little above the largest file admins may set (at most 100 MB), e.g. `client_max_body_size 110m;` in Nginx; otherwise larger uploads fail with `413` from the proxy.
- Browsers paired before the upgrade show "Unknown browser" under "My keys" until they connect again.

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

[0.26.0]: https://github.com/Skrrytch/ruumble/releases/tag/v0.26.0
[0.25.1]: https://github.com/Skrrytch/ruumble/releases/tag/v0.25.1
[0.25.0]: https://github.com/Skrrytch/ruumble/releases/tag/v0.25.0
[0.19.0]: https://github.com/Skrrytch/ruumble/releases/tag/v0.19.0
[0.15.0]: https://github.com/Skrrytch/ruumble/releases/tag/v0.15.0
[0.14.0]: https://github.com/Skrrytch/ruumble/releases/tag/v0.14.0
