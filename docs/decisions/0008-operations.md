# ADR-0008: Operations

Status: accepted for Docker, proposed for the rest (2026-09-28)

## Decision
0. **The deployment target is the project owner's home server.** The Mumble server already runs there with Docker. Ruumble is added to the same setup as further services. Development and testing happen locally (S1: throwaway containers).
1. **Docker Compose** with three containers in the same network:
   - `mumble`: the official image, unchanged, in the version from `third_party/mumble/VERSION`, i.e. `mumblevoip/mumble-server:v1.6.870` and **not** `latest`. Ice is enabled with `MUMBLE_CONFIG_ICE: '"tcp -h 0.0.0.0 -p 6502"'`; the secrets come as Docker secrets `/run/secrets/MUMBLE_CONFIG_ICESECRETREAD` and `…WRITE` (S1). Ice listens only in the internal Compose network; port 6502 is **not** published.
   - `ruumble`: the service. It also serves the built web UI.
   - `proxy`: on the home server this is the existing **Nginx Proxy Manager** (instead of Caddy, finding from 2026-09-28). It handles HTTPS (required for a PWA) and forwards `/` and `/ws/*` (enable WebSocket support) to `ruumble:64080`.
2. **Secrets:** `icesecretread` and `icesecretwrite` get different random values and are kept in an `.env` file outside the repository. `ruumble` receives only the read secret.
3. **Reachability:** the service is reachable only in the internal network or VPN, not from the internet (ADR-0004).
4. **Plugin distribution:** the bundle `ruumble-<version>.mumble_plugin` (Linux x64) is built in the image on Debian 12 (glibc 2.36, so it also runs on older distributions) and offered by the service under `/download`. The web UI shows the download link and a short guide on its help pages: install, then **enable** under Settings → Plugins.
5. **Plugin configuration:** the service address comes from the root channel description (ADR-0010) and can be overridden in `~/.config/ruumble/plugin.json` (`bridgeUrl`).
6. **Health:** `GET /healthz` reports whether Ice is reachable, when the last successful poll happened and how many plugins are connected.

## Open points
- Domain and certificate (internal CA or Let's Encrypt via DNS challenge) are not yet decided, see question O10.
  Current state: the home server uses its own domain with a Let's Encrypt certificate from Nginx Proxy Manager (2026-09-29).
- The existing Mumble configuration on the home server (version, Ice, secrets, network) is reviewed before the deployment work package, read-only and after consultation.

## Current state (code and `deploy/`)
- The compose templates in `deploy/compose/` are split into `mumble.docker-compose.yml` and `ruumble.docker-compose.yml`. The Mumble template uses `mumblevoip/mumble-server:v1.5.735` (the version on the home server); the interface files in `third_party/mumble/` stay at v1.6.870. The local test setup (`deploy/local/`) uses v1.6.870.
- The Ice read secret reaches the service as a Docker secret (`ICE_SECRET_READ_FILE=/run/secrets/ice_read`).
- In the template the service is bound directly to the LAN address (`<LAN-IP>:64080`) over HTTP; HTTPS behind a reverse proxy is prepared as commented lines and described in [operations](../operations.md#https-behind-a-reverse-proxy-optional). On the home server this is in operation since 2026-09-29 (O10).
- `/healthz` also reports the Mumble server version (`mumbleServer`), the connected clients per Mumble and plugin version (`clients`), the last error and the board fill level (`board.usedMB`, `board.quotaMB`). It answers 503 if the last successful poll is older than 10 s.
- All environment variables are listed in [operations](../operations.md).
- Distribution (2026-09-30): releases publish the image as `ghcr.io/skrrytch/ruumble` for linux/amd64 and linux/arm64 and attach the plugin bundle (Linux and Windows since ADR-0013) to a GitHub release (`.github/workflows/release.yml`, [development](../development.md#releasing)). The Compose template uses the published image; building it locally still works.
