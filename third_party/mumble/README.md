# Mumble interface files

Ruumble connects to Mumble **only** through two public interfaces. Exactly these two files are taken unmodified from a fixed Mumble release:

| File | Purpose | Used by |
|---|---|---|
| `plugins/MumblePlugin.h` | client plugin API (C) | `plugin/` (include path) |
| `src/murmur/MumbleServer.ice` | the server's Ice interface | `bridge/` (stubs via `slice2js`) |

- **Version:** see `VERSION` (tag in [mumble-voip/mumble](https://github.com/mumble-voip/mumble))
- **Checksums:** `SHA256SUMS`
- **License:** BSD-3-Clause, © The Mumble Developers, see `LICENSE`

The files are **never edited by hand**. They are updated only with:

```sh
scripts/update-mumble-interfaces.sh v1.6.870   # desired release tag
```

The script downloads both files for the given tag, rewrites `VERSION` and `SHA256SUMS` and shows the differences. Every change to an interface must then be checked against [docs/mumble-interfaces.md](../../docs/mumble-interfaces.md).

The server version in the Docker setup (`deploy/`) must match `VERSION`.
