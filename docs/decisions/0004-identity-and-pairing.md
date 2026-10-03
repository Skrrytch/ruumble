# ADR-0004: Identity, pairing and access

Status: accepted (2026-09-28)

## Context
- The plugin reports its session ID. Mumble offers no clean proof that this claim is true: the certificate hash is public, and `User.address` is not unique behind NAT or VPN. Challenges via the comment or the positional data would be forgery-proof, but have visible side effects.
- **The possible damage is limited:** every command runs only in the client that actually has the plugin loaded. A forger cannot move anyone. They could only read the occupancy and fake talking indicators for their own web UI.
- Only Mumble users with a running plugin may see the occupancy (decision O8).

## Decision
1. **Plausibility check on `hello`:** the service compares the plugin's claims with the state in Ice:
   - The session must exist (`getState`).
   - The certificate hash must match the SHA1 of `getCertificateList(session)[0]`.
   - The source IP of the plugin connection must match `User.address`. Feasibility study S3 clarifies whether this check works behind a proxy and VPN. If it does not work there, it is switched off.
   If a check fails, the connection is rejected.
2. **The stable key is the certificate hash**, not the session ID, because session IDs are reassigned.
3. **Pairing the web UI:**
   - After the first successful `hello` without an existing pairing, the plugin receives a **one-time link** (valid for 60 s) and opens it with `xdg-open` (on Windows `ShellExecute`, ADR-0013).
   - The web UI exchanges the link for a long-lived **device token** (HttpOnly cookie) bound to the hash.
   - The plugin remembers in `~/.config/ruumble/plugin.json` that pairing has happened and no longer opens the browser automatically afterwards. This can be changed in the configuration.
4. **Access:** a web UI only gets data if its token is valid **and** a plugin with the same hash is currently connected. Otherwise it shows "Mumble is not connected".
5. The service is reachable **only in the internal network or VPN** (ADR-0008).

## Consequences
- Mumble shows no side effects, and users do not need to configure anything.
- **Residual risk (accepted):** someone in the internal network with the same IP who knows the public data of another session can impersonate that session. They then see the occupancy, which they can see as a Mumble user anyway.
- Device tokens can be revoked: they are deleted on logout in the web UI or by the admin.

Current state (code):
- The IP check is configurable with `ADDRESS_CHECK` = `off` / `warn` / `enforce`, default `warn` (only logs a mismatch). The home network compose template sets `enforce`. Question P7: proxy with hairpin NAT: `warn` required, VPN untested (see [P7](../mumble-interfaces.md#5-checkpoints-of-the-feasibility-studies)). Reject reasons: `unknown-session`, `hash-mismatch`, `address-mismatch`, `no-certificate` (`protocol/src/index.ts`).
- The configuration key for opening the browser is `autoOpen` in `plugin.json`; the pairing is stored per service in `pairedWith` (ADR-0010).
- The service can optionally run in preview mode (`PREVIEW=true`): then an unpaired web UI sees the building read-only. See [operations](../operations.md).
- Further browsers, profiles and web apps can pair at any time with a code that the service writes to the Mumble log ([ADR-0012](0012-pairing-with-a-code.md)).
- Paired browsers ("keys") can be seen and revoked: one's own by everyone under "My keys" in the user menu, everyone else's by admins in the building maintenance (ADR-0016) ([ADR-0015](0015-key-cabinet.md)). A token also stores a coarse device label and when it was last used.
- (2026-10-03) The residual risk above no longer holds as written: a device token now reaches boards, care and settings. [ADR-0017](0017-threat-model-after-board-and-care.md) re-assesses it: a connected plugin cannot be replaced from another address (reject reason `already-connected`), new keys are announced in the owner's Mumble log, browser origins are refused at `/ws/plugin` and foreign origins at `/ws/ui` and changing requests, and `TRUST_PROXY` takes the proxy's address.
- (2026-10-03) Point 5 ("only in the internal network or VPN") no longer holds: instances may be reachable from the internet, secured by their operator ([ADR-0008](0008-operations.md), current state).
