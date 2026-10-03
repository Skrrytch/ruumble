# ADR-0014: Care of the stored data

Status: proposed (2026-10-03)

## Context
The board (ADR-0011) keeps data per channel ID. Three things build up over time that nobody could tidy by hand:
- A room's board can only be emptied post by post, and only by someone present.
- The learned ticket links (`protocol/src/tickets.ts`) are "oldest post wins": a wrong first link (a typo, a test instance) keeps a project pointing to the wrong place for up to 30 days.
- When a room or a whole floor is deleted in Mumble, its posts stay unreachable for 7 days, then go. A room moved out of the floor plan (below another room, or to the top level) keeps its posts with no end. The service did not remember where a deleted room had been, so it could not even say whose data it was.

Mumble already has a notion of who administers a channel: the Write permission (`hasPermission(session, channel, Write)`), which the board uses for deleting other people's posts.

## Decision
| Topic | Decision |
|---|---|
| **Where** | A potted plant: in **every room** (bottom right), at the **right end of every corridor** (or bottom right of an open floor) and at the **entrance** in the elevator. Room care, floor care, building care. |
| **Who** | Mumble **Write permission** on that room, floor or the root channel. The plants are decoration for everyone else. The snapshot carries `care`, the channels the own user may tend (queried with the access permissions, every 10 s and on structure changes); the service checks the permission again on every request. |
| **From where** | From anywhere in the building, unlike the board itself. Care shows counts and sizes, not the content of posts; the **export** is the one exception, for admins only. No care action appears in the UI for other users. |
| **Room care** | Shows posts, attachment size, newest and oldest post and the retention period. **Delete posts older than** 7 days, 14 days, 1, 3 or 6 months (each choice with its count; no "1 year", as that is the retention). **Clear the board**: all posts with reactions, "kept on top" and attachments. The people present get a Mumble notice for both. **Export**: the whole board as a ZIP (`board.md` with all posts, oldest first, and the attachments under `files/`), built by the service; its text (headings, "Reactions", dates in UTC) is English whatever the UI language. |
| **Floor care** | **All rooms of the floor**, one line each (posts, size, last post); a line opens that room's care, "back" returns. **Move a board**: all posts of any room in the database (current or gone) to a room on this floor, with authors, times and reactions; the target keeps its own post on top. Needs Write on this floor and on the source's floor (unknown floor: the root channel); the people in the target room get a Mumble notice. Then the rooms that were last seen on this floor and are no longer rooms but still hold data: name, posts, size, "gone since" or "moved". Remove one or all, with all their data. |
| **Building care** | **Storage**: used against the quota, the retention period, and every floor with rooms holding data, posts and size; a line opens that floor's care. Lists floors that are gone, with the number of rooms, posts and size; rooms whose floor is not known appear as "Unknown floor". Remove one or all. Also lists **every learned ticket link** (project → base URL) with a reset per project or for all: the project is forgotten until a post created after the reset teaches it again. |
| **Safety** | Every destructive action asks first. The web UI sends the IDs it showed; the service removes only those that are still gone (and on that floor), so a room that came back in the meantime keeps its board. |
| **Storage** | Migration 6: `channels` (last known parent and name of every floor and room; rows of places that are gone and hold no data are pruned) and `forgotten_tickets` (project, time of the reset; dropped after the retention period). |

## Rejected options
- **Separate admin page or a role in Ruumble**: a second permission system next to Mumble's, and one more thing to find. The plant sits where the data is.
- **Ticket links in room or floor care**: the learned links are building-wide (one project, one base URL, learned from every room), so a reset offered from one room would still act everywhere, and it would only show part of the list. They belong to building care.
- **Remove orphaned data immediately and automatically**: a room renamed by deleting and recreating it, or moved by mistake, would lose its board at once. The grace (ADR-0011, 7 days by default, set in the building maintenance since ADR-0016) stays; care is the early way out.

## Consequences
- One more Ice call per paired session and channel every 10 s (Write next to Enter, for the root, floors and rooms).
- The default retention (`RETENTION_DAYS`) goes from 30 days to **one year**, so boards keep their history and "delete older than" is the tool for tidying up.
- The service now remembers the names of floors and rooms that have boards; they are deleted with the data.
- `REST /api/care/*` (`bridge/src/board/care.ts`), schemas in `protocol/src/index.ts`.

## Current state (code)
- (2026-10-03) The dialogs follow the "Hausmeister" design: one dialog that moves between building, floor and room, with a site plan of the level, a door plate or floor button, a breadcrumb (parent levels are links only where the viewer may tend them) and "back". The footer shows the house rules with the current settings (retention, grace for deleted rooms) or the result of the last action. Confirmations open in a small popup of their own above the dialog (`ConfirmDialog.svelte`), not a browser prompt; Cancel has the focus, Escape closes only the popup, and the dialog below is locked meanwhile. Moving a board asks too (neutral, not red), since the posts mix with the target's. Building maintenance (ADR-0016) and "My keys" (ADR-0015) use the same frame. Components in `web/src/lib/ui/care/`, pure helpers in `web/src/lib/care/model.ts`.
- (2026-10-03) Resetting a ticket link asks first (neutral), and building care offers "Reset all" when more than one is learned. Floor and room lines in the overviews open the lower level only where the viewer may tend it; others are shown without a link. Sizes count an attachment once per room even if it was posted twice.
- (2026-10-03) The export is streamed (`bridge/src/board/zip.ts`): every file is read and deflated while the archive is sent, with CRC and sizes in data descriptors and ZIP64 records past 4 GB or 65535 entries, so a large board neither fills the memory (the compose template allows 256 MB) nor blocks the service. An attachment missing on disk is named in `board.md` instead of breaking the export.
- (2026-10-03) Floor plan "on the corridor side" (`docs/design/Grundriss-Neu/`): the room's plant stands behind the door in the door strip on the corridor side, not bottom right.
