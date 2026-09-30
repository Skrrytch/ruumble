# Configuration reference

[← Setting up Ruumble](../operations.md)

All settings are environment variables of the Ruumble container, under `environment:` in its Compose file.

## Always set

The templates already set these.

| Variable | Meaning |
|---|---|
| `ICE_HOST` | Host of the Mumble server; with Docker the name of the Mumble container |
| `ICE_SECRET_READ_FILE` or `ICE_SECRET_READ` | Ice read secret, as a file (Docker secret) or directly. **Never the write secret.** |

## Optional

| Variable | Default | Meaning |
|---|---|---|
| `ADDRESS_CHECK` | `warn` | `off` / `warn` / `enforce`: compare the network address of the plugin with the one Mumble sees for that user. The templates set `enforce`; behind a reverse proxy use `warn` ([HTTPS](https.md)). |
| `TRUST_PROXY` | `false` | `true` behind a reverse proxy: client address and protocol come from `X-Forwarded-For` and `X-Forwarded-Proto` |
| `PUBLIC_URL` | the address the plugin connected to | Base address for the pairing links the plugin opens. Only needed if the plugins reach Ruumble at a different address than the browsers should use, or behind a proxy that sends no `X-Forwarded-Proto`. |
| `ICE_PORT` | `6502` | Ice port |
| `SERVER_ID` | first running | Which virtual server, if the Mumble process runs several |
| `PORT`, `HOST` | `64080`, `0.0.0.0` | Port and interface inside the container |
| `PREVIEW` | `false` | `true`: unpaired browsers see the building read-only |
| `RETENTION_DAYS` | `30` | How long board posts are kept |
| `BOARD_QUOTA_MB` | `2048` | Storage for board attachments; when full, the oldest posts with attachments are deleted |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` |

**Set by the image**, not changed normally: `DATA_DIR` (`/data`), `WEB_DIST`, `PLUGIN_BUNDLE`, `PLUGIN_BUNDLE_DIR`.

## Compose templates

In [`deploy/compose/`](../../deploy/compose/README.md), also attached to every [release](https://github.com/Skrrytch/ruumble/releases/latest):

| File | For |
|---|---|
| `mumble-with-ruumble.docker-compose.yml` with `setup.sh` | A new setup: Mumble server and Ruumble together |
| `ruumble.docker-compose.yml` | Ruumble next to an existing Mumble container, with the HTTPS options as comments |
| `mumble.docker-compose.yml` | Example of a Mumble container prepared for Ruumble |

## Image

- `ghcr.io/skrrytch/ruumble:<version>` for linux/amd64 and linux/arm64. Tags: the exact version, `<major>.<minor>` and `latest`.
- It contains the plugin for Linux x86_64 and Windows x64, offered for download on Ruumble's start page, also on arm64 servers.
- License: the service uses Ice for JavaScript (GPL-2.0), so the image as a whole is GPL-2.0; see [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md).
