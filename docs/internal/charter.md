# Ruumble – Project charter

As of 28.09.2026. This is the internal reference for goals, guardrails, building rules and decisions. What is implemented today is listed in [features.md](../features.md), the architecture in the [ADRs](../decisions/README.md), and every Mumble call Ruumble uses in [mumble-interfaces.md](../mumble-interfaces.md).

Basis: the design handover (spec, prototype, design tokens) and a review of the Mumble source (`master` 7bbd2c16a of 26.09.2026; its interfaces are identical to release v1.6.870).

---

## 1. Purpose and goals

Ruumble is an **alternative web UI** for Mumble. It shows the channel tree of a server as an office building: floors, corridors and rooms, with the people sitting in them. Clicking a room moves you into that channel. Voice stays in the regular Mumble desktop client.

## 2. Guardrails

Set by the project owner.

| # | Guardrail | Consequence |
|---|---|---|
| L1 | Ruumble is **completely independent of the main project**. | Standalone repository (ADR-0009). Only two Mumble interface files are taken over unchanged (`third_party/mumble/`, pinned to one release). |
| L2 | **Mumble stays independent.** | Server and desktop client keep working unchanged. Ruumble is an additional view, not a replacement. |
| L3 | The view uses **only the existing channel structure**. | No building configuration of its own, no extra metadata on the server. Everything is derived from the tree and the names. (Small exception: the service address in the root channel description, ADR-0010. It does not affect the view.) |
| L4 | If the structure is **deeper than two levels**, the floor is **not available**. | The rule applies per floor (see 3.3). |

## 3. Building rules: channel tree → building

### 3.1 Basic mapping

| Mumble | Building |
|---|---|
| Root channel | Building (sign in the elevator core); users in it stand in the entrance |
| First-level channel | Floor, ordered as in 3.2 |
| The floor channel itself | Corridor, always enterable |
| Second-level channel | Room/office of the floor (temporary channels included) |
| Floor without subchannels | One open floor (e.g. "Lobby") |
| Name contains "(stumm)" | "Speaker off" icon, purely visual |

### 3.2 Ordering

- Floors are sorted by Mumble **`position`**, then by name, exactly as in the Mumble client. The first floor is the **ground floor**, followed by 1st, 2nd, 3rd floor … The elevator lists them bottom to top.
- Rooms within a floor use the same rule. Users within a room are sorted by name.
- There are **no keywords** (such as "Lobby" as a fixed ground floor) and no special alphabetical rule. To change the order, change the `position` in Mumble.
- Floor numbers are assigned **after** hiding linked channels (3.4) and are gapless.

### 3.3 Locked floors

A floor is **locked** (cannot be shown) if

1. at least one of its visible rooms has visible subchannels (L4, notice "Channel structure too deep"), **or**
2. it has **more than 8 rooms** (notice "Too many rooms"). The corridor does not count.

If both apply, "too deep" wins.

- Locked floors appear in the elevator, greyed out, with `aria-disabled` and the reason as a hint.
- Numbering stays stable: a locked floor keeps its number.
- The rules are re-evaluated **live on every change**. Adding a subchannel locks the floor immediately; removing it unlocks it.
- If the user is on a locked floor, it is still highlighted in the elevator. Instead of the floor plan the UI says: "You are in an area that cannot be shown here".
- If **no** floor can be shown, the UI shows a "vacant" message.

### 3.4 Other rules

- **Entrance:** Users in the root channel stand in the entrance, shown below the elevator box.
- **Temporary channels** on the second level are normal rooms (but have no board, see ADR-0011).
- **Linked channels disappear completely**, including all their subchannels. Any channel with a non-empty `Channel.links` is not shown. Links in Mumble are always bidirectional, so both sides disappear. The remaining rooms share the space, and hidden rooms do not count towards the limit of 8. Edge cases: O2–O4.
- **Listening:** If someone listens to a room (channel listener), an ear icon next to the room name shows it, with the tooltip "N people are listening", without names (E27).
- **Badges** at the avatar (E28): server mute, server deaf and suppressed as a dark badge with microphone-off; self-mute light with microphone-off; self-deaf light with headphones-off. Each badge has a tooltip.
- **Talking:** A pulsing ring around the avatar, mid-blue, not yellow. Only what the user's own client hears (E19).
- **Presence** (E30): quiet after 15 minutes without talking; away when self-deafened and quiet for at least 5 minutes. Someone talking is always active. Recording shows a red dot at the avatar and a hint at the room.
- **Locked rooms:** A lock icon marks rooms the user may not enter (Ice `hasPermission`).
- Password-protected channels are not supported (ADR-0003).

