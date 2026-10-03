# User guide

Ruumble shows your Mumble server as an office building in the browser. You see who sits where, switch channels with a click and can pin things to the board in every room. You still talk through your normal Mumble client.

## Requirements

- **Linux** or **Windows** (64-bit) with the Mumble client **1.4 or newer** (Linux: from your distribution's package manager; Windows: from mumble.info). The same plugin file works on both. The plugin is not available for macOS.
- A Mumble server that has Ruumble set up. You can tell by a line `ruumble: …` in the description of the top channel, or by a link in the welcome message when you connect.
- A current browser (Firefox, Chrome, Edge).

## Setup (once)

### 1. Download the plugin

Open the address of the Ruumble service in your browser and download the plugin there (`…/download`; the file is called `ruumble-<version>.mumble_plugin`, currently version 0.5.x). The address is in the description of the top channel, for example `ruumble: http://192.0.2.10:64080`, or you get it from the server operator.

### 2. Install the plugin in Mumble

| Mumble in German | Mumble in English |
|---|---|
| **Konfigurieren → Einstellungen → Plugins** | **Configure → Settings → Plugins** |
| Button **„Installiere Plugin …“**, choose the file, confirm with **„Ja“** | Button **"Install plugin…"**, choose the file, confirm with **"Yes"** |
| In the list, tick the box in column **„Aktivieren“** next to **Ruumble**, then **OK** | In the list, tick the box in column **"Enable"** next to **Ruumble**, then **OK** |

### 3. Connect and pair

Connect to the server as usual. The first time, the plugin opens your browser with a **pairing link**. This tells Ruumble that this browser belongs to your Mumble. After that, just open Ruumble at the service's address; the browser stays paired.

**Another browser, profile or web app** (or the link did not work): open Ruumble there and click **Pair this browser**. Your Mumble log shows a 6-digit code, e.g. "Ruumble: Pairing code for a browser: 482 913"; type it in and click **Pair**. Mumble with the plugin must be connected on the same computer. The code is valid for 5 minutes.

If the Mumble log says "Hover once over the top channel …", the channel description is too long to be sent automatically. Hovering over the top channel once is enough; then the plugin connects.

### 4. Install as an app (optional)

With an HTTPS address (`https://…`), Chrome, Edge, Chromium, Brave and Vivaldi can install Ruumble as an app: open Ruumble and click the install icon at the right end of the address bar (or menu → **Install Ruumble**). Ruumble then runs in its own window without tabs, with its own entry in the taskbar and the app menu. The app uses the browser's pairing, so there is nothing to pair again. Tools that create web apps with their own browser profile (e.g. Linux Mint's "Web Apps") start unpaired; pair them once with a code (step 3).

Links from Mumble (welcome message, pairing link) open in your default browser. Chrome can hand them to the installed app instead: turn on **Open supported links** in the app settings (in the app window: menu → **App info** → **Settings**). Where the browser does not support that, simply start Ruumble from the app menu. Firefox cannot install web apps on Linux.

## Using Ruumble

- **Top bar:** on the left the floor sign with the current floor and the number of people on it. Click it to open the **elevator**: one button per floor with its head count, the entrance below the ground floor, and at the bottom how many people are online on the server. Locked floors (nested too deeply) are greyed out; for those, use the classic channel view in Mumble. In the middle the sign of the room you are in; when you look at another floor, it takes you back.
- **Rooms and corridor:** clicking a room or the corridor moves you to that channel. Your room is light blue, your avatar has a yellow ring.
- **Icons on people:** muted, deafened, "quiet" (has not talked for 15 minutes), "away" (deafened and quiet for 5 minutes). An ear on a room means someone is listening in. "● Recording" means the room is being recorded.
- **Right in the top bar:** mute microphone and deafen; your name badge opens the user menu with "Go to my floor", the language switch and the versions.

### Language

The web UI is in German if your browser prefers German, otherwise in English. You can switch it in the user menu (your name, top right); the browser remembers your choice.

The plugin's messages in the Mumble log follow the system language (Linux: `LC_ALL`, then `LC_MESSAGES`, then `LANG`; Windows: the display language): German for German, English for everything else.

### Board

