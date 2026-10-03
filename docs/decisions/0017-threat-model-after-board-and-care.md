# ADR-0017: Threat model after the board, care and keys

Status: proposed (2026-10-03)

## Context
- ADR-0004 accepted that a plugin's identity can be forged: the certificate hash is public, session IDs are small integers, and the address check is often only `warn` (behind a proxy with hairpin NAT it cannot be `enforce`, P7). The damage was limited, as a forger "only sees the occupancy".
- Since then a device token can do far more: read and write boards (ADR-0011), and for someone with Mumble's Write permission clear and export boards, change the building's settings and revoke other people's keys (ADR-0014, -0015, -0016).
- An architecture review on 2026-10-03 found these ways to get or use someone else's identity:
  1. A forged `hello` for a user who is online replaced their plugin (`close 4001`) and, with `paired: false`, received a pairing link for that user.
  2. Any web page could open `/ws/plugin` from the victim's own browser. That connection has the victim's address, so it passed even `ADDRESS_CHECK=enforce`, and the page read the pairing link from the socket.
  3. No Origin check: another page in the same browser (any port on the LAN address, or a sibling subdomain behind the same proxy) could use the cookie for `/ws/ui` and for changing requests.
  4. `TRUST_PROXY=true` trusts `X-Forwarded-For` from every sender. With the port also published next to the proxy, a client could choose its own address and defeat the address check and the address matching of pairing codes (ADR-0012).

## Decision
| Topic | Decision |
|---|---|
| **No takeover** | A plugin of a user who is already connected is replaced only by a `hello` from the same address (Mumble restarted) or from the address Mumble sees for that user. Any other is rejected with `already-connected` (close 4409) and the plugin retries; once the first connection is gone (keepalive, at most about a minute) it is accepted. So a forger can neither take over a connected identity nor lock out the real plugin. |
| **New keys are announced** | When a browser is paired, the owner's connected plugin writes a notice to the Mumble log ("A browser was paired with your Mumble certificate (Firefox on Linux). If that was not you, revoke the key …"). Each key remembers which plugin addresses were told (at most 5). For 30 days, a plugin of the same user connecting from an address that was not told yet gets the notice too, with the date. A forger who received the first notice thus cannot hide the key from the real user, unless both share one address. |
| **Origin** | A browser origin (`http(s)://`) at `/ws/plugin` is turned away; IXWebSocket sends `ws(s)://<service>`. `/ws/ui` and every POST/PUT/DELETE must come from the service's own host (the request's `Host`, or `X-Forwarded-Host` behind a trusted proxy) or the host of `PUBLIC_URL`; otherwise 403. Requests without `Origin` pass (no browser sends a changing request without it). One `onRequest` hook (`bridge/src/origin.ts`) does this before any route or WebSocket upgrade. |
| **Trusted proxy** | `TRUST_PROXY` takes the proxy's addresses or CIDR ranges (comma-separated); only from there do `X-Forwarded-*` headers count. `true` still works for existing setups but logs a warning; it is only right when nothing else can reach the port. |

## Rejected options
- **Challenge through positional data or the comment** (ADR-0004): would prove control of the client, but needs a plugin change, has visible side effects and does not help users without positional audio. Reconsider if the residual risk below becomes real.
- **Admin actions only with `ADDRESS_CHECK=enforce`**: the home server needs `warn` (hairpin NAT), so admins there would lose care and maintenance.
- **Reject every second plugin of a user**: would lock out the real user whenever a forger connected first.

## Consequences
- **Residual risk:** someone at the same address as the victim (same NAT, same VPN exit) who knows the session and certificate hash can still pair a browser while the victim's plugin is not connected. The victim is told when their plugin connects next from another address, or at once if it is connected; "My keys" shows every key, and admins see all keys in the building maintenance.
- A user who changes networks (laptop from Wi-Fi to VPN) may see "rejected by the service (already-connected)" in the Mumble log for up to a minute.
- A proxy that rewrites `Host` and does not send `X-Forwarded-Host` needs `PUBLIC_URL`, or the web UI's changing requests are refused.
- New reject reason `already-connected` in `protocol/src/index.ts`; the plugin shows any reason as text, so it needs no change.
