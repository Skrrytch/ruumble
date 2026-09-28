# Mumble-Schnittstellendateien

Ruumble bindet Mumble **nur** über zwei öffentliche Schnittstellen an. Genau diese zwei Dateien werden unverändert aus einem festgelegten Mumble-Release übernommen:

| Datei | Zweck | Verwendet von |
|---|---|---|
| `plugins/MumblePlugin.h` | Client-Plugin-API (C) | `plugin/` (Include-Pfad) |
| `src/murmur/MumbleServer.ice` | Ice-Schnittstelle des Servers | `bridge/` (Stubs per `slice2js`) |

- **Version:** siehe `VERSION` (Tag in [mumble-voip/mumble](https://github.com/mumble-voip/mumble))
- **Prüfsummen:** `SHA256SUMS`
- **Lizenz:** BSD-3-Clause, © The Mumble Developers, siehe `LICENSE`

Die Dateien werden **nie von Hand geändert**. Aktualisiert werden sie nur mit:

```sh
scripts/update-mumble-interfaces.sh v1.6.870   # gewünschtes Release-Tag
```

Das Skript lädt beide Dateien für das angegebene Tag, schreibt `VERSION` und `SHA256SUMS` neu und zeigt die Unterschiede an. Jede Änderung an einer Schnittstelle muss danach gegen `docs/analyse/mumble-schnittstellen.md` geprüft werden.

Die Server-Version im Docker-Setup (`deploy/`) muss zu `VERSION` passen.
