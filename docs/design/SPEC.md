> **Note:** This is the original design specification (neutralised). Where it differs, the [charter](../internal/charter.md) applies, above all for deeper levels, sorting, the "primary" label, font and icons.

# Specification: Mumble office building (floor view)

Graphical web UI for a Mumble server that shows the channel tree as an office building. Users see who is sitting where and switch channel by clicking a room.

Visual reference: `prototype/index.html` (runnable, matches the original design). The header and room widths have changed since then (section 2, E31); the layout test therefore only compares position and height. Tokens: `tokens.css`.

---

## 1. Mapping channel tree → building

| Mumble | Building | Rule |
| --- | --- | --- |
| Root channel (e.g. "Acme HQ") | Building | The name appears as the building sign in the elevator core |
| First-level channels | Floors | Ordered by `position`, then name. Index 0 = "G" / "Ground floor", then "1" / "1st floor" and so on. |
| Second-level channels | Rooms (offices) of a floor | Ordered by `position`, then name |
| The floor channel itself | **Corridor** | Users who are directly in the floor channel (not in a sub-room) stand in the corridor. The corridor can **always be entered**. A channel named "Corridor" has no special meaning. |
| Channels from the third level down | – | cause the floor to be locked (see the charter) |

Special cases:

- **Floor without sub-channels** (e.g. "Lobby"): shown as one large open room that corresponds to the floor channel.
- **Room name contains "(muted)"** (case-insensitive): speaker-off icon next to the name. Purely visual.

## 2. Layout

Fixed reference size 1440 × 900 px (desktop). From top to bottom:

1. **Header** (compact, changed 28.09.2026): on the left only the floor name (22 px, bold), since the floor is already marked in the elevator. On the right two badges (Blue 100): a person icon with the number of people on this floor, and "N online" with a dot. No floor designation, no room count, no usage hints. The floor plan fills the remaining height.
2. **Floor plan** (height 670 px): dark blue background with 4 px padding and 4 px gap. The gaps form the **walls**.
   - **Elevator core** on the left, 300 px wide, grey background (`--color-surface`). Has a 110 px high opening to the corridor (at corridor height, `top: 276px`).
   - **Floor area** on the right: top row of rooms (272 px), corridor (110 px), bottom row of rooms (272 px).

### Room layout (dynamic)

- The rooms of the floor (without the floor channel) are split: `top = rooms[0 .. ceil(n/2)]`, `bottom = rest`.
- Width of each room by its rank in the Mumble order (E31): rooms 1 and 2 `flex-grow` 1.3, then gradually smaller (1.1; 1.05; … down to 0.85). The large rooms are therefore always at the top left.
- Split: `⌊n/2⌋` rooms at the top (at least 1), the rest at the bottom. With an odd number, the bottom row therefore has one room more.
- Floors with 1–2 rooms: when the board is open, the floor plan and the board share the width.
- Every room has a **door** to the corridor: a 48 px wide gap in the wall (white 4 px element over the wall joint), 28 px from the left edge of the room, plus a door arc (quarter circle, 1.5 px, Blue 300). The top row has the door at the bottom, the bottom row at the top (mirrored). The bottom row has `padding-top: 56px` so that the arc does not cover the text.
- Corridor: background grid (dots `#E3E3E3`, radius 2 px, spacing 10 px on white).

## 3. Elevator core (navigation + user menu)

From top to bottom:

1. **Building sign**: server name (20 px bold), below it "Mumble server · <label>".
2. **Elevator panel** (`<nav aria-label="Elevator – floors">`): gradient (`--gradient-elevator`), 4 px radius. Header with elevator icon, "Elevator" and "Floor <badge>" of the floor shown.
   - One button per floor, **highest floor at the top** (reverse order).
   - Button: round badge (40 px) with "G"/number, floor name, "N online".
   - The floor shown is highlighted (white background, filled badge) and has `aria-current="page"`.
   - **No** "you" marker for your own floor.
