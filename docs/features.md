# Ruumble – Features

As of 2026-09-28: service and web UI 0.7, plugin 0.4.

How to use Ruumble: [user-guide.md](user-guide.md). How to run it: [operations.md](operations.md). Architecture: [decisions/](decisions/README.md).

---

## What Ruumble supports today

### Building view

- Top-level channels become **floors**, the floor channel itself is the **corridor**, second-level channels are **rooms**. A floor without subchannels is an **open floor**.
- Order follows the channels' **position** in Mumble, then the name, as in the Mumble client. The first floor is the ground floor. There are no special names or keywords.
- Users in the root channel stand in the **entrance**, below the elevator.
- **Locked floors:** a floor with more than two levels or more than 8 rooms is greyed out in the elevator, with the reason. The rule is re-evaluated live on every change.
- **Linked channels** are hidden, including their subchannels. The other rooms use the space.
- Temporary channels are shown as normal rooms.
- **Room layout:** rooms 1 and 2 are large, later rooms get smaller. ⌊n/2⌋ rooms in the top row, the rest below the corridor.
- A **lock icon** marks rooms you may not enter (Mumble ACLs).
- "(stumm)" or "(muted)" in the channel name shows a speaker-off icon.
- **Vacant** message when no floor can be shown; a notice when you are in a part of the tree that cannot be shown.
- Freely licensed font and icons (Inter, Lucide); installable as a PWA.

### Presence

| Shown | Source |
|---|---|
| Who is in which room, "N online", people per floor | Ice |
| **Talking** ring around the avatar | your own plugin (only people your client hears) |
| Self-mute, self-deafen, server mute/deafen, suppressed (badges with tooltips) | Ice |
| **Quiet** (15 min without talking) and **away** (self-deafened and quiet for 5 min) | Ice `idlesecs` |
| **Recording** (red dot at the avatar, hint at the room) | Ice |
| **Listening** (ear icon at the room, "N people are listening", no names) | Ice |
| **Mumble avatars** of registered users, otherwise initials | Ice `getTexture` |

Avatars only work with Mumble server 1.5.x. From 1.6, Mumble's Ice `getTexture` rejects registered users (bug in Mumble); Ruumble then shows initials.

### Moving, mute and deafen

- Click a room to move there. Clicking a floor in the elevator only changes the view; "go to my floor" jumps back.
- Moves run in your own Mumble client, so Mumble's ACLs apply. The UI waits for the server's confirmation and shows a message if the move was rejected.
- Mute and deafen buttons toggle your own Mumble state.
- Password-protected channels are not supported.

### Board

Every room has a board next to the floor plan. It shows the board of the room you are in; the board graphic in your room opens and closes it.

