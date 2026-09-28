# ADR-0009: Eigenständiges Repository statt Mumble-Fork

Status: angenommen (28.09.2026)

## Kontext
Ursprünglich sollte die Entwicklung in einem Fork von Mumble (`Skrrytch/roomble`) im Ordner `rooms/` stattfinden. Mit der Architektur aus ADR-0001 baut Ruumble aber weder den Mumble-Client noch den Server. Aus Mumble werden nur zwei Schnittstellendateien gebraucht.

## Optionen
1. **Eigenständiges Repository** (`Skrrytch/ruumble`), die zwei Schnittstellendateien liegen festgelegt unter `third_party/mumble/`.
2. Fork mit `rooms/`, Upstream-Sync und einer CI-Prüfung, die sicherstellt, dass sich außerhalb von `rooms/` nichts ändert
3. Git-Submodul auf Mumble (voller Checkout auf ein Tag)

## Entscheidung
Option 1.
- Die Dateien `plugins/MumblePlugin.h` und `src/murmur/MumbleServer.ice` werden **unverändert** aus einem **Release-Tag** übernommen, nicht aus `master`. Grund: Laufen soll gegen veröffentlichte Versionen. Aktuell ist das **v1.6.870**.
- `VERSION`, `SHA256SUMS` und die BSD-3-`LICENSE` von Mumble liegen daneben.
- Aktualisiert wird nur per `scripts/update-mumble-interfaces.sh <tag>`. Danach wird `docs/analyse/mumble-schnittstellen.md` gegen die Unterschiede geprüft.
- Ein CI-Job prüft `SHA256SUMS`. Ein wöchentlicher Job meldet ein neueres Mumble-Release als Issue.
- Der Name im Plugin und im Produkt ist **Ruumble**.

## Konsequenzen
- Die Mumble-Historie, die Submodule und die Mumble-CI fallen weg, ebenso die Gefahr, versehentlich einen PR bei mumble-voip zu eröffnen.
- Die einzige Abhängigkeit zu Mumble ist klar sichtbar, versioniert und prüfbar.
- Der Fork `Skrrytch/roomble` wird nicht mehr gebraucht und kann archiviert werden.