### 3.5 Layout

- Compact header: floor name on the left; people on the floor and "N online" on the right.
- **Floor plan:** the elevator core on the left (building sign, elevator with one button per floor, entrance, user menu) and the floor area on the right: top row of rooms, corridor, bottom row. Walls are 4 px gaps; every door has a door arc.
- The **building sign** shows only the server name (no "primary" label, E9).
- **Room widths and rows** (E31): order follows the Mumble position. Rooms 1 and 2 are large, then rooms get gradually smaller. The top row has ⌊n/2⌋ rooms (at least one), the rest go below; with at most 8 rooms that is at most 4 per row. With 1–2 rooms, the open board gets wider.
- Own room has a light blue background, own avatar a yellow ring. That is the only yellow element.
- Interaction: clicking a room moves the user (only after server confirmation; a short transition, and a message on rejection). Clicking a floor only changes the view. Plus mute, deafen and "go to my floor".
- Accessibility: real buttons, `aria-current`, `aria-pressed`, touch targets ≥ 44 px.
- Minimum height 720 px, width flexible up to 1440 px. There is no separate small-window layout.
- Colours, sizes and radii come from the design tokens. Font and icons are freely licensed: **Inter** (SIL OFL) and **Lucide** (ISC) (E13).

## 4. Architecture summary

Neither interface alone is enough. The client plugin API lacks the parent channel, `position`, links, listeners and other users' mute state; Ice lacks self-mute/deafen, talking state and ACL-checked moves. A Mumble fork would violate L1 and L2. Ruumble therefore **combines both, without patching Mumble** (E1, E2):

- **Plugin** (in the regular Mumble client): own session and certificate hash, talking state, and executes moves (`requestUserMove`, ACLs apply), mute and deafen.
- **Service** (next to the server, the central hub): reads tree, positions, user state, listeners, links, permissions and version via Ice **read-only** by polling; serves the web UI; forwards commands; stores the boards.
- **Web UI** (browser/PWA): derives the building from the snapshot.

| ADR | Topic |
|---|---|
| [ADR-0001](../decisions/0001-connection-and-topology.md) | Plugin plus service as the hub |
| [ADR-0002](../decisions/0002-read-only-ice-polling.md) | Ice read-only by polling (callbacks would need the write secret) |
| [ADR-0003](../decisions/0003-commands-and-feedback.md) | Commands only in the user's own client, confirmed via `onChannelEntered` |
| [ADR-0004](../decisions/0004-identity-and-pairing.md) | Identity by plausibility check, certificate hash as key, pairing |
| [ADR-0005](../decisions/0005-talking-indicator-local-only.md) | Talking indicator only for what the own client hears |
| [ADR-0006](../decisions/0006-tech-stack.md) | Tech stack |
| [ADR-0007](../decisions/0007-protocol-and-derivation.md) | Protocol and where the building is derived |
| [ADR-0008](../decisions/0008-operations.md) | Operations |
| [ADR-0009](../decisions/0009-standalone-repository.md) | Standalone repository instead of a Mumble fork |
| [ADR-0010](../decisions/0010-address-from-root-description.md) | Service address from the root channel description |
| [ADR-0011](../decisions/0011-own-storage-for-the-board.md) | Own storage for the board |

Feasibility studies S1 (Ice from Node.js) and S2 (minimal plugin) passed: [feasibility-studies.md](feasibility-studies.md). A weekly workflow reports new Mumble releases as an issue and triggers the live tests (ADR-0009).

## 5. Decisions log

