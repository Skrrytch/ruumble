# ADR-0012: Pairing further browsers with a code from the Mumble log

Status: accepted (approach) / proposed (details) (2026-09-29)

## Context
ADR-0004 pairs a browser with a one-time link that the plugin opens with `xdg-open` after the first connection to a service. That only reaches the **default browser**, and only once per address (`pairedWith` in `plugin.json`). In practice this falls short:
- A second browser, another browser profile or an installed web app with its own profile (e.g. Linux Mint's "Web Apps", `chromium --user-data-dir=…`) has its own cookies and stays unpaired.
- If the link fails once (certificate error, link expired), the plugin still counts the address as paired and never opens a new link.
- The only way out is to edit `plugin.json`, which is too much for users.

Plugins cannot show links or buttons in Mumble (ADR-0010), but they can write plain text to the Mumble log; the service already uses this for board notices (`notify`, ADR-0011).

## Decision
1. **Any unpaired browser can start pairing itself:** the "not paired" page has a button **"Pair this browser"** (`POST /api/pair/request`).
2. **Which plugin gets the code:** every connected plugin whose connection comes from the **same address as the browser**, or whose Mumble user has that address (Ice `User.address`). Both paths are checked because, behind a reverse proxy with hairpin NAT, browser and plugin share the public address while Mumble sees the LAN address. If no plugin matches, the page says so (`no-plugin`).
3. **Delivery:** the service sends each matching plugin its own **6-digit code** as a `notify` message, e.g. *"Pairing code for a browser: 482 913 (valid for 5 minutes). Ignore it if you did not request it."* No plugin change is needed, so plugin 0.4.0 works too.
4. **Confirmation:** the user types the code on the page (`POST /api/pair/confirm` with the request ID from step 1 and the code). The service sets the same device token cookie as the link in ADR-0004, bound to the certificate hash of the plugin whose code was entered.
5. **Limits:** a request is valid for **5 minutes** and allows **5 attempts**; after that it is void. At most **one request per address every 10 seconds** (`rate-limited`), so nobody can flood the Mumble logs.
6. The one-time link from ADR-0004 stays as the automatic path for the first pairing.

## Consequences
- Pairing a further browser, profile or web app takes one click and a 6-digit code, without `plugin.json` and without the default browser.
- **Security:** the code only appears in the Mumble log of the user at the matching address, so seeing it requires access to that Mumble client. Guessing is limited to 5 tries out of 10⁶ per request, and one request every 10 s per address. Several people behind the same public address (hairpin NAT) each receive their own code and a note to ignore it; the browser is paired with whoever's code is typed in. This matches the residual risk accepted in ADR-0004.
- The `/api/pair/*` routes are reachable without pairing, like `/pair`.
