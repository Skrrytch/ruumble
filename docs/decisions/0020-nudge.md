# ADR-0020: Nudge a deafened person in the own room

Status: proposed (2026-10-06)

## Context
Someone who has deafened themselves in Mumble hears nothing: no voice, and no Mumble sounds either. Mumble skips the sounds and text-to-speech of every log event while the user is deafened (`src/mumble/Log.cpp`, `if (Global::get().s.bDeaf && mt != Log::SelfDeaf) return;`). What still works is visual: the line in the log, and, while the Mumble window is not active, a highlight of the window or a desktop notification, depending on the user's log settings. A private text message therefore reaches a deafened person only if they happen to look. In an office one would tap them on the shoulder.

## Decision
| Topic | Decision |
|---|---|
| **What** | "Nudge": a person gets the attention of a deafened person. |
| **Who may nudge whom** | A paired person with a connected plugin (`Gate.viewer`), so the nudged person learns who it is. Only someone else in the **same channel** who is deafened (by themselves or the server) and has a connected plugin. |
| **How often** | Once a minute per pair of people (`RateLimiter(1, 60 s)`, key: both certificate hashes). Refused nudges do not count. |
| **What arrives** | A line in the nudged person's Mumble log through their plugin's existing `notify` ("Anna nudged you and would like your attention.", in their language), and a WebSocket event `nudge` to their own web UIs only. Ruumble shows a notice for 30 s and plays two short tones made with WebAudio. |
| **Sound** | From the browser, not from Mumble, so deafening does not silence it. Browsers allow sound only after the page was used once; the first click or key press unlocks it. A switch "Sound when nudged" in the user menu turns it off for this browser (`localStorage`); the notice shows either way. |
| **Where in the UI** | In the floor plan, hovering a deafened person in the own room shows a card with their states and a "Nudge" button instead of the plain tooltip. The avatar sits inside the room's button, so the card is a popover beside it. For the keyboard, the directory board of the building overview (H) has a bell beside such a person. |
| **API** | `POST /api/nudge` `{ session }` → 204, errors `not-paired`, `invalid` (oneself), `not-found` (unknown or without plugin), `not-in-room`, `not-deaf` (409, new), `rate-limited` (`bridge/src/nudge.ts`). |
| **Storage** | None. Nothing is logged or kept. |

## Rejected options
- **A sound from the plugin (`playSample`).** Available since plugin API 1.0 (1.2 only adds a volume), and Mumble's audio output does not check for deafen, so it would probably be heard. It needs a plugin release, a sound file in the bundle and a live test; the browser sound needs none of it. Kept as the next step if people without an open Ruumble tab should hear a nudge.
- **Nudging from anywhere in the building.** Unwanted: a nudge is the tap on the shoulder of someone next to you, not a call across the building.
- **Nudging people who are not deafened.** They hear you; talking is the way.
- **Double click on the avatar.** The avatar sits in the room's button: the first click would move into that room, and people behind "+N" cannot be clicked at all.
- **Browser notifications (Notification API).** Need a permission prompt; the Mumble log line already gives a desktop notification where the user has enabled it. Possible later.
- **"Do not disturb".** Not now; a status already says it in words.

## Consequences
- The protocol grows by `UiNudge` (service → web UI), `NudgeRequest` and the error code `not-deaf`. The plugin is unchanged: `notify` already exists.
- Someone without an open Ruumble tab only gets the log line (and Mumble's visual notification, if enabled).