| # | Topic | Decision |
|---|---|---|
| E1 | Connection | Variant A (client plugin), B (Ice) as an option. Server operation is in our own hands. |
| E2 | PR to Mumble | Not for now, hence the combination of A and B (section 4). |
| E3 | Platform | Linux; Windows as a later option. |
| E4 | Locked floors | Visible in the elevator, but locked (3.3). |
| E5 | Many rooms | More than 8 rooms lock the floor (3.3). |
| E6 | Root channel | Entrance below the elevator box (3.4). |
| E7 | Floor order | Mumble `position`, then name. First floor = ground floor, no keywords (3.2). |
| E8 | Talking indicator | Yes, if technically possible. It is possible with the plugin. |
| E9 | Building sign | The "primary" label is dropped. |
| E10 | Settings | No function for now. *Superseded: the settings button is gone; the user menu has a language switch in its place.* |
| E11 | Multiple servers | No, one server only. |
| E12 | Frontend | Svelte. |
| E13 | Font/icons | Freely licensed: Inter + Lucide (ADR-0006). |
| E14 | Linked channels | Disappear completely; the other rooms use the space (3.4). |
| E15 | Topology (O1) | Service as the central hub, web UI as a browser page/PWA (ADR-0001). |
| E16 | Access (O8) | Only Mumble users with a paired plugin (ADR-0004). |
| E17 | Server operation | Docker, the service as an additional container (ADR-0008). |
| E18 | Identity | Plausibility check, residual risk accepted (ADR-0004). |
| E19 | Talking indicator | Only what the user's own client hears (ADR-0005). |
| E20 | Service language | TypeScript/Node.js, fallback Python (ADR-0006). |
| E21 | Opening the UI | Automatically on first connect via the pairing link (ADR-0004). |
| E22 | Repository | Standalone as `Skrrytch/ruumble` instead of a fork; plugin name "Ruumble" (ADR-0009). |
| E23 | License | BSD-3-Clause. |
| E24 | Publication | Public repo; design handover neutralised (no company tokens, internal names or people). |
| E25 | Deployment | The project owner's home server (existing Docker setup with Mumble); tests locally (ADR-0008). |
| E26 | GPL via Ice (O13) | Accepted: the code stays BSD-3; a published image of the service is labelled as a GPL-2.0 combined work (ADR-0006). |
| E27 | Listening (O5) | Ear icon at the room, tooltip "N people are listening", no names. |
| E28 | Server mute (O6) | Dark badge with microphone-off. Self-mute light with microphone-off, self-deaf light with headphones-off. Each badge has a tooltip. |
| E29 | Settings (O7) | Button visible but disabled ("no function yet"). *Superseded, see E10.* |
| E30 | Presence thresholds (O14) | Quiet = 15 min without talking; away = self-deafened + 5 min quiet. |
| E31 | Room sizes and rows | Order still via the Mumble **position** field (no marker of our own). Rooms 1 and 2 are large, then smaller; top row ⌊n/2⌋ rooms; with 1–2 rooms the open board gets wider. |

## 6. Open questions

| # | Question | Status |
|---|---|---|
| O2 | If a first-level channel is linked, does the **whole floor** with its rooms disappear? | Resolved as assumed: yes, without the floor channel there is no corridor. Implemented. |
| O3 | Do subchannels of a hidden (linked) room still lock the floor (L4)? | Resolved as assumed: no, only visible subchannels count. Implemented. |
| O4 | Do users in hidden channels count towards "N online"? What does a user in a linked channel see? | Resolved as assumed: they count in the total; the user sees "You are in an area that cannot be shown here". Implemented. |
| O10 | Domain and certificate for the service in the internal network: internal CA or Let's Encrypt via DNS challenge? | Open. Today the service runs over plain HTTP in the local network; HTTPS is planned via a reverse proxy (`TRUST_PROXY=true`, ADR-0008). |
| O15 | Board storage (retention, limits, visibility). | Resolved by ADR-0011 (SQLite) and implemented. |
| O16 | Report the Mumble bug: from 1.6, Ice `getTexture`/`setTexture` reject exactly the registered users (inverted condition `!getRegisteredUserName(id).isEmpty()`, was `!isUserId(id)` in 1.5.735). Open an issue at mumble-voip/mumble (no PR, only a report with the code location)? | Open. Ruumble falls back to initials on 1.6.x. |
| P7 | Address check (Mumble `User.address` vs. WebSocket source IP) through a real network, proxy and VPN. | Open; passes in the Docker network with `ADDRESS_CHECK=enforce`. To be checked on the home server. |

Other assumptions: password-protected channels are not supported (ADR-0003). Where the design handover differs from this charter, the charter wins.

## 7. Remaining rollout items

- Deploy on the home server behind Nginx Proxy Manager (ADR-0008) and check P7 there.
- Small pilot with 2–3 users; collect feedback as issues.
- Branch protection for `main` (PR with green CI) is set by the repository owner.
