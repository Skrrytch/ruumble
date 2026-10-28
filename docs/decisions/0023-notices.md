# ADR-0023: Notices: levels and output channels

Status: proposed (2026-10-28)

## Context
Some events matter to the people in a room: someone enters, a post lands on the board, a file is handed through the tube, someone gets a quiet word or a nudge. Each of them has so far found its own way to the user (a sound for the nudge, a toast for a private message and for tube mail, nothing for entering or the board). Ruumble should draw attention to them without disturbing work, also while its tab is in the background.

## Decision
Events say *what happened and how urgent it is*; they know nothing about sounds or titles. A pure policy turns an event into a list of **output channels**; each channel is a small adapter behind one interface and knows nothing of the others.

| Topic | Decision |
|---|---|
| **Levels** | `off`, `quiet` (counter only), `visible` (a short cue in the room), `loud` (toast and sound). Each kind of event has a level, set per browser (`localStorage`); the service never learns of it. |
| **Channels** | `counter` (count at the board button / room sign), `cue` (short cue in the room, vanishes by itself), `toast`, `sound`, `title` (`(2) Place · Ruumble`; a loud event flashes it three times), `favicon` (dot on the tab icon, drawn with a canvas), `badge` (App Badging API, only effective in the installed app), `desktop` (Notification API). |
| **Tab visible or hidden** | Visible: `quiet` → counter; `visible` → + cue; `loud` → + toast, sound. Hidden: `quiet` and `visible` → counter, title, favicon, badge (no sound, no notification); `loud` → + toast, sound, desktop. The counters clear when the tab becomes visible again. |
| **Do not disturb** | A status of "do not disturb" (an own status, ADR-0018) caps every level at `quiet`. |
| **Nudge breaks through** | A nudge to oneself is never capped by "do not disturb" and its desktop notification stays until clicked (`requireInteraction`). Whoever does not want nudges sets that kind to `off`. |
| **Speaking** | While the own user is talking, no sound and no toast; the visual channels still apply. |
| **Bundling** | Events of one kind within 10 s become one ("3 people entered"); a bundled event does not play the sound again. |
| **Defaults** | Someone enters: `visible`. Board post: `quiet`. File in the tube for others in the room: `visible`; for oneself: `loud`. Private message: `loud`. Nudge: `loud`. |
| **Who gets told of what** | Only the person concerned hears of a nudge or a quiet word ("Anna nudged you"); nobody else in the room learns that it happened, who was nudged, or what was said. |
| **Desktop notifications** | Opt-in per browser (one explicit permission prompt), only used while the tab is hidden. Text shows the sender only ("Message from Anna"), not the message, unless switched on; titles, favicon and badge show only numbers. |
| **App Badging** | `navigator.setAppBadge` behind a feature check and a `catch`; without support or without the installed app it does nothing. The manifest already makes Ruumble installable. |
| **Code** | `web/src/lib/notices/`: `model.ts` is pure (policy, bundling, title text, settings parsing) and unit-tested with the 95 % threshold; the channels and the centre that listens to the sources are the thin, browser-bound part. |

## Rejected options
- **A web push service.** Would reach closed tabs, but needs a service worker, push keys and a push server; too heavy for a self-hosted bridge without a cloud. A background tab is enough.
- **Raising the window with `window.focus()`.** Blocked by browsers, and rightly so.
- **Telling the room about others' nudges or quiet words** ("Anna was nudged"). Private between the two people; the room hears nothing.
- **Settings stored by the service.** Hearing, flashing and notifying are properties of one browser on one desk; a shared setting would apply on the wrong device.

## Consequences
- The nudge sound (ADR-0020), the toast of quiet words (ADR-0021) and the toast of tube mail (ADR-0022) move behind the centre; the setting "Sound when nudged" becomes the nudge's level.
- Entering a room is derived from the snapshot on the client; no protocol change is needed for the first step.
- Without a granted permission or in an unsupported browser a channel silently drops out; the others still work.
