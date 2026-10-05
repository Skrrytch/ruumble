# Setting up Ruumble

Ruumble has two parts: a small **service** (one Docker container) that runs next to your Mumble server and serves the web UI, and a **plugin** that users install in their Mumble client. This page sets up the service. It takes about 10 minutes; you need Docker with Compose and admin rights on the Mumble server.

Mumble itself stays unchanged: the service only reads the server through its Ice interface.

## Requirements

- **Mumble server 1.5 or newer.** This page assumes the official Docker image `mumblevoip/mumble-server`; for a server installed from a package see [Mumble without Docker](operations/mumble.md#mumble-without-docker).
- **Docker with Compose**, on the same machine as the Mumble server.
- The users' computers can reach the server (browser and plugin), and they use the Mumble client 1.4 or newer on **Linux** (x86_64) or **Windows** (x64).

Tested with Mumble server 1.5.735 and 1.6.870, and Mumble clients 1.4 to 1.5 on Fedora, Ubuntu, Debian and Windows.

## New Mumble server

For a fresh setup, the Mumble server and Ruumble start together from one Compose file that needs no edits. In an empty folder:

```sh
curl -fsSLO https://raw.githubusercontent.com/Skrrytch/ruumble/main/deploy/compose/mumble-with-ruumble.docker-compose.yml
curl -fsSLO https://raw.githubusercontent.com/Skrrytch/ruumble/main/deploy/compose/setup.sh
sh setup.sh && docker compose up -d
```

`setup.sh` creates the two Ice secrets and prints the line for the next step. Continue with [Tell the plugins where Ruumble is](#tell-the-plugins-where-ruumble-is).

## Existing Mumble container

If your Mumble container is already in use, back up its data first: `docker cp mumble-server:/data/. <backup-dir>/mumble-data/`. If the data lives in an anonymous volume, move it into a named volume before running `docker compose down` (see [Mumble tips](operations/mumble.md#back-up-before-you-start)).

### 1. Enable Ice in Mumble

Next to Mumble's Compose file, create two secrets:

```sh
mkdir -p secrets && chmod 700 secrets
openssl rand -hex 24 > secrets/ice_read
openssl rand -hex 24 > secrets/ice_write
chmod 644 secrets/*
```

<details>
<summary>Why two secrets, and why these permissions?</summary>

Ice has a read and a write secret. Ruumble only ever gets the read secret, so it can never change the Mumble server; the write secret stays with you. The files must be readable for the containers (Ruumble runs as an unprivileged user), while the `secrets` folder keeps other users on the machine out.
</details>

Add this to the Mumble service in its Compose file (a complete example: [`deploy/compose/mumble.docker-compose.yml`](../deploy/compose/mumble.docker-compose.yml)):

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

Restart Mumble with `docker compose up -d`. Do **not** publish port 6502: Ruumble reaches Ice through the Docker network `mumble-network`.

### 2. Start Ruumble

In a folder next to Mumble's (e.g. `ruumble/` beside `mumble/`), save this as `docker-compose.yml` and run `docker compose up -d`:

```yaml
services:
  ruumble:
    image: ghcr.io/skrrytch/ruumble:0.27.0
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

A commented version with the HTTPS options: [`deploy/compose/ruumble.docker-compose.yml`](../deploy/compose/ruumble.docker-compose.yml).

## Tell the plugins where Ruumble is

The plugin finds the service through the description of the **root channel** (the top channel). In Mumble, edit it and add a line of its own, with your server's address:

```
ruumble: http://192.168.1.10:64080
```

Keep the whole description short, **under 128 characters**. Otherwise users only receive it after hovering over the top channel once ([why](operations/troubleshooting.md#root-channel-description)).

## Check and invite users

```sh
curl http://192.168.1.10:64080/healthz      # → {"ice":"ok",…}
```

Then send users to `http://192.168.1.10:64080`. The page offers the plugin for download, and the [user guide](user-guide.md) explains the rest.

> **Plain HTTP belongs in a LAN or VPN.** The templates publish port 64080 on all network interfaces; on a server with a public address, bind it to the LAN or VPN address instead: `ports: ["192.168.1.10:64080:64080"]`. Ruumble may be reachable from the internet, but only through an HTTPS reverse proxy, and whoever exposes it is responsible for securing it: see [HTTPS → On the internet](operations/https.md#on-the-internet).

## More

| Page | Content |
|---|---|
| [HTTPS](operations/https.md) | Ruumble behind a reverse proxy with a certificate; needed for installing it as an app |
| [Backup and updates](operations/maintenance.md) | Back up the board, update, roll back, remove, build the image yourself |
| [Troubleshooting](operations/troubleshooting.md) | Typical problems with their log messages |
| [Mumble tips](operations/mumble.md) | Mumble without Docker, welcome message with a link, order of floors and rooms, who is an admin in Ruumble (care and maintenance), upgrading Mumble |
| [Configuration reference](operations/reference.md) | All settings of the container |
