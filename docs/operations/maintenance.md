# Backup and updates

[← Setting up Ruumble](../operations.md)

Ruumble keeps its data in the Docker volume `ruumble-data`: the paired browsers and the boards. Mumble's data is not touched.

## Back up

**The board, while Ruumble is running** (a consistent copy of the database, then the attachments):

```sh
docker exec ruumble node dist/main.mjs backup /data/backup
docker cp ruumble:/data/backup <backup-dir>/board-$(date +%Y%m%d)
docker exec ruumble rm -rf /data/backup
```

**The whole volume**, e.g. before an update:

```sh
docker run --rm -v ruumble-data:/d -v <backup-dir>:/b alpine tar czf /b/ruumble-data-$(date +%Y%m%d-%H%M%S).tgz -C /d .
```

## Update

1. Back up the volume (above).
2. Change the image tag in the Compose file, e.g. `ghcr.io/skrrytch/ruumble:0.15.0`. The versions and what changed: [releases](https://github.com/Skrrytch/ruumble/releases) and [CHANGELOG.md](../../CHANGELOG.md), which also lists anything to do when updating.
3. `docker compose up -d`

If the release notes mention a new plugin version, users download the plugin again from Ruumble's start page and install it over the old one.

## Roll back

Set the previous image tag, restore the volume backup from before the update, and start again:

```sh
docker compose down
docker run --rm -v ruumble-data:/d -v <backup-dir>:/b alpine sh -c 'rm -rf /d/* && tar xzf /b/<backup>.tgz -C /d'
docker compose up -d
```

## Remove Ruumble

```sh
cd <folder of Ruumble's Compose file> && docker compose down
```

Mumble keeps running unchanged. `docker volume rm ruumble-data` also deletes the boards and pairings. If you changed Mumble for Ruumble, you can restore Mumble's backed-up Compose file.

## The board's storage

- **Where:** `/data/board.sqlite` (SQLite) and attachments under `/data/board/` in the volume. Identical files are stored only once.
- **Limits:** files up to 10 MB each; posts are kept for `RETENTION_DAYS` (30); attachments may use `BOARD_QUOTA_MB` (2048) in total, and when that is full the oldest posts with attachments are deleted. Posts of deleted channels are kept for 7 days. Cleanup runs hourly.
- **Usage:** `curl http://<address>:64080/healthz` shows `"board":{"usedMB":…,"quotaMB":…}`.

## Building the image yourself

Instead of the published image, in a clone of the repository:

```sh
docker build -f deploy/Dockerfile -t ruumble:<version> .
docker save ruumble:<version> | gzip | ssh <server> 'gunzip | docker load'
```

and set `image: ruumble:<version>` in the Compose file.
