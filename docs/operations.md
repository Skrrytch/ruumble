# Operations guide: running Ruumble next to a Mumble server

Ruumble consists of a **service** (Docker container, which also serves the web UI) and a **plugin** for the users' Mumble clients. The service reads the Mumble server through its Ice interface, **read-only**; Mumble itself stays unchanged.

```
Browser ──http(s)──▶ Ruumble service ──Ice (read-only)──▶ Mumble server
                          ▲
                          │ WebSocket (outgoing)
                     Ruumble plugin in the Mumble client
```

Placeholders in this guide: `<LAN-IP>` (address of the server), `<compose-dir>` (where the Compose files live, for example one folder `mumble/` and one `ruumble/`), `<backup-dir>` (backups).

## Requirements

| | Requirement |
|---|---|
| Mumble server | **1.5 or newer** (up to 1.4 the Ice interface was called `Murmur`; Ruumble speaks `MumbleServer`). Ice must be enabled. |
| Users' Mumble client | 1.4 or newer, **Linux** (the plugin exists only as `.so`) |
| Service | Docker; the container needs network access to the Mumble server's Ice port |
| Network | The users' clients must reach the service (plugin and browser) |

**Tested with:**

| Component | Versions |
|---|---|
| Mumble server | 1.5.735, 1.6.870 (official image `mumblevoip/mumble-server`) |
| Mumble client | 1.4.287 (Fedora), 1.5.517 (Ubuntu 24.04), 1.5.735 (Debian 13) |

Known limitation: from Mumble server 1.6 on, Ice does not deliver avatar images of registered users (a bug in Mumble); Ruumble then shows initials.

## 1. Prepare the Mumble server

Ruumble needs Ice with **two different secrets**. The service gets only the **read secret**; the write secret stays with the operator (for example for one-time setup).

### With Docker (official image)

Template: [`deploy/compose/mumble.docker-compose.yml`](../deploy/compose/mumble.docker-compose.yml)

1. **Back up:** `docker cp mumble-server:/data/. <backup-dir>/mumble-data/` and copy the existing Compose file.
2. **Named volume:** if the data lives in an anonymous volume, `docker compose down` discards it. The template uses the named volume `mumble-data` (copy the data into it first).
3. **Ice:** `MUMBLE_CONFIG_ICE: '"tcp -h 0.0.0.0 -p 6502"'`. Port 6502 is **not** published; Ruumble reaches it through the shared Docker network `mumble-network`.
4. **Secrets:** two different random values in `secrets/ice_read` and `secrets/ice_write` (mode 600), mounted as Docker secrets `MUMBLE_CONFIG_ICESECRETREAD` and `MUMBLE_CONFIG_ICESECRETWRITE`.
5. **SuperUser password** (optional): Docker secret `MUMBLE_SUPERUSER_PASSWORD` in `secrets/superuser_password`.
6. **Welcome message with a link to Ruumble** (optional, recommended): `MUMBLE_CONFIG_WELCOMETEXT`. Plugins cannot show links in Mumble, but the server's welcome message can. Put the whole value in double quotes (otherwise a comma splits it), the link in single quotes, and non-ASCII characters as HTML entities.

The additional external network `homeserver-network` in the template is only an example for an existing reverse proxy and can be dropped.

### Without Docker (distribution package)

In `mumble-server.ini` (or `murmur.ini`):

```ini
ice="tcp -h 127.0.0.1 -p 6502"
icesecretread=<random-value-1>
icesecretwrite=<random-value-2>
```

Then restart the server. If the Ruumble container runs on the same machine, set `-h` to an address the container can reach (for example the Docker bridge) and restrict the port to that path with a firewall.

## 2. Set up the service

Template: [`deploy/compose/ruumble.docker-compose.yml`](../deploy/compose/ruumble.docker-compose.yml)

1. **Build the image** (in the repository) and copy it to the server:
   ```sh
   docker build -f deploy/Dockerfile -t ruumble:<version> .
   docker save ruumble:<version> | gzip | ssh <server> 'gunzip | docker load'
   ```
2. **Adjust the Compose file** (image tag, `PUBLIC_URL`, port binding to `<LAN-IP>`) and start it: `docker compose up -d`.
3. **Check:** `curl http://<LAN-IP>:64080/healthz` → `{"ice":"ok",…}`. The response also shows the Mumble server version (`mumbleServer`) and the connected clients per Mumble and plugin version (`clients`, for example `{"mumble 1.5.735 / plugin 0.4.0": 2}`; reported by plugin 0.4 or newer).

