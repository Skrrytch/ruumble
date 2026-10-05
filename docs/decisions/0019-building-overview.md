# ADR-0019: Building overview: cross-section and directory board

Status: proposed (2026-10-05)

## Context
The floor plan shows one floor at a time; the elevator lists every floor with its head count. Nobody could see at a glance who is where in the whole building, find a person by name, or go to them without searching floor by floor.

## Decision
| Topic | Decision |
|---|---|
| **Where** | A large dialog over the floor plan, opened from the elevator's status bar ("N online · building", now a button) or with the key **H** (house, Haus: the same in German and English; also in the read-only preview). Not a sidebar: the right side belongs to the board. |
| **Left: cross-section** | Like an architect's section drawing: the roof with the server's name, the floors stacked as in the elevator (highest on top, 5 px slabs between them), the elevator shaft on the left with the cabin at the own floor, the entrance at the bottom. Rooms keep their floor-plan proportions (`splitRows`, `grow`), with the corridor between the rows. **Lights on:** occupied rooms are tinted light blue, the own room like in the floor plan. People are 22 px mini avatars (own yellow ring, presence as opacity, a dot for a status, the full label as tooltip), up to 8 per room, then "+n". Locked floors (too deep) are a hatched band with their head count. |
| **Right: directory board** | The lobby's directory ("Haustafel"), a dark plate like the floor sign: per floor its badge and name (a button that shows that floor), the people sorted by name with their place and status, then the entrance and "Elsewhere" (hidden channels). A search over name, place, status and floor, every word must match. |
| **Actions** | A person is a button that goes to their place (join, with Mumble's Enter permission, not on locked floors or in hidden channels); a room in the cross-section moves there; Enter in the search goes to the first match one can go to. After a move the floor plan shows the own floor again. Hovering a person on one side marks them on the other. |
| **Data** | Nothing new from the service: `web/src/lib/model/overview.ts` derives the directory from the snapshot and the building (pure functions, ADR-0007). Talking is not shown (ADR-0005). |

## Rejected options
- **A permanent sidebar or a new top-bar button:** the board takes the right side, the top bar is full.
- **Only a list:** the cross-section is what makes it the building; the list alone would be a contact list.
- **Showing who talks:** only the own plugin knows it, and only for people one hears (ADR-0005).

## Consequences
- The elevator's status bar is a button now; its tooltip names the overview and H.
- Later: filters (with a status, active, free rooms), knocking (idea C) from a person, the floor plants for building admins, a highlight for people who just arrived.

## Current state (code)
- (2026-10-05) Simpler cross-section: the building is shown from the side only. Rooms are no longer drawn as a floor plan inside the floors and not named; on every floor the people stand in groups, one per occupied room or the corridor, set apart by a thin line (the own group tinted light blue). The room's name is in the group's tooltip, and a group is still a button to move there. No head count next to the floors; mini avatars are 26 px.

