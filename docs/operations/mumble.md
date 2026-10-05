# Mumble tips

[← Setting up Ruumble](../operations.md)

Things about the Mumble server that matter when running Ruumble next to it.

## Back up before you start

Before changing an existing Mumble container, back up its data:

```sh
docker cp mumble-server:/data/. <backup-dir>/mumble-data/
```

If the data lives in an **anonymous volume** (no name under `volumes:` in the Compose file), `docker compose down` discards it. Copy it into a named volume first, like `mumble-data` in the [example](../../deploy/compose/mumble.docker-compose.yml), and keep a copy of the old Compose file.

## Mumble without Docker

For a Mumble server installed from a package, enable Ice in `mumble-server.ini` (or `murmur.ini`) and restart it:

```ini
ice="tcp -h 127.0.0.1 -p 6502"
icesecretread=<random value 1>
icesecretwrite=<random value 2>
```

In Ruumble's Compose file, set `ICE_HOST` to an address of the host that the container can reach, put the read secret into `secrets/ice_read`, and remove the `mumble-network` lines. `127.0.0.1` inside the container is the container itself, so let Ice listen on an address the container reaches (e.g. the Docker bridge, often `172.17.0.1`) and restrict port 6502 to that path with a firewall.

## Welcome message with a link

Plugins cannot show links in Mumble, but the server's welcome message can. In Mumble's Compose file:

```yaml
      MUMBLE_CONFIG_WELCOMETEXT: >-
        "Welcome! <a href='http://192.168.1.10:64080'><b>Open the building (Ruumble)</b></a>"
```

Put the whole value in double quotes (otherwise a comma splits it), the link in single quotes, and non-ASCII characters as HTML entities (`&auml;`). It takes effect after restarting the Mumble container.

## Order of floors and rooms

Top-level channels become floors, their subchannels rooms. The order comes from the channels' **Position** (in Mumble: edit channel → Position; lower numbers first, equal ones alphabetically). The first top-level channel is the ground floor. Floors with deeper nesting are shown locked in the elevator; floors with many rooms scroll sideways.

## Admins in Ruumble

Ruumble has no roles of its own: whoever has Mumble's **Write** permission on a channel is an admin there. On a room it lets them delete others' posts on that board. On the root channel it makes them a building admin: every plant becomes a button (room, floor and building care; the building's plant stands beside the building in the building overview) and the lantern next to it opens the building maintenance; Write on a single room or floor does not open its plant. Mumble's default ACL grants Write to the `admin` group, so adding a user to `admin` on the root channel (in Mumble: right-click the root channel → Edit → Groups) is usually enough. Ruumble reads the permission every 10 s; a change shows after that, without pairing again.

## SuperUser password as a secret

The [example](../../deploy/compose/mumble.docker-compose.yml) sets Mumble's SuperUser password from the Docker secret `MUMBLE_SUPERUSER_PASSWORD` (file `secrets/superuser_password`). This has nothing to do with Ruumble.

## Upgrading Mumble from 1.5 to 1.6

Back up the Mumble data first (above). The database migration of Mumble 1.6.870 fails if `channel_info` contains empty values, with an error like `Failed at migrating table channel_properties from schema version 9 to 11 … NOT NULL constraint failed`. Check before upgrading; the result must be `0`:

```sh
sqlite3 mumble-server.sqlite "select count(*) from channel_info where value is null"
```
