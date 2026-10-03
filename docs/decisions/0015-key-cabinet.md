# ADR-0015: Key cabinet (managing paired browsers)

Status: proposed (2026-10-03)

## Context
Every paired browser holds a long-lived device token (ADR-0004, ADR-0012). Until now nobody could see which browsers were paired or take one back: a lost laptop or a shared computer kept access until the token file was edited by hand. The service stored only the certificate hash, the Mumble name and the creation time per token.

## Decision
| Topic | Decision |
|---|---|
| **Metaphor** | Every paired browser is a **key**. A **key cabinet** hangs at the entrance in the elevator, next to the plant (building care, ADR-0014). Keys are about access, not about stored board data, so they get their own symbol rather than a section in building care. |
| **Who sees what** | **Everyone** sees and may revoke their **own** keys. **Admins** (Mumble Write permission on the root channel, the same as building care) also see everyone else's, grouped by person, and may revoke them. |
| **Per key** | A coarse device label from the User-Agent at pairing or first use ("Firefox on Linux": browser family and system, no versions), the pairing date, and "last used" (written when a web UI connects, at most once an hour). No IP addresses. The browser asking is marked "this browser". |
| **Public name** | `id` = the first 16 hex digits of the stored SHA-256 of the token. The token cannot be derived from it. |
| **Revoking** | Asks first. The key is deleted; web UIs connected with it are closed with 4401 and show the pairing screen. Revoking the own browser's key also removes its cookie. The user can pair again with a code from the Mumble log (ADR-0012). |
| **API** | `GET /api/keys` → `{ mine, others }` (`others` null for non-admins), `DELETE /api/keys/:id` (`bridge/src/keys.ts`). |

## Rejected options
- **A section in building care:** building care is for admins only, but everyone should be able to revoke their own keys, and keys are not board data.
- **Keys in the user menu:** possible, but the user menu holds personal settings; the cabinet keeps the building metaphor and gives admins one place for everyone's keys.
- **Storing IP addresses or full User-Agents:** more precise, but personal data the service does not need (ADR-0011, privacy).

## Consequences
- `tokens.json` gains `device` and `lastUsed` per token; keys from before this change get their device label at their next use.
- Revoking all keys of a user does not change the plugin's `pairedWith`, so the plugin does not open a pairing link again by itself; pairing with a code works as usual.
