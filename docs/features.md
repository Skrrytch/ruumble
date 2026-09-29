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
| HTTPS via a reverse proxy | supported; domain and certificate on the home server open (O10) |
| Windows and macOS plugin | later option (E3) |
| B – Status line | idea, decision open |
| C – Knocking | idea, decision open |
| F – More controls | idea, decision open |
| G – "Door closed" | idea, after B and C |
| A1–A9 – Board for developers | planned, in this order |
| Report the Mumble avatar bug | open (O16) |
| Address check over proxy and VPN | to be checked on a real deployment (P7) |

**HTTPS via a reverse proxy (O10).** Ruumble runs over plain HTTP or behind a reverse proxy with HTTPS; the setup is described in [operations](operations.md#https-behind-a-reverse-proxy-optional). HTTPS is needed for a full PWA and the Clipboard API. The service pings every WebSocket connection every 30 s, so idle connections survive the proxy's timeout. Still open for the home server: the domain, and the certificate (recommended: Let's Encrypt via DNS challenge; alternative: internal CA, which every client must trust in the browser and in the system).

**Windows and macOS plugin.** The plugin is Linux-only today (`os="linux" arch="x64"`). Other platforms need their own builds and tests.

**B – Status line.** A short status such as "In a meeting until 2 pm", with templates and an expiry time, shown under the avatar. Stored as a marked first line of the Mumble comment, so regular Mumble clients see it too. No storage of its own.

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
| eye | I'm looking at it |
| check | done / works |
| triangle with exclamation mark | does not work for me |
| question mark | unclear, let's talk |

The label appears as a tooltip. Everyone present can set each reaction once per post and take it back; the card shows the symbols with a count, the tooltip also the names. Reactions do not send a Mumble notice, so they stay quiet. They are stored with the post (author hash, name at the time) and deleted together with it.

**A2 – Shared task lists.** A text post becomes a task list automatically, without a button or special mode, but the detection is **strict**. It applies only if the post consists of an optional introductory text followed **exclusively** by task lines. A task line starts with `[ ]` or `[x]` (also `[X]`), with or without a list marker in front (`[ ] Task`, `- [ ] Task`, `* [x] Task`). Blank lines are allowed between the tasks. As soon as anything else follows the first task, for example a paragraph or a code block, the post stays ordinary Markdown and the brackets are shown as text. This way a checklist is never detected by accident in the middle of a longer text.

In a task list, the tasks appear as checkboxes that **everyone present** can tick, for example the TODOs of a pairing session or a deployment checklist. The introductory text is rendered as Markdown above them. The card header shows the progress ("3/7").

A tick does not send the whole text as an edit does, but only "task N done / not done" to its own endpoint; the service changes exactly that line. Two people ticking at the same time therefore do not overwrite each other. Ticking counts as an edit ("last edited by …") but sends no Mumble notice. Together with A3, a checklist can stay visible above the list.

**A3 – Pinned on top.** **Exactly one** post per room can be pinned on top. It then appears above the list as a chip with a short title (suggested from the first heading or line, max. 40 characters, editable). A click on the chip switches the sidebar between the list of posts and the pinned post; another click switches back. Pinning another post replaces the previous one after a confirmation. Everyone present may pin and unpin, like editing.

Typical uses: the checklist of the day (A2), the link to the current ticket, the commands for the local setup. Open points: whether a pinned post is exempt from the 30-day retention while it is pinned (then ADR-0011 has to be extended), and a UI term that cannot be confused with "pin something to the board" (posting).

**A4 – Clickable links everywhere.** Text posts already turn URLs into links (Markdown with linkify). Code posts, stack traces and image or file captions do not: there a URL is plain text today. Links in these posts become clickable too, and in addition every post shows the links it contains as a compact list below its content: duplicates removed, at most three entries, then "+ N more". That way a ticket link in a code comment or log is one click away without searching the text.

Only `http(s)` links are offered, always in a new tab and without access to the Ruumble window (as today). In the list the full URL appears as a tooltip; the entries use the short form from A5.

**A5 – Short form for well-known URLs.** Instead of a long URL, a link shows a symbol and a short text, derived only from the **shape of the URL**, never by fetching it. This works for self-hosted instances too, because the path is recognised, not the host:

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

**A7 – Full-text search.** A search field in the board header searches the text, captions, file names, code language and author names of all posts of the room, combined with the existing filter by kind. Matches are highlighted, and posts shortened to 8 lines open where the match is. The search runs in the web UI over the posts that are already loaded; with one room and 30 days that is enough. A full-text index in SQLite (FTS5) only comes if a measurement makes it necessary. No export for now.

**A8 – Several images in one post.** Pasting or dropping several images at once creates **one** post with all of them, for example before and after, or several steps of a bug. The card shows them as a small gallery; the full-screen view pages through them with the arrow keys. One caption applies to the whole post; when editing, single images can be removed or added.

The limit per image stays at 10 MB, plus a maximum number per post (proposal: 6). This changes the protocol and the storage: `attachments[]` instead of `attachment`, and a table linking posts to attachments in SQLite; existing posts are migrated. Retention and quota count every image.

**A9 – Read access for AI tools (MCP).** AI assistants such as Claude Code can read the board of the room their user is currently in through an MCP server in the Ruumble service (Streamable HTTP under `/mcp`). This way "take the stack trace from the board" or "look at the screenshot Anna pinned" works directly in the IDE. Tools: list posts (kind, author, time, text, language, links), read one post, fetch an attachment (images as image content, text files as text), and search (as A7). Read-only for now; writing (posting from the agent) is a later option.

Access uses a **personal token** that the user creates in the user menu: bound to the paired identity, shown once, stored only as SHA-256 like the device tokens, revocable at any time. The rule of ADR-0011 stays: only the room in which the user is present in Mumble at the moment of the request, otherwise nothing. The dialog points out that the content goes to the AI provider the user has chosen. Board content is marked as untrusted data in the responses (prompt injection). Prerequisites: HTTPS (O10), because the token travels over the network, and an ADR on the token and its scope.
