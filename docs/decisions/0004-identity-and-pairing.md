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
   - After the first successful `hello` without an existing pairing, the plugin receives a **one-time link** (valid for 60 s) and opens it with `xdg-open`.
   - The web UI exchanges the link for a long-lived **device token** (HttpOnly cookie) bound to the hash.
   - The plugin remembers in `~/.config/ruumble/plugin.json` that pairing has happened and no longer opens the browser automatically afterwards. This can be changed in the configuration.
4. **Access:** a web UI only gets data if its token is valid **and** a plugin with the same hash is currently connected. Otherwise it shows "Mumble is not connected".
5. The service is reachable **only in the internal network or VPN** (ADR-0008).

## Consequences
- Mumble shows no side effects, and users do not need to configure anything.
- **Residual risk (accepted):** someone in the internal network with the same IP who knows the public data of another session can impersonate that session. They then see the occupancy, which they can see as a Mumble user anyway.
- Device tokens can be revoked: they are deleted on logout in the web UI or by the admin.

Current state (code):
- The IP check is configurable with `ADDRESS_CHECK` = `off` / `warn` / `enforce`, default `warn` (only logs a mismatch). The home network compose template sets `enforce`. Question P7: Behind the reverse proxy on the home server (2026-09-29), browser and plugin reach the service through the router's public address (hairpin NAT, `TRUST_PROXY=true`), while Mumble sees the LAN address of the client. The addresses never match, so `enforce` rejects every plugin there and `warn` is required. VPN not tested. Reject reasons: `unknown-session`, `hash-mismatch`, `address-mismatch`, `no-certificate` (`protocol/src/index.ts`).
- The configuration key for opening the browser is `autoOpen` in `plugin.json`; the pairing is stored per service in `pairedWith` (ADR-0010).
- The service can optionally run in preview mode (`PREVIEW=true`): then an unpaired web UI sees the building read-only. See [operations](../operations.md).
- Further browsers, profiles and web apps can pair at any time with a code that the service writes to the Mumble log ([ADR-0012](0012-pairing-with-a-code.md)).
