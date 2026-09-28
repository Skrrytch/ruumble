# ADR-0008: Betrieb

Status: angenommen für Docker, vorgeschlagen für den Rest (28.09.2026)

## Entscheidung
1. **Docker Compose** mit drei Containern im selben Netz:
   - `mumble`: das offizielle Image, unverändert, in der Version aus `third_party/mumble/VERSION`. Ice lauscht nur im internen Compose-Netz, der Port 6502 wird **nicht** veröffentlicht.
   - `ruumble`: der Dienst. Er liefert auch die gebaute Oberfläche aus.
   - `proxy`: Caddy. Er übernimmt HTTPS (Pflicht für eine PWA) und leitet `/` sowie `/ws/*` an `ruumble` weiter.
2. **Secrets:** `icesecretread` und `icesecretwrite` bekommen unterschiedliche Zufallswerte und liegen in einer `.env`-Datei außerhalb des Repositorys. `ruumble` erhält nur das Read-Secret.
3. **Erreichbarkeit:** Der Dienst ist nur im internen Netz oder VPN erreichbar, nicht aus dem Internet (ADR-0004).
4. **Plugin-Verteilung:** Das Bundle `ruumble-<version>.mumble_plugin` (Linux x64) wird vom Dienst unter `/download` angeboten. Die Installationsanleitung beschreibt: Installieren, dann **Aktivieren** unter Einstellungen → Plugins.
5. **Plugin-Konfiguration:** Die Adresse des Dienstes wird beim Build fest eingetragen und lässt sich in `~/.config/ruumble/plugin.json` überschreiben. Das ist nötig, weil die Plugin-API keine Serveradresse liefert.
6. **Gesundheit:** `GET /healthz` meldet, ob Ice erreichbar ist, wann zuletzt erfolgreich abgefragt wurde und wie viele Plugins verbunden sind.

## Offene Punkte
Domain und Zertifikat (interne CA oder Let's Encrypt über DNS-Challenge) stehen noch nicht fest, siehe Frage O10.
