# ADR-0018: Status kept by the service

Status: proposed (2026-10-05)

## Context
Item B of the feature list: a short status such as "In a meeting until 2 pm", shown prominently at the avatar, with an expiry. The plan was to store it as a marked first line of the Mumble comment, so plain Mumble clients see it too. That does not work: the plugin API's `requestSetLocalUserComment` only changes the local client's model and never reaches the server (docs/features.md, B). Writing the comment via Ice needs the write secret and contradicts ADR-0002.

## Decision
| Topic | Decision |
|---|---|
| **Storage** | The service keeps the status, by certificate hash (the stable key of the pairing, ADR-0004), in `statuses.json` in `DATA_DIR`, like `tokens.json`. Per person: the current status (`text`, `until`) and the last five texts used, newest first, without duplicates. |
| **Text** | Free text, one line (line breaks and control characters become spaces), at most 80 characters, shown as plain text. |
| **Expiry** | 2 hours by default; the dialog offers 30 minutes, 1, 2, 4 and 8 hours or "never"; the API accepts 1 minute to 7 days or `null`. A timer in the service removes an expired status and sends new snapshots; the recent texts stay. The person can clear it at any time. |
| **Who sees it** | Everyone who sees the building (also the preview), as `status` on the person in the snapshot. Only while the person's plugin is connected: the session is known by certificate hash only through the plugin. When the plugin comes back, everyone gets a new snapshot. |
| **Who sets it** | The paired person, for themselves (`Gate.certHash`, Mumble need not be connected), at most 20 changes a minute. |
| **API** | `GET /api/status` → `{ current, recent }`, `PUT /api/status` `{ text, minutes }`, `DELETE /api/status` (`bridge/src/status.ts`). |
| **Web UI** | A speech bubble at the top right of the avatar, its text and expiry in the tooltip and in the avatar's label. A speech-bubble button in the top bar, before mute, opens "My status": text, expiry, set, clear, and the recent texts as a quick choice that fills the field. |

## Rejected options
- **Mumble comment via the plugin:** does not reach the server (see Context).
- **Mumble comment via Ice:** needs the write secret, against ADR-0002.
- **Status in the board's SQLite:** the board is room data with its own care and export (ADR-0011, ADR-0014); a status is personal and short-lived.
- **Recent texts only in the browser:** they would not follow the person to another browser.

## Consequences
- Plain Mumble clients do not see the status; it is a Ruumble feature.
- `statuses.json` is personal data of the paired people; it is not part of the board backup (`main.mjs backup`), like `tokens.json`.

## Current state (code)
- (2026-10-05) Entries are not kept forever: a person's entry without a running status, unchanged for 90 days, is removed with its recent texts by the hourly cleanup (`StatusBook.prune()`, `updatedAt` per entry; entries from before start counting at the first start). The dialog shows a counter from 60 characters, so a longer text is not cut off unnoticed.

