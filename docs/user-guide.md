# User guide

Ruumble shows your Mumble server as an office building in the browser. You see who sits where, switch channels with a click and can pin things to the board in every room. You still talk through your normal Mumble client.

## Requirements

- **Linux** with the Mumble client **1.4 or newer** (from your distribution's package manager). The plugin is not yet available for Windows or macOS.
- A Mumble server that has Ruumble set up. You can tell by a line `ruumble: …` in the description of the top channel, or by a link in the welcome message when you connect.
- A current browser (Firefox, Chrome, Edge).

## Setup (once)

### 1. Download the plugin

Open the address of the Ruumble service in your browser and download the plugin there (`…/download`; the file is called `ruumble-<version>.mumble_plugin`, currently version 0.4.x). The address is in the description of the top channel, for example `ruumble: http://192.0.2.10:64080`, or you get it from the server operator.

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

- **Elevator (left):** one button per floor. Locked floors (nested too deeply or more than 8 rooms) are greyed out; for those, use the classic channel view in Mumble.
- **Rooms and corridor:** clicking a room or the corridor moves you to that channel. Your room is light blue, your avatar has a yellow ring.
- **Icons on people:** muted, deafened, "quiet" (has not talked for 15 minutes), "away" (deafened and quiet for 5 minutes). An ear on a room means someone is listening in. "● Recording" means the room is being recorded.
- **User menu (bottom left):** mute microphone, deafen, back to your own floor, change language.

### Language

The web UI is in German if your browser prefers German, otherwise in English. You can switch it with the language button in the user menu (bottom left); the browser remembers your choice.

The plugin's messages in the Mumble log follow the system language (`LC_ALL`, then `LC_MESSAGES`, then `LANG`): German for `de…`, English for everything else.

### Board

- The **two notes at the top right of your room** show and hide the board, as does the **B** key (not while you are typing). Boards exist only in rooms, not in the corridor or the entrance.
- Everyone **who is currently in the room** can see and edit it. The author and Mumble admins can delete posts.
- **Text** with Markdown (`**bold**`, lists, links), **code** via the `<>` icon (Ruumble suggests this itself when you paste source code), **images and files** up to 10 MB via the paper clip, with Ctrl+V or by dragging them in.
- Send with the paper plane or **Ctrl+Enter**. The others in the room see a short notice in the Mumble log.
- **Checklists**: a text whose lines after an optional introduction are all tasks (`- [ ] Task` or `- [] Task`, `- [x] Done`) becomes a list that everyone in the room can tick. The card shows the progress, e.g. "2/5".
- **Reactions**: the smiley with the plus under a post; the summary at the top right of the card shows who reacted.
- **Keep on top**: in a post's popup, **Keep on top** puts it into a slim row above the list, e.g. for the checklist of the day. A click unfolds it. There is one per room; keeping another post on top replaces it.
- **Search and filter** in the header of the board.
- Posts are kept for 30 days.

## Questions and problems

| Problem | Solution |
|---|---|
| "This device is not paired yet." | The browser does not know you yet. Start Mumble with the plugin enabled and connect, then click **Pair this browser** and enter the code from the Mumble log. |
| Pair **another browser**, profile or web app | Open Ruumble there, click **Pair this browser** and enter the code from the Mumble log (step 3). |
| "Mumble is not connected." | Mumble is not running, not connected to the server, or the plugin is not enabled (step 2). |
| The plugin cannot find the service | Check the Mumble log (lines starting with "Ruumble:"). It names the address the plugin connects to and, if that fails, the reason (e.g. a certificate that does not match the domain). You can set the address in `~/.config/ruumble/plugin.json` with `"bridgeUrl": "http://…"`. |
| Clicking a room does nothing | You lack the Mumble permission to enter that channel; Ruumble then shows a notice. |
| Update the plugin | Download the new file and install it as in step 2 (overwrite the existing one). |

### Plugin settings

`~/.config/ruumble/plugin.json` (or `$XDG_CONFIG_HOME/ruumble/plugin.json`):

| Field | Meaning |
|---|---|
| `bridgeUrl` | Fixed address of the service, instead of reading it from the channel description |
| `autoOpen` | `false`: do not open the pairing link in the browser automatically |
| `pairedWith` | Services this computer is already paired with (managed by the plugin) |