If the Mumble server is older than 1.5, the service stops with: `No MumbleServer Meta object at … Ruumble needs Mumble server 1.5 or later (up to 1.4 the Ice interface was called "Murmur").`

The image contains the plugin (built on Debian 12, glibc 2.36, so it also runs on older distributions). Users download it at `http://<LAN-IP>:64080/download`.

### Environment variables

| Variable | Default | Meaning |
|---|---|---|
| `ICE_HOST` | – (required) | Host of the Mumble server |
| `ICE_PORT` | `6502` | Ice port |
| `ICE_SECRET_READ` / `ICE_SECRET_READ_FILE` | – (required) | Read secret, directly or as a file (Docker secret). **Never the write secret.** |
| `SERVER_ID` | first running | Server ID, if the Mumble process runs several virtual servers |
| `PUBLIC_URL` | `http://localhost:64080` | Address where users reach Ruumble (used for pairing links) |
| `PORT`, `HOST` | `64080`, `0.0.0.0` | HTTP and WebSocket |
| `DATA_DIR` | `./data` (`/data` in the image) | Device tokens and board |
| `ADDRESS_CHECK` | `warn` | `off` / `warn` / `enforce`: compare the IP addresses of the plugin and the Mumble connection (ADR-0004). Use `enforce` on a home network; check first when running over VPN or a proxy. |
| `TRUST_PROXY` | `false` | `true` behind a reverse proxy: client addresses come from `X-Forwarded-For` ([HTTPS](#https-behind-a-reverse-proxy-optional)) |
| `PREVIEW` | `false` | `true`: show the building read-only without pairing |
| `RETENTION_DAYS` | `30` | Retention of board posts |
| `BOARD_QUOTA_MB` | `2048` | Storage for attachments; when full, the oldest posts with attachments are deleted |
| `LOG_LEVEL` | `info` | Log level |
| `WEB_DIST`, `PLUGIN_BUNDLE`, `PLUGIN_BUNDLE_DIR` | set in the image | Paths to the web UI and the plugin file |

### HTTPS behind a reverse proxy (optional)

Ruumble works over plain HTTP; HTTPS is optional. With HTTPS the browser offers the Clipboard API, the web UI can be fully installed as a PWA, and device tokens and board content no longer travel over the network in plain text. Nothing changes in the plugin or the service code: the plugin turns an `https://` address into `wss://` and checks the certificate against the **system certificates**, and the web UI uses `wss://` when it was loaded over HTTPS.

**Certificate:** Let's Encrypt with a **DNS challenge** is the simplest choice. It works even though the service is only reachable in the home network; it needs a domain whose DNS provider offers an API (Nginx Proxy Manager supports many). An internal CA also works, but its certificate must then be trusted on every client twice: in the browser (Firefox has its own store) and in the system (`update-ca-certificates` or similar), because the plugin uses the system certificates.

**Steps** (example: Nginx Proxy Manager, address `ruumble.example.com`):

1. **DNS:** `ruumble.example.com` points to the address of the proxy, e.g. via a local DNS entry or a public record with the private IP.
2. **Proxy host:** forward to `ruumble:64080` (the container must be in a network the proxy can reach, e.g. `homeserver-network` in the template), enable **Websockets Support** (otherwise `/ws/*` fails), request the certificate with a DNS challenge and enable **Force SSL**. Uploads to the board go up to 10 MB: if they fail with `413`, add `client_max_body_size 20m;` in the proxy host's Advanced tab.
3. **Service:** set `PUBLIC_URL: https://ruumble.example.com` and `TRUST_PROXY: "true"` (see the commented lines in the template). Remove the port binding to `<LAN-IP>:64080` so that the unencrypted path is closed, unless you want to keep it (see below).
4. **Address check:** behind the proxy the service takes the client address from `X-Forwarded-For` and compares it with the address Mumble sees (ADR-0004). Start with `ADDRESS_CHECK: warn` and watch the log for `Plugin address does not match Mumble's`; switch back to `enforce` once there are no mismatches.
5. **Root channel description:** change the line to `ruumble: https://ruumble.example.com` (section 3). Users who set a fixed `bridgeUrl` in `~/.config/ruumble/plugin.json` change it too. Change the link in the Mumble welcome message (`MUMBLE_CONFIG_WELCOMETEXT`) as well; it is plain Mumble config and takes effect after restarting the Mumble container.
6. **Pair again:** the device cookie belongs to the old address, so every browser pairs once more. From now on the cookie is sent only over HTTPS (`Secure`).
7. **Check:** `curl https://ruumble.example.com/healthz`, then open the web UI; the browser's developer tools show the WebSocket as `wss://…/ws/ui`.

Idle WebSocket connections stay open behind the proxy: the service sends a ping every 30 s (nginx closes connections after 60 s without traffic by default) and closes connections that no longer answer.

**HTTP and HTTPS side by side** is possible, e.g. HTTPS for everyday use and `http://<LAN-IP>:64080` for development. Keep the port binding for that. The plugins connect to whatever address the root channel description names (a single client can use `bridgeUrl` instead); pairing links always use `PUBLIC_URL`, and a browser has to pair separately for each address.

## 3. Publish the address for the plugin

There is **one** plugin for all servers (ADR-0010). It reads the service's address from the **root channel description**, from a line of its own that ends with `ruumble: <address>`:

```
A few important settings for Ruumble:

- ruumble: http://<LAN-IP>:64080
```

Keep the description **under 128 characters**, measured on the stored HTML; then all clients receive it immediately. With a longer description, every user has to hover the mouse over the top channel once (the plugin says so). Mumble's editor adds a lot of formatting; three lines easily become 400 characters. It stays short if you set it once via Ice with the write secret, in a short-lived helper container, not through Ruumble.

The order of floors and rooms comes from the channels' **Position** field (in Mumble: edit channel → Position; lower numbers first, ties sorted alphabetically). The first top-level channel is the ground floor.

## 4. Board

- **Storage:** in the volume `ruumble-data`: `/data/board.sqlite` (SQLite, WAL) and attachments under `/data/board/<xx>/<sha256>`. Identical files are stored only once.
- **Limits** (ADR-0011): files up to 10 MB, retention `RETENTION_DAYS`, storage `BOARD_QUOTA_MB`. Posts of deleted channels are kept for 7 days. Cleanup runs hourly.
- **Usage:** `/healthz` → `"board":{"usedMB":…,"quotaMB":…}`
- **Notice in Mumble** when something is pinned requires plugin 0.3.0 or newer; older plugins ignore it.

## 5. Back up, update, roll back

**Back up the board while running** (SQLite backup API, then the attachments):

```sh
docker exec ruumble node dist/main.mjs backup /data/backup
docker cp ruumble:/data/backup <backup-dir>/board-$(date +%Y%m%d)
docker exec ruumble rm -rf /data/backup
```

**Update:** back up the whole volume first, then change the image tag in the Compose file and run `docker compose up -d`:

```sh
docker run --rm -v ruumble-data:/d -v <backup-dir>:/b alpine tar czf /b/ruumble-data-$(date +%Y%m%d-%H%M%S).tgz -C /d .
```

> **Updating from 0.7 to 0.8: the port changes from 8080 to 64080.** Change the port binding (`<LAN-IP>:64080:64080`) and `PUBLIC_URL` in the Compose file, the `ruumble:` line in the root channel description (section 3), the link in the welcome message and, behind a reverse proxy, its forward target (`ruumble:64080`). Browsers that used the old address pair once more; users with a fixed `bridgeUrl` in `plugin.json` change it too. To keep the old address instead, set `PORT: 8080` in the Compose file.

> **Caution: upgrading the Mumble server from 1.5 to 1.6.** Back up the Mumble data first (`docker cp mumble-server:/data/. <backup-dir>/mumble-data/`). The database migration of Mumble 1.6.870 fails if `channel_info` contains NULL values, with an error like `Failed at migrating table channel_properties from schema version 9 to 11 … NOT NULL constraint failed`. Check before upgrading; the result must be `0`:
>
> ```sh
> sqlite3 mumble-server.sqlite "select count(*) from channel_info where value is null"
> ```

**Remove Ruumble:**

```sh
cd <compose-dir>/ruumble && docker compose down
```

Mumble keeps running unchanged. If you changed Mumble for Ruumble, you can restore the backed-up Compose file; if the data used to live in an anonymous volume, mount that volume as `/data` again (`volumes: { <volume>: { external: true } }`).

## Notes

- **Copying without HTTPS:** over `http://<LAN-IP>` the browser offers no Clipboard API; the web UI then copies through a fallback ([HTTPS](#https-behind-a-reverse-proxy-optional)).
- **License:** the service uses Ice for JavaScript (GPL-2.0). A distributed image is, as a whole, GPL-2.0 (ADR-0006).
