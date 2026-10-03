# ADR-0011: Own storage for the board

Status: accepted (2026-09-28)

## Context
The board (idea A in the [feature list](../features.md)) is the first part of Ruumble that **stores content itself**. Until now the service only reads Mumble and holds nothing but device tokens. The posts (text, code, images, files) must be stored durably, with limits and with access control.

## Decision

| Topic | Decision |
|---|---|
| **Where are there boards?** | **Only in rooms**, i.e. on the 2nd level. The entrance, corridors and open floors have none. Temporary channels have none either, because their IDs are reused (S1). |
| **Storage** | **SQLite** (`better-sqlite3`, WAL mode) at `data/board.sqlite` for posts and metadata. Attachments are stored as files under `data/board/<hash[0..2]>/<sha256>`, so there are no duplicates. |
| **Read** | Paired users who are **currently present in the room** |
| **Write** | Anyone present in the room |
| **Edit** | **Everyone present**. The post shows "last edited by …". There is no version history. |
| **Delete** | The author and Mumble admins (`hasPermission(session, channel, Write)`) |
| **Retention** | **30 days** from creation, then deleted automatically, including attachments (`RETENTION_DAYS`) |
| **Limits** | **Images and files up to 10 MB**, text up to 100 KB, 2 GB in total (`BOARD_QUOTA_MB`) |
| **Storage full** | **The oldest posts are deleted first**, including attachments, until there is space again |
| **Channel deleted** | The posts stay accessible to admins for 7 days, then they are deleted. |
| **Display in the floor plan** | **No counter**, but a board graphic: **variant B with two notes** (from the design drafts), top right in the room, always the same no matter how many posts are pinned. **The graphic is also the toggle:** a click in one's own room shows or hides the sidebar; **initially it is hidden**. In one's own room it is always shown at the same strength, even without posts, and without a frame: there it does not indicate content but is only the toggle (update 2026-09-28). In other rooms it does not appear (update 2026-09-28); the content is reserved for those present anyway. The snapshot therefore no longer contains a list of rooms with posts. |
| **Note in Mumble** | "New post from X in 'room' – view in Ruumble" as a log message for everyone present except the author (plugin command `notify`) |
| **Author** | Certificate hash (stable) and the name at the time of posting. The service never hands out the hash; the web UI only gets `name` and `mine`. |
| **Security** | The service stores Markdown as **raw text** and never generates HTML. The web UI renders with markdown-it (`html: false`) and sanitises with DOMPurify. Content Security Policy for the whole web UI. Images with a checked `Content-Type` and `nosniff`; files always as a download (`Content-Disposition: attachment`). |
| **Privacy** | Stored are the post, author hash, name and timestamps; no IP addresses. Users can delete their own posts completely. |
| **Backup** | Back up the volume `ruumble-data`. `node dist/main.mjs backup <target>` copies consistently (SQLite backup API). |

## Rejected options
- **Posts in the Mumble chat or in channel descriptions:** the service would need the write secret for that (ADR-0002). Also, the limits there are far too small (images 128 KB, text 5000 characters).
- **Files only, without a database:** several people write at the same time, and retention, quota and permissions have to be queried. With individual files this quickly becomes error-prone.
- **`node:sqlite`:** still experimental in Node 22

## Consequences
- The service **becomes a data holder**. Backup and deletion after the retention period therefore become mandatory (cleanup run every hour).
- `better-sqlite3` is a native module. In the image it is installed for the target platform (prebuilt binaries, otherwise build tools in the build stage).
- The protocol grows: REST for posts and uploads, the WebSocket event `board` to those present in a room and `notify` to their plugins (note in the Mumble log). A list of rooms with posts in the snapshot existed at first; it has been dropped.

## Current state (code)
- `data/` is `DATA_DIR` (default `./data`, `/data` in the Docker image).
- The text limit is enforced as 100,000 characters (`BOARD_LIMITS.textChars` in `protocol/src/index.ts`); `BOARD_QUOTA_MB` defaults to 2048.
- Images are recognised by their bytes (PNG, JPEG, GIF, WebP). SVG and everything else is treated as a file and never shown inline.
- Uploaded attachments that are not used by any post are removed by the hourly cleanup once they are older than 60 minutes.
- The board graphic does show one thing after all (update 2026-10-02): posts by others the user has not seen yet add a yellow note in front of the two, without a count (the count is only in the accessible name). "Seen" is the creation time of the newest post when the board was last open in that room, kept per room in the browser's `localStorage` (`ruumble.boardSeen`); a room seen for the first time starts as seen. To know this while the board is closed, the web UI loads the board on every `board` event and room change, not only while it is open.
- **Copy to another room** (update 2026-10-02): `POST /api/board/posts/:id/copy` with `{ channelId }` is the one exception to "write: anyone present". A post of the room the user is in may be copied to another room with a board that the user **may enter** in Mumble (`canEnter`, the same check as for moving). Reading stays as it is: the user still only sees the board of the room they are in. The copy is a new post by the copier with its origin (`copiedFrom`: room name and original author at the time), so retention starts again and the copier may delete it; the attachment is shared by SHA-256. The notice goes to the people in the target room and names the source room.
- The `notify` text is localised (German or English, from the plugin's `locale`) and reads `<name> pinned a text/code/an image/a file to the board.`, without the room name.
- **Care** (update 2026-10-03, [ADR-0014](0014-care-of-the-stored-data.md)): Mumble admins (Write permission) can clear a room's board, reset learned ticket links and remove the data of rooms and floors that are gone right away, from the plants in rooms, corridors and at the entrance. The 7-day grace for deleted channels still applies otherwise; a room moved out of the floor plan keeps its posts until the retention period or care removes them.
