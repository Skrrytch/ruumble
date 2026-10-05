# ADR-0016: Building maintenance (settings in the web UI)

Status: proposed (2026-10-03)

## Context
The board's limits were either environment variables (`RETENTION_DAYS`, `BOARD_QUOTA_MB`), so changing them meant editing the compose file and restarting, or fixed in code (largest attachment 10 MB, data of deleted rooms kept 7 days, the Mumble notice for every new post). Admins asked to adjust them without touching the deployment.

## Decision
| Topic | Decision |
|---|---|
| **Where** | A **wrench** at the entrance in the elevator, next to the plant (building care, ADR-0014). Only for admins (Write permission on the root channel); everyone else sees no wrench. The entrance thus holds only the admin tools: plant (data) and wrench (technical settings). |
| **Settings** | Retention of posts (1–3650 days), storage quota for attachments (10 MB–1 TB), largest attachment (1–100 MB), how long data of deleted rooms is kept (0–90 days), Mumble notice for new posts (on/off). |
| **Not here** | Deployment and security concerns stay environment variables: preview mode, address check, proxy, public URL. Rate limits and other technical values stay in code. |
| **Defaults** | The environment variables (or built-in values) are the defaults. Only values that differ from them are stored (SQLite table `settings`, migration 7), so a changed default still applies where nobody overrode it. "All to default" resets the form. |
| **Effect** | At once: the board reports the largest attachment to the web UI (`maxFileBytes` in the board view), the upload route streams the file to disk and stops at the current value (since 2026-10-03; before, it buffered up to 100 MB). Shorter retention, a quota below the storage in use or a shorter grace for deleted rooms make the next hourly cleanup delete data; the dialog says so and asks before saving. The environment defaults must lie within these ranges, otherwise the service does not start. |
| **Keys** | The keys of all other users (ADR-0015) are a section "Access" in the same dialog. The own keys moved to the user menu ("My keys") for everyone. |
| **API** | `GET /api/maintenance` → `{ settings, defaults, usedBytes }`, `PUT /api/maintenance/settings` (`bridge/src/maintenance.ts`). Changes are logged with the admin's name. |

## Rejected options
- **Settings in building care (the plant):** care is about the stored data; settings and access are the building's technology. A separate, recognisable symbol keeps both dialogs short.
- **A fuse box or thermostat as symbol:** fits the meaning, but at 28 px a single well-known tool is recognisable, a cabinet is not (the first key cabinet drawing showed that).
- **All environment variables in the UI:** preview mode or the address check could lock admins out or weaken security from the browser.

## Consequences
- `BOARD_LIMITS.fileBytes` is only the default now; the web UI takes the value from the board view.
- The settings are part of the board database and of its backup.

## Current state (code)
- (2026-10-05) The wrench is no longer at the entrance in the elevator: the building maintenance opens from the lantern beside the building in the building overview (ADR-0019); the dialog keeps the wrench as its symbol.