3. **User menu** (at the bottom, `margin-top: auto`):
   - Your own avatar + name + "<room name> · Floor <badge>".
   - Toolbar (`role="toolbar"`), 44 × 44 px buttons:
     - **Mute microphone** (toggle, `aria-pressed`)
     - **Deafen** (toggle, `aria-pressed`): deafening also mutes. If "mute" is pressed while "deafen" is active, both are lifted (Mumble behaviour).
     - **Go to my floor**: moves the view to the floor of your own channel.
     - **Settings**: placeholder, no function yet.
   - Active state of a toggle: filled dark blue, white icon with a strike-through.
   - Version line: "Server <version>" on the left, "Interface <version>" on the right (12 px).

## 4. Rooms & people

- Room = `<button>` with title (16 px bold), occupancy ("free" / "1 person" / "N people", 13 px Blue 700) and avatars.
- Avatar: 44 px circle, initials = the first 2 characters of the name, name below (13 px). Other users: Blue 500 (#0078BE) with white text. **Own user**: dark blue with a 3 px **yellow ring**. This is the only yellow element (rule: use yellow sparingly).
- If a user is muted or deafened, a small white badge at the bottom right of the avatar shows a crossed-out microphone.
- **Own room**: background Blue 100 (#CEE4F8), no hover, `cursor: default`. **No** "you are here" label (only in the `aria-label`).
- Hover on other rooms: grey. Focus: 3 px ring in mid blue, inset.

## 5. Interactions

| Action | Effect |
| --- | --- |
| Click on room / corridor / open floor | your own user moves to this channel (click on your own room: nothing) |
| Click on floor button | only the **view** changes, the channel stays |
| "Go to my floor" | view → floor of your own channel |
| Mute / Deafen | set self-mute / self-deaf |
| On start | the floor of your own channel is shown |

Live updates: channel and user changes (join/leave/move/mute, new or renamed channels) must be rendered again immediately. The room layout follows from the data and is never stored.

Motion: transitions 160 ms, `cubic-bezier(0.22, 1, 0.36, 1)`. No bounces.

## 6. Data model (frontend)

See `prototype/mock-data.json`. Minimum required:

```ts
type Channel = { id: number; parent: number | null; name: string; position: number };
type User = { session: number; name: string; channel: number; selfMute: boolean; selfDeaf: boolean };
type Snapshot = { server: { name: string; label: string; version: string }; self: { session: number }; channels: Channel[]; users: User[] };
```

The derivations (floors, rooms, occupancy, widths) are pure functions. They come from the prototype ("Deriving the building from the channel tree") and now live in `web/src/lib/model/building.ts`; the widths now follow the rank instead of the name (E31).

## 7. Accessibility

- All clickable areas are real `<button>` elements with a meaningful `aria-label` ("Clara's office – enter", "Corridor DEVELOPMENT – enter", "… – you are here").
- Floor navigation as `<nav>`, active floor with `aria-current="page"`. Toggles with `aria-pressed`.
- Contrast: secondary text in Blue 700 (#00508C) on white/grey ≥ 4.5:1. No information conveyed by colour alone.
- Touch targets ≥ 44 px.

## 8. Design rules

- Font: Inter, fallback Arial. Headings bold, no all caps, no emojis.
- Colours only from `tokens.css`. Yellow only for the ring around your own avatar.
- Radii: 0 for rooms/walls, 4 px for panels/buttons, round only for avatars/badges.
- Icons: line icons, 2 px stroke. The icons in the prototype are placeholders following the specification and will be replaced by Lucide.

## 9. Open decisions (to be settled before implementation)

1. **Connection to Mumble**: the web UI needs live data and must be able to move your own user. Possible approaches: a separate Mumble client in the browser (web client with WebSocket proxy) or a backend that reads and sets state via the server admin interface of Murmur/Mumble server. There is also the question of whether the web UI **handles audio itself** or only "remote-controls" the desktop client.
2. **Identity**: how does the web UI know your own user (`self.session`)? This depends on 1.
3. **Tech stack** of the frontend (framework, build).
4. **Responsiveness**: the design is laid out for 1440 × 900. Behaviour is missing for smaller windows and for floors with many rooms (e.g. > 10: scrolling rows or several corridors).
5. **Channels from the third level down**: currently ignored. Options: count them as users of the parent room, or show them as a sub-area within the room.
6. **Settings**: content of the menu.
7. **Version numbers**: source of the server version (from the handshake) and the UI version (from the build).