- The **two notes next to your room's name**, at its door on the corridor side, show and hide the board, as does the **B** key (not while you are typing). Boards exist only in rooms, not in the corridor or the entrance.
- Everyone **who is currently in the room** can see and edit it. The author and Mumble admins can delete posts.
- **Text** with Markdown (`**bold**`, lists, links), **code** via the `<>` icon (Ruumble suggests this itself when you paste source code), **images and files** (up to 10 MB unless your admins changed it) via the paper clip, with Ctrl+V or by dragging them in.
- Send with the paper plane or **Ctrl+Enter**. The others in the room see a short notice in the Mumble log.
- **Task lists** (checklists): a text whose lines after an optional introduction are all tasks (`- [ ] Task` or `- [] Task`, `- [x] Done`) becomes a list that everyone in the room can tick. The card shows the progress, e.g. "2/5".
- **Actions** appear at the bottom right of a post when you point at it (or reach it with the keyboard): open, react, copy or download, and "…". The post is lightly highlighted meanwhile, so you see exactly which one they apply to. Several posts by the same person in a row share one name line; the time of each is shown with its actions.
- **Reactions**: the smiley with the plus in a post's actions; the summary at the top right of the card shows who reacted.
- **Keep on top**: point at a post and click the small dot on its top edge (it turns into a pin), adjust the title and press Enter. The post then sits in a slim row above the list, e.g. the checklist of the day; a click unfolds it. There is one per room; keeping another post on top replaces it.
- **Copy to another room**: "…" under a post → **Copy to room …** → choose the room, e.g. to take the final SQL from a meeting room back to your team room. You do not have to be there; any room you may enter in Mumble is offered. The copy is your post there and says where it came from ("from “Meeting”, by Ben"); the people in that room get the usual notice in the Mumble log. Ticks in a task list are copied, reactions are not.
- **Links** show a short form, e.g. "PR #13 · ruumble" or "TAG-1366" instead of the long URL; the full address is in the tooltip. Links in code and logs are clickable too, and the card lists them below the code.
- **Ticket keys** such as `TAG-1366` become links to Jira by themselves, once anyone on the server has posted a full link to an issue of that project (e.g. `https://jira.example.com/browse/TAG-1`). Nothing needs to be set up.
- **Search and filter** in the header of the board.
- Posts are kept for one year (unless your admin set something else).
- The **plant** in a room, at the end of the corridor and at the entrance (in the elevator) is for Mumble admins: it opens room, floor or building care, e.g. to delete old posts, clear or export a board (room), see all rooms or move a board to a recreated room (floor), or check the storage and reset a wrong ticket link (building, at the entrance). For everyone else it is just a plant.
- **My keys** in the menu behind your name badge lists your paired browsers ("keys"). Revoke one you no longer use or have lost; that browser then has to be paired again.
- Admins also find a **wrench** next to the plant at the entrance: the building maintenance with settings such as how long posts are kept and the largest file, and everyone's keys.

## Questions and problems

| Problem | Solution |
|---|---|
| "This device is not paired yet." | The browser does not know you yet. Start Mumble with the plugin enabled and connect, then click **Pair this browser** and enter the code from the Mumble log. |
| Pair **another browser**, profile or web app | Open Ruumble there, click **Pair this browser** and enter the code from the Mumble log (step 3). |
| "Mumble is not connected." | Mumble is not running, not connected to the server, or the plugin is not enabled (step 2). |
| The plugin cannot find the service | Check the Mumble log (lines starting with "Ruumble:"). It names the address the plugin connects to and, if that fails, the reason (e.g. a certificate that does not match the domain). You can set the address in `plugin.json` (see below) with `"bridgeUrl": "http://…"`. |
| Clicking a room does nothing | You lack the Mumble permission to enter that channel; Ruumble then shows a notice. |
| Update the plugin | Download the new file and install it as in step 2 (overwrite the existing one). |

### Plugin settings

Linux: `~/.config/ruumble/plugin.json` (or `$XDG_CONFIG_HOME/ruumble/plugin.json`). Windows: `%APPDATA%\ruumble\plugin.json`.

| Field | Meaning |
|---|---|
| `bridgeUrl` | Fixed address of the service, instead of reading it from the channel description |
| `autoOpen` | `false`: do not open the pairing link in the browser automatically |
| `pairedWith` | Services this computer is already paired with (managed by the plugin) |
