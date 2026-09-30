# Operations guide: running Ruumble next to a Mumble server

Ruumble has two parts: a **service** (one Docker container, which also serves the web UI) that runs next to your Mumble server, and a **plugin** that users install in their Mumble client. This guide is about the service. The service reads the Mumble server through its Ice interface, **read-only**; Mumble itself stays unchanged.

```
Browser ──http(s)──▶ Ruumble service ──Ice (read-only)──▶ Mumble server
                          ▲
                          │ WebSocket (outgoing)
                     Ruumble plugin in the Mumble client
```

The [quick setup](#quick-setup) gets Ruumble running on a LAN in four steps; everything after it is optional.

## Requirements

| | Requirement |
|---|---|
| Mumble server | **1.5 or newer** with Ice (up to 1.4 the Ice interface was called `Murmur`; Ruumble speaks `MumbleServer`). The quick setup assumes the official Docker image `mumblevoip/mumble-server`; [without Docker](#mumble-without-docker) works too. |
| Service | Docker with Compose, on the same machine as the Mumble container (or with network access to its Ice port) |
| Network | The users' computers must reach the service (browser and plugin) |
| Users' Mumble client | 1.4 or newer, **Linux** (x86_64) or **Windows** (x64) |

**Tested with:** Mumble server 1.5.735 and 1.6.870 (official image); Mumble client 1.4.287 (Fedora), 1.5.517 (Ubuntu 24.04), 1.5.735 (Debian 13).

Known limitation: from Mumble server 1.6 on, Ice does not deliver avatar images of registered users (a bug in Mumble); Ruumble then shows initials.

## Quick setup

Below, `<LAN-IP>` is the address of your server in the local network, e.g. `192.168.1.10`.

> **Setting up a new Mumble server?** Then steps 1 and 2 are three commands. In an empty folder:
>
> ```sh
> curl -fsSLO https://raw.githubusercontent.com/Skrrytch/ruumble/main/deploy/compose/mumble-with-ruumble.docker-compose.yml
> curl -fsSLO https://raw.githubusercontent.com/Skrrytch/ruumble/main/deploy/compose/setup.sh
> sh setup.sh && docker compose up -d
> ```
>
> `setup.sh` creates the two Ice secrets and prints the line for step 3; the Compose file starts the Mumble server and Ruumble together and needs no edits. Then continue with [step 3](#3-tell-the-plugins-where-ruumble-is).
>
> The steps below add Ruumble to an **existing** Mumble container.

> **If your Mumble container is already in use,** back up its data first: `docker cp mumble-server:/data/. <backup-dir>/mumble-data/`. If the data lives in an anonymous volume, `docker compose down` discards it, so move it into a named volume first (the template uses `mumble-data`).

### 1. Enable Ice in Mumble

Ice needs **two different secrets**: Ruumble only ever gets the read secret, the write secret stays with you. Create both next to Mumble's Compose file:

```sh
mkdir -p secrets && chmod 700 secrets
openssl rand -hex 24 > secrets/ice_read
openssl rand -hex 24 > secrets/ice_write
chmod 644 secrets/*    # readable for the containers; the folder keeps other users out
```

Add this to the Mumble service in its Compose file (complete template: [`deploy/compose/mumble.docker-compose.yml`](../deploy/compose/mumble.docker-compose.yml)):

```yaml
services:
  mumble-server:
    # … your existing settings …
    environment:
      MUMBLE_CONFIG_ICE: '"tcp -h 0.0.0.0 -p 6502"'
    secrets:
      - { source: ice_read, target: MUMBLE_CONFIG_ICESECRETREAD }
      - { source: ice_write, target: MUMBLE_CONFIG_ICESECRETWRITE }
    networks: [mumble-network]

secrets:
  ice_read: { file: ./secrets/ice_read }
  ice_write: { file: ./secrets/ice_write }

networks:
  mumble-network: { name: mumble-network }
```

Do **not** publish port 6502: Ruumble reaches Ice through the shared Docker network `mumble-network`. Restart Mumble with `docker compose up -d`.

### 2. Start Ruumble

In a folder next to Mumble's (e.g. `ruumble/` beside `mumble/`), save this as `docker-compose.yml`. A commented version with the HTTPS options is [`deploy/compose/ruumble.docker-compose.yml`](../deploy/compose/ruumble.docker-compose.yml), also attached to every [release](https://github.com/Skrrytch/ruumble/releases/latest).

```yaml
services:
  ruumble:
    image: ghcr.io/skrrytch/ruumble:0.15.0
    container_name: ruumble
    restart: unless-stopped
    environment:
      ICE_HOST: mumble-server                    # name of the Mumble container
      ICE_SECRET_READ_FILE: /run/secrets/ice_read
      ADDRESS_CHECK: enforce
    secrets: [ice_read]
    volumes: [ruumble-data:/data]
    networks: [mumble-network]
    ports: ["64080:64080"]

secrets:
  ice_read: { file: ../mumble/secrets/ice_read } # the read secret from step 1

volumes:
  ruumble-data: { name: ruumble-data }

networks:
  mumble-network: { external: true }
```

Start it with `docker compose up -d`. The image is available for linux/amd64 and linux/arm64.

Ruumble belongs in a LAN or VPN, not on the internet (see [SECURITY.md](../SECURITY.md)). On a server with a public address, bind the port to the LAN or VPN address instead: `ports: ["192.168.1.10:64080:64080"]`.

### 3. Tell the plugins where Ruumble is

The plugin finds the service through the description of the **root channel**. In Mumble, edit the top channel and add a line of its own:

```
ruumble: http://<LAN-IP>:64080
```

Keep the whole description **under 128 characters** (measured on the stored HTML), otherwise clients only receive it after hovering over the top channel once; see [Root channel description](#root-channel-description).

### 4. Check and invite users

```sh
curl http://<LAN-IP>:64080/healthz      # → {"ice":"ok",…}
```

Then send users to `http://<LAN-IP>:64080`: the page offers the plugin download (`/download`), and the [user guide](user-guide.md) explains the rest.

If it does not work, see [Troubleshooting](#troubleshooting).

## Optional

### HTTPS behind a reverse proxy (optional)

Ruumble works over plain HTTP; HTTPS is optional. With HTTPS the browser offers the Clipboard API, the web UI can be fully installed as a PWA, and device tokens and board content no longer travel over the network in plain text. Nothing changes in the plugin or the service code: the plugin turns an `https://` address into `wss://` and checks the certificate against the **system certificates** (on Windows the certificate store, including CAs rolled out via group policy), and the web UI uses `wss://` when it was loaded over HTTPS.

**Certificate:** Let's Encrypt with a **DNS challenge** is the simplest choice. It works even though the service is only reachable in the home network; it needs a domain whose DNS provider offers an API (Nginx Proxy Manager supports many). An internal CA also works, but its certificate must then be trusted on every client twice: in the browser (Firefox has its own store) and in the system (`update-ca-certificates` or similar), because the plugin uses the system certificates.

**Steps** (example: Nginx Proxy Manager, address `ruumble.example.com`):

1. **DNS:** `ruumble.example.com` points to the address of the proxy, e.g. via a local DNS entry or a public record with the private IP.
2. **Proxy host:** forward to `ruumble:64080` (the container must be in a network the proxy can reach; add the proxy's network to `networks` of the Ruumble service), enable **Websockets Support** (otherwise `/ws/*` fails), request the certificate with a DNS challenge and enable **Force SSL**. Uploads to the board go up to 10 MB: if they fail with `413`, add `client_max_body_size 20m;` in the proxy host's Advanced tab.
3. **Service:** set `ADDRESS_CHECK: warn` and `TRUST_PROXY: "true"` (see the commented lines in the template). The service then builds pairing links from the proxy's `X-Forwarded-Proto` and the host name the plugin used (Nginx Proxy Manager sends both); with another proxy that does not, also set `PUBLIC_URL: https://ruumble.example.com`. Remove the port binding (`64080:64080`) so that the unencrypted path is closed, unless you want to keep it (see below).
4. **Address check:** behind the proxy the service takes the client address from `X-Forwarded-For` and compares it with the address Mumble sees (ADR-0004). Keep `ADDRESS_CHECK: warn`. `enforce` only works if the proxy sees the same client address as Mumble (no hairpin NAT, P7); check the log for `Plugin address does not match Mumble's` first.
5. **Root channel description:** change the line to `ruumble: https://ruumble.example.com`. Users who set a fixed `bridgeUrl` in `plugin.json` change it too. Change the link in the Mumble welcome message as well, if you have one.
6. **Pair again:** the device cookie belongs to the old address, so every browser pairs once more: on the "not paired" page with **Pair this browser** and the code from the Mumble log (ADR-0012). From now on the cookie is sent only over HTTPS (`Secure`).
7. **Check:** `curl https://ruumble.example.com/healthz`, then open the web UI; the browser's developer tools show the WebSocket as `wss://…/ws/ui`.

Idle WebSocket connections stay open behind the proxy: the service sends a ping every 30 s (nginx closes connections after 60 s without traffic by default) and closes connections that no longer answer.

**HTTP and HTTPS side by side** is possible, e.g. HTTPS for everyday use and `http://<LAN-IP>:64080` for development. Keep the port binding for that. The plugins connect to whatever address the root channel description names (a single client can use `bridgeUrl` instead); pairing links use the address the plugin connected to (or `PUBLIC_URL`, if set), and a browser has to pair separately for each address.

### Welcome message with a link

Plugins cannot show links in Mumble, but the server's welcome message can. In Mumble's Compose file:

```yaml
      MUMBLE_CONFIG_WELCOMETEXT: >-
        "Welcome! <a href='http://<LAN-IP>:64080'><b>Open the building (Ruumble)</b></a>"
```

Put the whole value in double quotes (otherwise a comma splits it), the link in single quotes, and non-ASCII characters as HTML entities. It takes effect after restarting the Mumble container.

### SuperUser password as a secret

In the template, the SuperUser password comes from the Docker secret `MUMBLE_SUPERUSER_PASSWORD` (file `secrets/superuser_password`). This is unrelated to Ruumble.

### Mumble without Docker

In `mumble-server.ini` (or `murmur.ini`):

```ini
ice="tcp -h 127.0.0.1 -p 6502"
icesecretread=<random-value-1>
icesecretwrite=<random-value-2>
```

Then restart the server. Set `ICE_HOST` in Ruumble's Compose file to the host's address and drop the `mumble-network` lines. If the Ruumble container runs on the same machine, set `-h` to an address the container can reach (for example the Docker bridge) and restrict the port to that path with a firewall.

### Floors and rooms

The order of floors and rooms comes from the channels' **Position** field (in Mumble: edit channel → Position; lower numbers first, ties sorted alphabetically). The first top-level channel is the ground floor.

### Board

- **Storage:** in the volume `ruumble-data`: `/data/board.sqlite` (SQLite, WAL) and attachments under `/data/board/<xx>/<sha256>`. Identical files are stored only once.
- **Limits** (ADR-0011): files up to 10 MB, retention `RETENTION_DAYS`, storage `BOARD_QUOTA_MB`. Posts of deleted channels are kept for 7 days. Cleanup runs hourly.
- **Usage:** `/healthz` → `"board":{"usedMB":…,"quotaMB":…}`
- **Notice in Mumble** when something is pinned requires plugin 0.3.0 or newer; older plugins ignore it.

### Building the image yourself

Instead of the published image, in the repository:

```sh
docker build -f deploy/Dockerfile -t ruumble:<version> .
docker save ruumble:<version> | gzip | ssh <server> 'gunzip | docker load'
```

and set `image: ruumble:<version>` in the Compose file.

## Back up, update, roll back

**Back up the board while running** (SQLite backup API, then the attachments):

```sh
docker exec ruumble node dist/main.mjs backup /data/backup
docker cp ruumble:/data/backup <backup-dir>/board-$(date +%Y%m%d)
docker exec ruumble rm -rf /data/backup
```

**Update:** back up the whole volume first, then change the image tag in the Compose file (versions: [releases](https://github.com/Skrrytch/ruumble/releases)) and run `docker compose up -d`:

```sh
docker run --rm -v ruumble-data:/d -v <backup-dir>:/b alpine tar czf /b/ruumble-data-$(date +%Y%m%d-%H%M%S).tgz -C /d .
```

Users update the plugin by downloading it again from `/download` when the release notes mention a new plugin version.

> **Updating from 0.7 to 0.8: the port changes from 8080 to 64080.** Change the port binding (`<LAN-IP>:64080:64080`) and `PUBLIC_URL` in the Compose file, the `ruumble:` line in the root channel description, the link in the welcome message and, behind a reverse proxy, its forward target (`ruumble:64080`). Browsers that used the old address pair once more; users with a fixed `bridgeUrl` in `plugin.json` change it too. To keep the old address instead, set `PORT: 8080` in the Compose file.

> **Caution: upgrading the Mumble server from 1.5 to 1.6.** Back up the Mumble data first (`docker cp mumble-server:/data/. <backup-dir>/mumble-data/`). The database migration of Mumble 1.6.870 fails if `channel_info` contains NULL values, with an error like `Failed at migrating table channel_properties from schema version 9 to 11 … NOT NULL constraint failed`. Check before upgrading; the result must be `0`:
>
> ```sh
> sqlite3 mumble-server.sqlite "select count(*) from channel_info where value is null"
> ```

**Roll back:** set the previous image tag, restore the volume backup made before the update, and start again:

```sh
docker compose down
docker run --rm -v ruumble-data:/d -v <backup-dir>:/b alpine sh -c 'rm -rf /d/* && tar xzf /b/<backup>.tgz -C /d'
```

**Remove Ruumble:**

```sh
cd <compose-dir>/ruumble && docker compose down
```

Mumble keeps running unchanged. If you changed Mumble for Ruumble, you can restore the backed-up Compose file; if the data used to live in an anonymous volume, mount that volume as `/data` again (`volumes: { <volume>: { external: true } }`).

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `/healthz` does not show `"ice":"ok"`, log: `Ice unreachable` with `ConnectionRefused` or a DNS error | Ruumble cannot reach Ice: both containers in `mumble-network`? `ICE_HOST` is the Mumble container's name? `MUMBLE_CONFIG_ICE` set and Mumble restarted? |
| Container stops: `ICE_SECRET_READ_FILE … cannot be read by uid 1000` | The secret file is not readable for the container user: `chmod 644 secrets/ice_read` (the `secrets` folder itself can stay `700`). |
| Log: `No MumbleServer Meta object at …` | The Mumble server is older than 1.5. Ruumble needs 1.5 or newer. |
| Log: `Ice unreachable` with `InvalidSecretException` | The read secret Ruumble got does not match Mumble's `MUMBLE_CONFIG_ICESECRETREAD`. Both must come from the same file; restart both containers after changing it. |
| Users see "not paired" and no pairing link opens | Plugin installed **and enabled** in Mumble? The `ruumble:` line in the root channel description correct and reachable from the user's computer? |
| Plugin says "Hover once over the top channel …" | The root channel description is longer than 128 characters, see below. |
| Log: `Plugin address does not match Mumble's` | Browser/plugin and Mumble see different client addresses (proxy, NAT). Use `ADDRESS_CHECK: warn`. |

`/healthz` also reports the Mumble server version (`mumbleServer`) and the connected clients per Mumble and plugin version (`clients`); `/api/version` returns the service and bundled plugin version.

### Root channel description

There is **one** plugin for all servers (ADR-0010). It reads the service's address from a line of its own in the root channel description that ends with `ruumble: <address>`, for example:

```
A few important settings for Ruumble:

- ruumble: http://<LAN-IP>:64080
```

Keep the description **under 128 characters**, measured on the stored HTML; then all clients receive it immediately. With a longer description, every user has to hover the mouse over the top channel once (the plugin says so). Mumble's editor adds a lot of formatting; three lines easily become 400 characters. It stays short if you set it once via Ice with the write secret, in a short-lived helper container, not through Ruumble.

## Configuration reference

All settings are environment variables of the Ruumble container.

**You always set these** (the templates do):

| Variable | Meaning |
|---|---|
| `ICE_HOST` | Host of the Mumble server; with Docker the name of the Mumble container |
| `ICE_SECRET_READ_FILE` or `ICE_SECRET_READ` | Ice read secret, as a file (Docker secret) or directly. **Never the write secret.** |

**Optional:**

| Variable | Default | Meaning |
|---|---|---|
| `PUBLIC_URL` | the address the plugin connected to | Address for the pairing links the plugin opens. Needed only if the plugins reach the service at a different address than the browsers should use, or behind a proxy that sends no `X-Forwarded-*` headers. |
| `ADDRESS_CHECK` | `warn` | `off` / `warn` / `enforce`: compare the IP addresses of the plugin and the Mumble connection (ADR-0004). The template sets `enforce` for a LAN. Behind a reverse proxy with hairpin NAT keep `warn`: the addresses never match there (P7). |
| `TRUST_PROXY` | `false` | `true` behind a reverse proxy: client addresses come from `X-Forwarded-For` ([HTTPS](#https-behind-a-reverse-proxy-optional)) |
| `ICE_PORT` | `6502` | Ice port |
| `SERVER_ID` | first running | Server ID, if the Mumble process runs several virtual servers |
| `PORT`, `HOST` | `64080`, `0.0.0.0` | HTTP and WebSocket |
| `PREVIEW` | `false` | `true`: show the building read-only without pairing |
| `RETENTION_DAYS` | `30` | Retention of board posts |
| `BOARD_QUOTA_MB` | `2048` | Storage for attachments; when full, the oldest posts with attachments are deleted |
| `LOG_LEVEL` | `info` | Log level |

**Set by the image**, normally not changed: `DATA_DIR` (`/data`, device tokens and board), `WEB_DIST`, `PLUGIN_BUNDLE`, `PLUGIN_BUNDLE_DIR` (paths to the web UI and the plugin file).

## Notes

- **Plugin in the image:** the image contains the plugin for Linux x86_64 and Windows x64 (the Linux library is built on Debian 12, glibc 2.36, so it also runs on older distributions), also on arm64 servers. Each [release](https://github.com/Skrrytch/ruumble/releases) also has it attached.
- **Copying without HTTPS:** over `http://<LAN-IP>` the browser offers no Clipboard API; the web UI then copies through a fallback ([HTTPS](#https-behind-a-reverse-proxy-optional)).
- **License:** the service uses Ice for JavaScript (GPL-2.0). A distributed image is, as a whole, GPL-2.0 (ADR-0006).
