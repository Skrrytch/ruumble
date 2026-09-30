# HTTPS behind a reverse proxy

[← Setting up Ruumble](../operations.md)

Ruumble works over plain HTTP; HTTPS is optional. With HTTPS:

- the web UI can be installed as an app, and the browser's clipboard works (without it, copying uses a fallback),
- device tokens and board content no longer travel through the network in plain text.

Nothing changes in the plugin or the service: the plugin turns an `https://` address into `wss://` and checks the certificate against the **system certificates** (on Windows the certificate store, including CAs rolled out by group policy); the web UI uses `wss://` when it was loaded over HTTPS.

## Certificate

Let's Encrypt with a **DNS challenge** is the simplest choice. It works even though Ruumble is only reachable in your network; it needs a domain whose DNS provider offers an API (Nginx Proxy Manager supports many).

An internal CA also works, but its certificate must then be trusted twice on every client: in the browser (Firefox has its own store) and in the system (`update-ca-certificates` or similar), because the plugin uses the system certificates.

## Steps

Example: Nginx Proxy Manager, address `ruumble.example.com`.

1. **DNS:** `ruumble.example.com` points to the proxy, e.g. via a local DNS entry or a public record with the private IP.
2. **Proxy host:** forward to `ruumble:64080`. The Ruumble container must be in a network the proxy can reach: add the proxy's network to `networks` of the Ruumble service. Enable **Websockets Support** (otherwise `/ws/*` fails), request the certificate with a DNS challenge and enable **Force SSL**. Board uploads go up to 10 MB: if they fail with `413`, add `client_max_body_size 20m;` in the proxy host's Advanced tab.
3. **Ruumble:** set `TRUST_PROXY: "true"` and `ADDRESS_CHECK: warn` (the commented lines in [`ruumble.docker-compose.yml`](../../deploy/compose/ruumble.docker-compose.yml)). Pairing links then use `https` from the proxy's `X-Forwarded-Proto` header; Nginx Proxy Manager sends it. With a proxy that does not, also set `PUBLIC_URL: https://ruumble.example.com`. Remove the port binding `64080:64080`, unless plain HTTP should stay available (see below).
4. **Root channel description:** change the line to `ruumble: https://ruumble.example.com`, and the link in the Mumble welcome message, if you have one. Users who set a fixed `bridgeUrl` in their `plugin.json` change it too.
5. **Pair again:** browsers are paired per address, so every browser pairs once more: on the "not paired" page with **Pair this browser** and the code from the Mumble log.
6. **Check:** `curl https://ruumble.example.com/healthz`, then open the web UI; the browser's developer tools show the WebSocket as `wss://…/ws/ui`.

<details>
<summary>Why <code>ADDRESS_CHECK: warn</code> behind a proxy?</summary>

Ruumble compares the network address of the plugin with the address Mumble sees for that user, so that nobody can pose as someone else from another computer. Behind the proxy, Ruumble takes the client address from `X-Forwarded-For`. `enforce` only works if the proxy sees the same client address as Mumble; with hairpin NAT (the proxy is reached through the router's public address) they never match. Check the log for `Plugin address does not match Mumble's` before switching to `enforce`.
</details>

## HTTP and HTTPS side by side

Possible, e.g. HTTPS for everyday use and `http://192.168.1.10:64080` for testing: keep the port binding for that. The plugins connect to the address in the root channel description (a single client can use `bridgeUrl` instead), pairing links use the address the plugin connected to (or `PUBLIC_URL`, if set), and a browser pairs separately for each address.

Idle WebSocket connections stay open behind the proxy: Ruumble sends a ping every 30 s (nginx closes connections after 60 s without traffic by default).
