# ADR-0021: Tube mail – private messages between two people

Status: proposed (2026-10-20)

## Context
A user asked for private conversations between two people, wherever they are in the building. Mumble has private text messages already (right-click a user, "Send message"), but Ruumble cannot take part in them:

- The plugin API has no call to send or read text messages.
- Ice delivers messages only through the callback `userTextMessage`, which needs the **write secret** and receives every text message on the server, the private ones of people who never used Ruumble included. `Server.sendMessage` also needs the write secret and sends as the server, not as the person; one cannot answer it in Mumble. The write secret would give the service full control of the server (kick, ban, ACLs, `setState`), against ADR-0001, ADR-0002 and ADR-0017 (`docs/mumble-interfaces.md`, 3.2).

So private messages in Ruumble are a channel of their own beside Mumble's.

## Decision
| Topic | Decision |
|---|---|
| **What** | "Tube mail" (Rohrpost): texts between two people who both use Ruumble, an invitation to the own room ("come over"), and the quick reactions of the board (A1) on a message. |
| **Who** | From a paired person with a connected plugin (`Gate.viewer`) to someone else whose plugin is connected. Not to oneself, not to people without Ruumble (they keep writing in Mumble). |
| **Addressing** | The snapshot names everyone with a connected plugin by `person`: the first 16 hex characters of SHA-256 over `ruumble-person:<certificate hash>` (`personIdOf`, `hub.ts`). It stays the same across reconnects, so a browser can keep a conversation, and it does not reveal the certificate hash. |
| **Delivery** | `POST /api/tube` with `TubeSend` → the message (`TubeMessage`, with id, both names and the time) as the answer and as the WebSocket event `tube` to the web UIs of **both** people (so the sender's other windows see it too). Texts and invitations also go as a line to the recipient's Mumble log through their plugin's `notify` ("Tube mail from Anna: …", in their language, one line, shortened to 300 characters), so someone without an open Ruumble tab still sees them. Reactions only go to the web UIs. |
| **Limits** | Texts up to 2,000 characters; 30 messages per person and minute (`RateLimiter`); errors `not-paired`, `invalid`, `not-found` (recipient unknown or without plugin), `rate-limited`. |
| **Storage** | The service keeps nothing and logs no content. Each browser keeps the conversations of its own person in `localStorage` (`ruumble.tube.<person>`); a conversation is forgotten **24 hours after its last text or invitation** (reactions do not extend it), checked on load and every minute. "Forget history" removes a conversation at once. When the browser is no longer paired (key revoked, ADR-0015), every conversation kept there is removed. |
| **Where in the UI** | Hovering someone with Ruumble shows the person card (formerly the nudge card) with "Send tube mail" (and "Nudge" where ADR-0020 allows it). The directory board (H) has the conversation symbol (two speech bubbles) beside such a person, and P on the focused person does the same. A window docked at the bottom right has one tab per person; its head shows where the other one is right now, their status and "Go there"; Escape closes it. The top bar has a button with two speech bubbles with the number of unread messages. A new message outside the conversation in view shows a notice at the top right with "Reply". |
| **Keys** | P opens and closes the window, comma and full stop move between the tabs, the arrow keys on the tabs too. All of them work without AltGr on German and English keyboards. |
| **Colours** | Six tints apart from the reserved ones (`--tube-1` … `--tube-6`), picked per person from their `person`: the other one's bubbles and the line under their tab. Avatars stay as they are. |

## Rejected options
- **Mumble's own messages through Ice.** See the context: the write secret, everyone's private messages in the service, and replies that cannot be answered.
- **Plugin-to-plugin data (`sendData`).** Only between clients, throttled to 4 calls per second, and never shown in Mumble's chat either; it brings nothing over the service.
- **Keeping messages in the service** (for people who are away, or the same history on every device). The service would hold personal texts, which ADR-0005 and ADR-0020 avoided; it needs care, export and a longer threat model. Messages in the service's memory only would be lost with every restart or update anyway.
- **End-to-end encryption with keys per browser.** Key distribution across several browsers per person, and a newly paired browser could not read anything; too much for messages that last a day.
- **Typing indicator, read receipts, sounds, an animated capsule.** Left out for now: less pressure, less to signal. A sound can follow the nudge's (ADR-0020) later.
- **A collapsed window ("station").** Showed only what the button in the top bar shows already (the unread count), and P brings the window back anyway; dropped before release.
- **`sessionStorage`.** Would forget a conversation when the tab is closed; a day was asked for.

## Consequences
- The protocol grows by `User.person`, `TubeSend`, `TubeMessage` and `UiTube`. The plugin is unchanged: `notify` already exists.
- Every browser has its own history: what arrived while no Ruumble window was open is only in the Mumble log, and a second device shows only what it received.
- Someone at a shared computer should use "Forget history" or revoke the browser's key; the history lasts at most a day after the last message anyway.
- Messages pass through the service in plain text (over TLS where it is set up). They are not end-to-end encrypted; the service does not log or keep them.

Current state (2026-10-22): renamed to **"A quiet word"** ("Unter vier Augen"; a message is a "message" / "Nachricht", in code the direct chat); the name "tube mail" (Rohrpost) now belongs to sending files between people (ADR-0022). In code `tube` became `chat`: `ChatSend`, `ChatMessage`, `UiChat` (event `chat`), `POST /api/chat`, `localStorage` key `ruumble.chat.<person>` (a browser takes over `ruumble.tube.<person>` once). The Mumble-log line reads "Message from Anna: …". Everything else above still applies.