- **Text** with Markdown (headings, lists, links, tables).
- **Source code** with syntax highlighting, language detected or chosen, line numbers in the full view, copy button. Pasting multi-line code suggests pinning it as code.
- **Images**: paste, drag and drop or paper clip. Preview in the card, full-screen view with zoom, pan and download.
- **Files** as downloads.
- Long posts are shortened to 8 lines and open in a dialog to read, edit, copy or delete.
- **Mumble notice**: when someone pins something, the others in the room get a short line in their Mumble log, e.g. "Anna pinned code to the board." (in each recipient's language).

| Rule | Value |
|---|---|
| Where | Only in rooms (not in the entrance, corridors, open floors or temporary channels) |
| Read, post, edit | Everyone currently in the room |
| Delete | Author and Mumble admins (Write permission on the channel) |
| Retention | 30 days (`RETENTION_DAYS`) |
| Limits | Images and files up to 10 MB, text up to 100 KB, 2 GB in total (`BOARD_QUOTA_MB`); when full, the oldest posts go first |
| Deleted channel | Posts stay 7 days for admins, then they are removed |
| Storage | SQLite plus attachments by SHA-256 in the data volume; `backup` command |

Details: [ADR-0011](decisions/0011-own-storage-for-the-board.md).

### Pairing and security

- The plugin finds the service through a line `ruumble: <address>` in the root channel description, or through `bridgeUrl` in `~/.config/ruumble/plugin.json` ([ADR-0010](decisions/0010-address-from-root-description.md)).
- On first connect the plugin opens a **one-time pairing link** in the browser. The browser then keeps a device token (stored as SHA-256 on the server).
- Only users with a paired plugin see the building. Optional read-only **preview** without pairing (`PREVIEW=true`).
- Identity by plausibility check: certificate hash of the plugin and, optionally, the IP address (`ADDRESS_CHECK=off|warn|enforce`, [ADR-0004](decisions/0004-identity-and-pairing.md)).
- The service reads Mumble via Ice with the **read secret only** and never writes to Mumble.
- IP addresses never leave the service. Rate limit of 5 commands per second per user.
- Board content: Markdown rendered without raw HTML and sanitised, Content-Security-Policy for the whole UI, `nosniff` for images, files always as downloads.

### Languages

- Web UI in **German and English**: German if the browser prefers German, otherwise English. A switch in the user menu overrides it and is remembered in the browser.
- Mumble notices from the board use the language the plugin reports.

### Operations and compatibility

| Item | Supported |
|---|---|
| Mumble server | 1.5 or later with Ice enabled (official Docker image) |
| Mumble client | 1.4 or later on **Linux** (x64), from the distribution packages |
| Plugin API | 1.0.x, so the plugin also runs on Mumble 1.4 |
| Service | Docker container next to the Mumble server; `/healthz`, `/download` (plugin bundle) |

**Tested versions**

- Server: 1.5.735 and 1.6.870 (the pinned interface version).
- Clients: 1.4.287 (Fedora), 1.5.517 (Ubuntu 24.04), 1.5.735 (Debian 13).

**CI**

- Every push: interface files unchanged (checksums), lint, unit tests and build, Playwright tests of the web UI against the mock, plugin build and tests.
- **Live tests** weekly and on demand: real Mumble servers (1.5.735, 1.6.870, `latest`) with headless Mumble clients running the real plugin (Ubuntu, Debian, Fedora). They cover pairing, finding the service via the root channel description, moving, talking, mute/deafen, access rights, a second client, the board and its Mumble notice, avatars (skipped on 1.6.x), unpaired browsers and Mumble quitting.
- **Release watch** weekly: a new Mumble release opens an issue with the diff of the interface files and starts the live tests against it.

### What Mumble does not allow

- **Reading or writing the chat:** the plugin API cannot, and Ice would need the write secret and would also deliver all private messages. Ruumble complements the Mumble chat instead.
- **Buttons, menus or clickable links in the Mumble client:** the plugin API has no UI; plugin log lines are plain text.
- **Playing sounds from the plugin:** needs plugin API 1.2, which would drop Mumble 1.4. Sounds come from the browser.

---

## Planned / ideas

| Item | Status |
|---|---|
| HTTPS via a reverse proxy | planned; domain and certificate open (O10) |
| Windows and macOS plugin | later option (E3) |
| B – Status line | idea, decision open |
| C – Knocking | idea, decision open |
| F – More controls | idea, decision open |
| G – "Door closed" | idea, after B and C |
| Report the Mumble avatar bug | open (O16) |
| Address check over proxy and VPN | to be checked on a real deployment (P7) |

**HTTPS via a reverse proxy (O10).** Today the service runs over plain HTTP in the local network. HTTPS is needed for a full PWA and the Clipboard API. Plan: a reverse proxy in front of the service (`TRUST_PROXY=true`); internal CA or Let's Encrypt via DNS challenge is still open.

**Windows and macOS plugin.** The plugin is Linux-only today (`os="linux" arch="x64"`). Other platforms need their own builds and tests.

**B – Status line.** A short status such as "In a meeting until 2 pm", with templates and an expiry time, shown under the avatar. Stored as a marked first line of the Mumble comment, so regular Mumble clients see it too. No storage of its own.

**C – Knocking.** "Knock" on someone else's room: the people inside get a notice with a sound in Ruumble ("Let in", "One moment", "Later") and a line in the Mumble log. Runs through the service, in memory only, expires after 60 s, with abuse protection.

**F – More controls.** Mute someone only for yourself, switch the transmission mode, a push-to-talk button in Ruumble, and a settings dialog (transmission mode, open the UI on every connect, unpair this device). All via the plugin, no storage of its own.

**G – "Door closed".** Your own room shows a closed door; others knock instead of entering. A request, not a lock: Mumble's permissions stay unchanged. Builds on B and C.

**Mumble avatar bug (O16).** Whether to report the inverted condition in Mumble 1.6's Ice `getTexture`/`setTexture` as an issue at mumble-voip/mumble.

**Smaller items**

- A layout for small windows (today: minimum height 720 px, width up to 1440 px).
- Old raw avatar format (600×60 BGRA) from very old clients; treated as "no avatar" today.
