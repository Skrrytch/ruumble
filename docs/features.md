# Ruumble – Features

As of 2026-10-02: service and web UI 0.20, plugin 0.5.

How to use Ruumble: [user-guide.md](user-guide.md). How to run it: [operations.md](operations.md). Architecture: [decisions/](decisions/README.md).

---

## What Ruumble supports today

### Building view

- Top-level channels become **floors**, the floor channel itself is the **corridor**, second-level channels are **rooms**. A floor without subchannels is an **open floor**.
- Order follows the channels' **position** in Mumble, then the name, as in the Mumble client. The first floor is the ground floor. There are no special names or keywords.
- **Top bar** instead of a side column, so the floor plan gets the full width: the **floor sign** with the current floor and its head count opens the **elevator** as a dropdown (head count behind every floor, everyone online and the server name in a status bar at the bottom); in the middle the **room sign** of the own place (leads back from another floor); on the right mute, deafen and the **name badge**, which opens the user menu ("go to my floor", language, versions).
- Users in the root channel stand in the **entrance**, at the bottom of the elevator.
- **Locked floors:** a floor with more than two levels is greyed out in the elevator, with the reason. The rule is re-evaluated live on every change.
- **Linked channels** are hidden, including their subchannels. The other rooms use the space.
- Temporary channels are shown as normal rooms.
- **Room layout:** a room's width follows the number of people in it, so occupied rooms get more space. ⌊n/2⌋ rooms in the top row, the rest below the corridor. Up to 3 rooms per row are in view; with more, the floor plan scrolls sideways (the top bar and the board stay put).
- A **lock icon** marks rooms you may not enter (Mumble ACLs).
- "(stumm)" or "(muted)" in the channel name shows a speaker-off icon.
- **Vacant** message when no floor can be shown; a notice when you are in a part of the tree that cannot be shown.
- Freely licensed font and icons (Inter, Lucide); installable as a PWA with its own window (see the [user guide](user-guide.md)).

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

Every room has a board next to the floor plan. It shows the board of the room you are in; the board graphic in your room or the **B** key opens and closes it.

