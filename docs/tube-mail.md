# How tube mail works

Tube mail hands a file from one person to others who are in Mumble at the same time. The server only passes the file through; it never stores it. This page describes the flow and what protects it. The decision behind it is [ADR-0022](decisions/0022-tube-mail-files.md).

## The flow

```
Sender's browser                 Ruumble service                 Recipient's browser
      │                                │                                  │
  1   │── offer: name, type, size, ───▶│                                  │
      │   note, recipients             │── notice in Ruumble ────────────▶│
      │                                │── line in the Mumble log ───────▶│ (Mumble client)
      │                                │                                  │
  2   │                                │◀──────────── "Accept" ───────────│
      │                                │──────── one-time ticket ────────▶│
      │                                │◀──── download with the ticket ───│
      │◀── "send it to this person" ───│                                  │
      │                                │                                  │
  3   │── piece 1 ────────────────────▶│── piece 1 ──────────────────────▶│
      │◀──────────────────── confirmed │                                  │
      │── piece 2 ────────────────────▶│── piece 2 ──────────────────────▶│
      │   …                            │   …                              │
      │── last piece ─────────────────▶│── last piece, download ends ────▶│
      │◀────────── "received" ─────────│                                  │
```

1. **Offer.** The sender picks a file, the people (or a room as a quick choice) and an optional note. Only the description of the file goes to the service: name, type, size, note, recipients. The file itself stays in the sender's browser tab. Each recipient gets a notice in Ruumble and a line in their Mumble log, so they also learn about it without an open Ruumble window.
2. **Accept.** The recipient sees who sends what and accepts or declines. "Accept" gets a ticket that is valid once and for 30 seconds; the browser starts a normal download with it right away. The service then asks the sender's tab to send the file to this person.
3. **Transfer.** The sender's tab sends the file in pieces of half a megabyte. The service writes each piece straight into the recipient's download and confirms it only once it has gone out, so the slower of the two sets the pace, and the service never holds more than one piece per transfer. When the last piece is through, the download ends and the sender sees "received".

Every recipient is a transfer of its own: one can accept now, another in an hour, a third declines. The sender sees each one's state in the tube mail panel: waiting, receiving (with progress), received, declined, failed.

### How long a parcel lasts

- As long as the sender's tab that holds the file is open, at most 8 hours, until everyone has it or declined, or until the sender withdraws it.
- The tab tells the service which parcels it holds every time it connects. If it is gone for more than 2 minutes (tab closed, discarded by the browser, laptop asleep), its parcels are withdrawn, and the recipients see that.
- After a restart of the service the tab offers its open parcels again; recipients who already have the file are left out.
- Closing the tab with open parcels asks first.

## Security and privacy

**Nothing is stored.** The file exists only in the sender's browser and, once accepted, in the recipient's downloads folder. On the way it passes the service piece by piece in memory. The service logs neither file names nor notes nor contents. When the service restarts, it knows nothing of earlier parcels.

**Who may send and receive.**
- Only a person whose browser is paired with Ruumble and whose Mumble is connected can send, so recipients always know who the sender is.
- Recipients are people whose Mumble is connected to Ruumble at that moment.
- Only a recipient's own paired browser can accept, decline or download. Recipients see only themselves among the recipients, not who else got the file.

**Accepting cannot be faked.** Accepting is a request that only Ruumble's own page may make; another website open in the same browser is turned away. The download needs the one-time ticket from accepting and the recipient's own browser key. A foreign page can therefore neither accept a parcel for someone nor fetch a file, and a ticket that shows up in a log is already used up or expired.

**The file arrives as the sender announced it, or not at all.**
- The service counts the bytes and aborts when the sender sends more or less than announced; the browser then shows the download as failed rather than keeping a short file.
- Files are always delivered as a download, never opened in the browser, and the browser is told not to guess their type.
- File names are cleaned (no folders, no control characters, at most 255 characters).

**No malware check.** The service does not look into files. People trust each other as they do in Mumble. Types that run programs (such as `.exe`, `.msi`, `.bat`, `.ps1`, `.sh`, `.jar`) get a warning before accepting.

**Encryption.** Files travel over the same connection as the rest of Ruumble: encrypted when Ruumble runs behind HTTPS, in plain text over plain HTTP (only meant for a LAN or VPN). There is no end-to-end encryption; the service sees the pieces as they pass.

**Abuse limits.** Up to 500 MB per file, 50 recipients, 10 open parcels per person, 20 new parcels per person and minute.

## Effects on the server

- **Bandwidth.** Every file crosses the server's line twice: in from the sender, out to each recipient. On a home server the upstream is shared with Mumble's voice. All tube mail transfers together are therefore limited to a rate set in the building maintenance ("Tube mail bandwidth", 16 Mbit/s by default, 0 = unlimited, `TUBE_MAIL_MBIT` sets the default). Raise it if the line allows.
- **Reverse proxy.** The pieces stay below the 1 MB that nginx accepts per request by default, so a proxy in front of Ruumble needs no changes, and nothing is buffered on its disk.
- **Storage.** None. There is nothing to back up.

## Limits

- The sender keeps a Ruumble tab open until everyone has the file. Mobile browsers suspend tabs in the background; sending from a phone works only while Ruumble stays in front.
- Ten recipients mean ten uploads from the sender.
- Downloads through a link are limited in web apps installed on iOS.
