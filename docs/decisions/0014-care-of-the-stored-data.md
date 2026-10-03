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
| **From where** | From anywhere in the building, unlike the board itself: care never shows the content of posts, only counts and sizes. |
| **Room care** | Shows posts and attachment size. **Clear the board**: all posts with reactions, "kept on top" and attachments; the people present get a Mumble notice. **Reset ticket links**: lists the learned links of the projects named in the room (keys or issue links) and forgets them, in every room, until a post created after the reset teaches them again. |
| **Floor care** | Lists the rooms that were last seen on this floor and are no longer rooms but still hold data: name, posts, size, "gone since" or "moved". Remove one or all, with all their data. |
| **Building care** | Lists floors that are gone, with the number of rooms, posts and size; rooms whose floor is not known appear as "Unknown floor". Remove one or all. |
| **Safety** | Every destructive action asks first. The web UI sends the IDs it showed; the service removes only those that are still gone (and on that floor), so a room that came back in the meantime keeps its board. |
| **Storage** | Migration 5: `channels` (last known parent and name of every floor and room; rows of places that are gone and hold no data are pruned) and `forgotten_tickets` (project, time of the reset; dropped after the retention period). |

## Rejected options
- **Separate admin page or a role in Ruumble**: a second permission system next to Mumble's, and one more thing to find. The plant sits where the data is.
- **Reset ticket links per room only**: the learned links are global (one project, one base URL), so a reset that only applied to one room would leave the wrong link everywhere else.
- **Remove orphaned data immediately and automatically**: a room renamed by deleting and recreating it, or moved by mistake, would lose its board at once. The 7-day grace (ADR-0011) stays; care is the early way out.

## Consequences
- One more Ice call per paired session and channel every 10 s (Write next to Enter, for the root, floors and rooms).
- The service now remembers the names of floors and rooms that have boards; they are deleted with the data.
- `REST /api/care/*` (`bridge/src/board/care.ts`), schemas in `protocol/src/index.ts`.
