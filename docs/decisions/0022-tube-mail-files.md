# ADR-0022: Tube mail – files directly between people

Status: proposed (2026-10-22)

## Context
People in a Mumble call often want to hand each other a file: a document being discussed, a screenshot, a log. Mumble has no file transfer, and the board (ADR-0011) is the wrong place: it keeps files for everyone in a room for months, while a hand-over is meant for a few people, once, now.

The wish: pick a file, pick the people (or a room) from everyone who uses Ruumble, add a short note, send. Each recipient sees who sends what (name, type, size, note) and accepts or declines. Nothing should be stored on the server.

The name "tube mail" (Rohrpost) moves here; the private messages of ADR-0021 are now called "A quiet word" ("Unter vier Augen").

## Decision
| Topic | Decision |
|---|---|
| **What** | "Tube mail": a file offered to one or more people, each of whom accepts or declines. One offer is a **parcel**. |
| **Who** | A paired person with a connected plugin (`Gate.viewer`) to anyone else whose plugin is connected at that moment, up to 50 people. Choosing a room picks the people with Ruumble in it at that moment; whoever enters later gets nothing. Accepting or declining only needs the recipient's paired browser, so a parcel survives a restart of their Mumble. |
| **Limits** | Up to 500 MB per file, a note of up to 500 characters, 10 open parcels per person, 20 new parcels per person and minute. |
| **Transport** | The service passes the file through and stores nothing (no disk, one piece in memory per transfer). The file stays in the sender's browser tab. For every recipient who accepts, the sender's tab uploads it in pieces of 512 KiB, one request each; the service writes each piece into the recipient's download and confirms it only once it went out, so the slower side sets the pace. Pieces stay below the default request limit of reverse proxies (nginx: 1 MB), so no proxy needs changing, and nothing is buffered on the proxy's disk. |
| **Download** | A native browser download (`Content-Disposition: attachment`, `application/octet-stream`, `nosniff`, `Content-Length` of the announced size): the file goes to the downloads folder, however large, and a broken transfer shows as failed instead of a short file. The service sends the headers only when the first piece has arrived (waiting up to a minute), so a sender that does not answer gives a clean error, not a stalled download. |
| **Accepting** | "Accept" is a `POST` (origin check, ADR-0017) that returns a ticket valid once and for 30 s; the download is a `GET` with that ticket and the recipient's cookie. A foreign page can neither accept for someone nor fetch a file, and a ticket in a log is already worthless. The download starts from the click on "Accept", so browsers do not ask about "multiple downloads". |
| **How long** | A parcel lives as long as the sender's tab that holds the file, at most 8 hours, until every recipient has it or declined, or until the sender withdraws it. The tab tells the service which parcels it holds whenever it connects; if it is gone for 2 minutes (closed, discarded by the browser, laptop asleep) its parcels are withdrawn. After a restart of the service the tab offers its open parcels again. Closing the tab with open parcels asks first. |
| **Bandwidth** | Every file crosses the server's line twice, and on a home server the upstream is shared with Mumble's voice. All transfers together are limited to a rate set in the building maintenance (ADR-0016), "Tube mail bandwidth" in Mbit/s, default `TUBE_MAIL_MBIT` = 16, 0 = unlimited. |
| **What arrives** | The parcel (sender, file name, type, size, note) as a WebSocket event to the recipient's web UIs, and a line in their Mumble log ("Tube mail from Anna: report.pdf (2.4 MB) – open Ruumble to accept.", in their language), so someone without an open Ruumble tab learns about it. A recipient sees only themselves among the recipients. The sender's web UIs see each recipient's state: waiting, receiving (with progress), received, declined, failed. |
| **Safety** | Nothing is checked for malware; people trust each other as in Mumble itself. File names are cleaned (no paths or control characters, at most 255 characters) and sent encoded (RFC 5987). The service counts the bytes and aborts when a sender sends more or less than announced. Executable types (`.exe`, `.msi`, `.bat`, `.cmd`, `.ps1`, `.sh`, `.jar`, `.app`, `.dmg`, …) get a warning before accepting. Neither file names nor notes nor contents are logged. |
| **Where in the UI** | In the top bar, beside the direct chat, a file symbol with an arrow: its number counts parcels waiting for an answer, a ring around it shows own parcels on their way. It opens a panel with "Incoming" (accept, decline) and "Outgoing" (per recipient: state and progress; "Withdraw"). "Send a file" in that panel, "Send a file" on the person card, and a file dropped on a person (only them) or a room open the send dialog: the file, rooms as quick choices, the people with Ruumble (those without are shown greyed), an optional note. A file dropped anywhere else is ignored rather than opened in the tab. A new parcel shows a notice at the top right with "Accept", "Decline" and "Later"; it stays in "Incoming". |

## Rejected options
- **WebRTC directly between the browsers.** No traffic through the server, but behind NAT and company firewalls it needs a TURN server, i.e. new infrastructure, and receiving large files in the browser is fiddly.
- **Keeping the file on the server for a while.** Recipients who are away could still get it, but the service would hold personal files, need care, quotas and a longer threat model (ADR-0005, ADR-0014); that is the board's job.
- **The whole file as one streamed request.** nginx accepts 1 MB per request by default and buffers uploads on its disk before passing them on; every proxy would need changing, and the file would land on the proxy's disk after all.
- **Keeping the file in the browser's IndexedDB** so a parcel survives reloading the tab. Copies up to 500 MB into the browser's storage; later if needed.
- **Recipients joining later** (a room as a standing address). Unclear who got what; a room is only a quick way to pick people.

## Consequences
- The protocol grows by the parcel schemas, the events `parcel`, `parcel-pull` and `parcels-missing`, and the web UI's message `parcels-held` on `/ws/ui`; `BuildingSettings` grows by `tubeMailMbit`. The plugin is unchanged: `notify` exists.
- The sender has to keep a Ruumble tab open until everyone has the file. Mobile browsers suspend tabs in the background, so sending from a phone works only while Ruumble stays in front.
- Ten recipients mean ten uploads from the sender; the bandwidth limit shares the rate between all transfers.
- Downloads through a link are limited in iOS web apps.