- **Text** with Markdown (headings, lists, links, tables).
- **Source code** with syntax highlighting, language detected or chosen, line numbers in the full view, copy button. Pasting multi-line code suggests pinning it as code.
- **Images**: paste, drag and drop or paper clip. Preview in the card, full-screen view with zoom, pan and download.
- **Files** as downloads.
- Long posts are shortened to 8 lines and open in a dialog to read, edit, copy or delete.
- **Quick reactions** with a fixed meaning (19 symbols, from "agreed" and "does not work for me" to "happy birthday" and "time to call it a day"): once per person and kind, without a Mumble notice (A1). The card header shows a summary of fixed width (the three most frequent symbols and the total, all of them with names in the tooltip); the picker shows every symbol with its count.
- **Task lists**: a text post consisting of an optional introduction and then only task lines (`- [ ] Task`, `[x] Done`) shows checkboxes that everyone present can tick, with the progress ("2/5") in the card header. `[]` without a space counts as open too. Ticking changes only that line in the service, counts as an edit and sends no Mumble notice (A2).
- **Kept on top**: one post per room can be kept on top (A3) with the pin dot at the top of its card, which appears on hover or keyboard focus and grows into a pin button when pointed at. The title field then appears right where the post will be, with a title suggested from the first heading or line (max. 40 characters, editable; Enter confirms, Escape cancels). It appears as one slim row above the list (title, progress for task lists) and unfolds on a click, with its own scrolling; each browser remembers whether it is unfolded. It is not shown a second time in the list, except in search and filter results, where its dot takes it down again. Keeping another post on top replaces it, with a note. Everyone present may set and remove it; it goes away with its post. The UI says "keep on top" because "pin" already means posting.
- **Keyboard**: **B** shows and hides the board. Shortcuts are single keys without Ctrl, Alt or Meta (those clash with the browser) and never apply while typing or while a dialog is open (`web/src/lib/shortcuts.ts`).
- **Compact layout**: one slim header row with a search field (text, caption, file name, code language and author; the simple form of A7) and a filter menu by kind. While a search or filter is active, a line shows "N of M posts" with a reset. The input stays one line until it has focus.
- **Compact cards**: the author is one line ("Anna · 5 min ago", 20 px avatar) and the actions (open, react, copy or download, "…") float on the bottom-right edge of the post only on hover, keyboard focus or while a menu is open, and the post itself is lightly tinted meanwhile, so it is clear what they apply to (also within a group); so a one-line post is about 70 px instead of 140. Posts by the same person at most 10 minutes apart (not copies from another room) join into one card with a single header and a dashed line between them; their time is in the floating actions (`postGroups` in `web/src/lib/board/model.ts`). Reactions and task progress stay visible, next to the content of a post without its own header.
- **Copy to room**: the "…" menu of every post offers "Copy to room …" with the rooms per floor (own floor first) that the user may enter in Mumble, except the own room, temporary rooms and locked floors. The copy is a new post by the user in the target room with its origin ("from “Meeting”, by Ben"; a copy of a copy keeps the original author), the same text, code language and attachment (stored once), task ticks included; reactions and "kept on top" stay behind. The people in the target room get the Mumble notice "Anna brought code from “Meeting” to the board."; the own board does not change. This is the one write to a room the user is not in ([ADR-0011](decisions/0011-own-storage-for-the-board.md#current-state-code)).
- **Ticket keys** become links without any configuration: a post with a link to an issue (`…/browse/TAG-1366`, Jira Cloud and Data Center alike) teaches the service where project `TAG` lives, and from then on a plain "TAG-1366" in text, captions and task lists links there (not in code, not inside links). Only the shape of the URL counts, nothing is fetched. The oldest post wins, so a later link cannot redirect a known project; what is learned is derived from the stored posts and goes away with them. A board only receives the projects whose keys appear in its own posts (`protocol/src/tickets.ts`).
- **Links** (A4, A5): URLs in code posts (logs, stack traces) are clickable too, and the card lists the distinct links of a code post below it (at most three, then "+ N more", which opens the post; the dialog lists all), outside the 8-line preview, so a link far down in a log is one click away. Links show a short form with a Lucide symbol, derived only from the shape of the URL, never by fetching it: "PR #13 · ruumble", "MR !42 · app", "#42 · ruumble", "a1b2c3d · ruumble", "CI · ruumble", "Pipeline #98765 · app", "Build #123 · app", "TAG-1366", the title of a Confluence page or a Stack Overflow question, otherwise host and shortened path (`web/src/lib/board/links.ts`). In text and captions a bare `http(s)://` URL shows the same short form (without symbol), the full URL as tooltip; links with their own Markdown text stay as written. Ticket keys in code stay plain text.
- **Mumble notice**: when someone pins something, the others in the room get a short line in their Mumble log, e.g. "Anna pinned code to the board." (in each recipient's language).

| Rule | Value |
|---|---|
| Where | Only in rooms (not in the entrance, corridors, open floors or temporary channels) |
| Read, post, edit | Everyone currently in the room; copying a post in from another room: anyone who may enter it |
| Delete | Author and Mumble admins (Write permission on the channel) |
| Retention | 1 year (`RETENTION_DAYS`); admins can delete older posts per room earlier |
| Limits | Images and files up to 10 MB by default, text up to 100 KB, 2 GB in total (`BOARD_QUOTA_MB`); when full, the oldest posts go first; admins can change the limits in the building maintenance |
| Deleted channel | Posts stay 7 days for admins (by default, set in the building maintenance), then they are removed (earlier by floor or building care) |
| Care | Mumble admins (Write permission) via the plants, see below |
| Storage | SQLite plus attachments by SHA-256 in the data volume; `backup` command |

Details: [ADR-0011](decisions/0011-own-storage-for-the-board.md).

### Care of the stored data

A potted plant stands in every room (bottom right), at the end of every corridor and at the entrance in the elevator. For everyone it is decoration; whoever has Mumble's Write permission there can click it ([ADR-0014](decisions/0014-care-of-the-stored-data.md)):

- **Room care**: posts, attachment space, newest and oldest post, the retention period; **delete posts older than** 7 days, 14 days, 1, 3 or 6 months (with the count per choice); **clear the board** (all posts with reactions, "kept on top" and attachments); both send a Mumble notice to the people present. **Export** the board as a ZIP (`board.md` and the attachments).
- **Floor care**: all rooms of the floor with posts, size and last post (a line opens the room's care, "back" returns); **move a board** from any room in the database, current or gone, to a room on this floor (e.g. a room recreated in Mumble with a new ID); rooms of this floor that were deleted in Mumble or moved out of the floor plan and still hold data, one line each (name, posts, size, gone since), removed one by one or all.
- **Building care**: **storage** (used of the quota, retention, every floor with its numbers, a line opens the floor's care); floors that are gone, with their rooms, posts and size; rooms whose floor is not known as "Unknown floor"; every **learned ticket link** of the building (project → base URL), each with a reset, e.g. after a first link to the wrong Jira; a newer link teaches the project again.

Care works from anywhere in the building and shows counts and sizes, not the content of posts; the export is the one exception. It is one dialog that moves between building, floor and room (a line of an overview opens the level below; "back" and a breadcrumb return), with the house rules (current retention and grace) in its footer. Every removal, and moving a board, asks first in a bar inside the dialog.

### Keys

Every paired browser is a key. "My keys" in the user menu lists one's own (browser and system, paired on, last used, "this browser"); each can be revoked, e.g. after losing a laptop, and that browser then has to be paired again ([ADR-0015](decisions/0015-key-cabinet.md)).

### Building maintenance

Next to the plant at the entrance lies a wrench for admins (Write permission on the root channel). It opens the building's settings: how long posts are kept, the storage quota, the largest attachment, how long data of deleted rooms is kept, and whether a new post sends a Mumble notice. The environment variables are the defaults; "All to default" goes back to them. Changes that make the next cleanup delete data (shorter retention, a quota below the storage in use, a shorter grace for deleted rooms) are pointed out and confirmed. The section "Access" lists everyone else's keys, each revocable ([ADR-0016](decisions/0016-building-maintenance.md)).

### Pairing and security

- The plugin finds the service through a line `ruumble: <address>` in the root channel description, or through `bridgeUrl` in `~/.config/ruumble/plugin.json` ([ADR-0010](decisions/0010-address-from-root-description.md)).
- On first connect the plugin opens a **one-time pairing link** in the browser. The browser then keeps a device token (stored as SHA-256 on the server).
- **Further browsers, profiles and web apps** pair themselves: "Pair this browser" sends a 6-digit code to the Mumble log of the user on the same computer ([ADR-0012](decisions/0012-pairing-with-a-code.md)).
- Only users with a paired plugin see the building. Optional read-only **preview** without pairing (`PREVIEW=true`).
- Identity by plausibility check: certificate hash of the plugin and, optionally, the IP address (`ADDRESS_CHECK=off|warn|enforce`, [ADR-0004](decisions/0004-identity-and-pairing.md)). A connected plugin cannot be replaced from another address, new keys are announced in the Mumble log, and only the service's own pages may use the cookie ([ADR-0017](decisions/0017-threat-model-after-board-and-care.md)).
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
| Mumble client | 1.4 or later on **Linux** (x64, from the distribution packages) or **Windows** (x64); one plugin bundle for both (ADR-0013) |
| Plugin API | 1.0.x, so the plugin also runs on Mumble 1.4 |
| Service | Docker container next to the Mumble server; `/healthz`, `/download` (plugin bundle), `/api/version` (service and plugin version, shown on the notice pages) |
| HTTPS | optional, behind a reverse proxy ([HTTPS](operations/https.md)) |

Tested versions: see [operations](operations.md#requirements).

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
| macOS plugin | later option (E3) |
| B – Status line | on hold: the Mumble comment cannot be set from the plugin (see below) |
| C – Knocking | idea, decision open |
| F – More controls | idea, decision open |
| G – "Door closed" | idea, after B and C |
| A1 – Quick reactions | done (0.10.0) |
| A2 – Shared task lists | done (0.12.0) |
| A3 – Kept on top | done (0.13.0) |
| Ticket keys as links (learned from issue links) | done (0.20.0) |
| Copy a post to another room | done (0.21.0) |
| A4 – Clickable links everywhere | done (0.23.0) |
| A5 – Short form for well-known URLs | done (0.23.0) |
| A6–A9 – Board for developers | planned, in this order |
| Report the Mumble avatar bug | open (O16) |
| Address check over proxy and VPN | proxy with hairpin NAT: `warn` required, VPN untested (see [P7](mumble-interfaces.md#5-checkpoints-of-the-feasibility-studies)). |

**macOS plugin.** The plugin runs on Linux and Windows (since 0.14.0, ADR-0013). macOS needs its own build and tests.

**B – Status line.** A short status such as "In a meeting until 2 pm", with templates and an expiry time, shown under the avatar. The idea was to store it as a marked first line of the Mumble comment, so regular Mumble clients see it too, without storage of its own.

On hold (2026-10-02): this does not work. The plugin API's `requestSetLocalUserComment` only changes the comment in the local client's model (`pmModel->setComment`) and never sends a `UserState` to the server, unlike Mumble's own comment dialog (`MainWindow::openSelfCommentDialog`); same in 1.5.735, 1.6.870 and `master` (`src/mumble/API_v_1_x_x.cpp`). Neither other clients nor Ice would see the status. The remaining options are storing the status in the service (visible only in Ruumble) or writing the comment via Ice, which needs the write secret and contradicts ADR-0002. Worth reporting at mumble-voip/mumble like O16.

**C – Knocking.** "Knock" on someone else's room: the people inside get a notice with a sound in Ruumble ("Let in", "One moment", "Later") and a line in the Mumble log. Runs through the service, in memory only, expires after 60 s, with abuse protection.

**F – More controls.** Mute someone only for yourself, switch the transmission mode, a push-to-talk button in Ruumble, and a settings dialog (transmission mode, open the UI on every connect, unpair this device). All via the plugin, no storage of its own.

**G – "Door closed".** Your own room shows a closed door; others knock instead of entering. A request, not a lock: Mumble's permissions stay unchanged. Builds on B and C.

**Mumble avatar bug (O16).** Whether to report the inverted condition in Mumble 1.6's Ice `getTexture`/`setTexture` as an issue at mumble-voip/mumble.

**Smaller items**

- A layout for small windows (today: minimum height 720 px, width up to 1440 px).
- Old raw avatar format (600×60 BGRA) from very old clients; treated as "no avatar" today.

### Board for developers (A1–A9)

Extensions of the board (idea A) for the everyday exchange between developers: stack traces, links to tickets and pull requests, screenshots, short agreements and checklists. Guidelines for all of them: **no configuration** by the operator, the service **never fetches foreign URLs**, and the access rule of ADR-0011 stays unchanged (only those present in the room).

**A1 – Quick reactions.** A fixed set of reactions with a clear meaning, instead of free emoji, so that nobody has to guess what a symbol means:

| Symbol (Lucide) | Meaning |
|---|---|
| thumbs up | agreed / fine by me |
| thumbs down | I disagree |
| eye | I'm looking at it |
| brain (no thinking face in Lucide) | I'm thinking about it |
| hourglass | one moment, please |
| check | done / works |
| triangle with exclamation mark | does not work for me |
| question mark | unclear, let's talk |
| pin | important info |
| light bulb | good idea |
| rocket | release, progress |
| handshake | deal |
| grinning face | happy about it |
| slightly frowning face | too bad |
| party popper (no clapping hands in Lucide) | applause |
| wine glass (no champagne glasses in Lucide) | congratulations |
| cake | happy birthday |
| coffee cup | break |
| beer mug | time to call it a day |

Done (0.10.0), see *Board* above: work reactions first, then social ones, in a fixed order; the picker shows the meaning of each symbol in words.

**A2 – Shared task lists.** Done (0.12.0), see *Board* above. The detection is strict: after an optional introduction only task lines (`[ ]`, `[]`, `[x]`, with or without a list marker) and blank lines, otherwise the post stays ordinary Markdown. A tick changes exactly that line in the service (`protocol/src/tasks.ts`), so two people ticking at the same time do not overwrite each other.

**A3 – Kept on top.** Done (0.13.0), see *Board* above. The post kept on top expires with the retention period like any other (ADR-0011 unchanged).

**A4 – Clickable links everywhere.** Done (0.23.0), see *Board* above. Captions turned out to be Markdown with links already, so the change concerns code posts; the list of links is shown below code posts only, where the links would otherwise be hidden in the text. Text posts already turn URLs into links (Markdown with linkify). Code posts, stack traces and image or file captions do not: there a URL is plain text today. Links in these posts become clickable too, and in addition every post shows the links it contains as a compact list below its content: duplicates removed, at most three entries, then "+ N more". That way a ticket link in a code comment or log is one click away without searching the text.

Only `http(s)` links are offered, always in a new tab and without access to the Ruumble window (as today). In the list the full URL appears as a tooltip; the entries use the short form from A5.

**A5 – Short form for well-known URLs.** Done (0.23.0), see *Board* above; GitLab merge requests read "MR !42", CI links name the run, pipeline, job or Jenkins build. Instead of a long URL, a link shows a symbol and a short text, derived only from the **shape of the URL**, never by fetching it. This works for self-hosted instances too, because the path is recognised, not the host:

| URL shape | Shown as |
|---|---|
| `…/<owner>/<repo>/pull/<n>`, `…/-/merge_requests/<n>` | pull request icon, "PR #13 · ruumble" |
| `…/<owner>/<repo>/issues/<n>` | issue icon, "#42 · ruumble" |
| `…/commit/<sha>` | commit icon, "a1b2c3d · ruumble" |
| `…/actions/runs/<id>`, `…/-/pipelines/<id>` | CI icon, "CI run · ruumble" |
| `…/browse/<KEY-123>` | ticket icon, "KEY-123" |
| `…/wiki/spaces/…/pages/<id>/<Title>` | page icon, the title from the URL |
| `…/questions/<id>/<slug>` (Stack Overflow and similar) | question icon, the title from the slug |
| anything else | host and a shortened path |

Symbols come from Lucide (no brand logos). The recognition is a pure function in the web UI with unit tests, so new shapes can be added without touching the service.

**A6 – Stack traces.** Pasting a stack trace is recognised like pasting code today and suggests a code post with the language "stack trace". Recognition works on typical markers without configuration: Java/Kotlin (`at pkg.Class.method(File.java:42)`, `Caused by:`), Python (`Traceback (most recent call last):`, `File "…", line N`), JavaScript/Node (`at fn (file:line:col)`), .NET (`at Ns.Class.Method() in …:line N`), Go (`panic:`, `goroutine N [running]:`) and Rust (`thread '…' panicked at`).

The display is tailored to reading: the exception type and message become the headline of the card, the preview shows them together with the first frame outside libraries. Frames from well-known library and runtime paths (`java.`, `jdk.`, `org.springframework.`, `node_modules/`, `site-packages/`, `runtime/` …) are dimmed and collapsed into "… 38 frames in libraries". `Caused by` chains become their own sections, with the root cause emphasised. Lines never wrap; copy and download always return the original text unchanged.

**A7 – Full-text search.** Current state: the search field and the plain search are there (all words, not case-sensitive); highlighting and opening at the match are still open. A search field in the board header searches the text, captions, file names, code language and author names of all posts of the room, combined with the existing filter by kind. Matches are highlighted, and posts shortened to 8 lines open where the match is. The search runs in the web UI over the posts that are already loaded; this was planned with 30 days of retention; with one year a measurement will show whether a full-text index in SQLite (FTS5) becomes necessary. An export exists for admins in room care (ADR-0014).

**A8 – Several images in one post.** Pasting or dropping several images at once creates **one** post with all of them, for example before and after, or several steps of a bug. The card shows them as a small gallery; the full-screen view pages through them with the arrow keys. One caption applies to the whole post; when editing, single images can be removed or added.

The limit per image stays at 10 MB, plus a maximum number per post (proposal: 6). This changes the protocol and the storage: `attachments[]` instead of `attachment`, and a table linking posts to attachments in SQLite; existing posts are migrated. Retention and quota count every image.

**A9 – Read access for AI tools (MCP).** AI assistants such as Claude Code can read the board of the room their user is currently in through an MCP server in the Ruumble service (Streamable HTTP under `/mcp`). This way "take the stack trace from the board" or "look at the screenshot Anna pinned" works directly in the IDE. Tools: list posts (kind, author, time, text, language, links), read one post, fetch an attachment (images as image content, text files as text), and search (as A7). Read-only for now; writing (posting from the agent) is a later option.

Access uses a **personal token** that the user creates in the user menu: bound to the paired identity, shown once, stored only as SHA-256 like the device tokens, revocable at any time. The rule of ADR-0011 stays: only the room in which the user is present in Mumble at the moment of the request, otherwise nothing. The dialog points out that the content goes to the AI provider the user has chosen. Board content is marked as untrusted data in the responses (prompt injection). Prerequisites: HTTPS (O10), because the token travels over the network, and an ADR on the token and its scope.
