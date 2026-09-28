# Betrieb neben einem bestehenden Mumble-Container

Anleitung für Ruumble neben einem Mumble-Server in Docker (erprobt mit Mumble 1.5.735 und 1.6.870). Die Dateien in diesem Ordner sind Vorlagen. Platzhalter:

- `<LAN-IP>`: Adresse des Servers im Heimnetz
- `<compose-dir>`: Verzeichnis mit den Compose-Dateien (z. B. je ein Unterordner `mumble/` und `ruumble/`)
- `<backup-dir>`: Ablage für Sicherungen

## Mumble-Container vorbereiten

1. **Sichern:** `docker cp mumble-server:/data/. <backup-dir>/mumble-data/` und eine Kopie der bisherigen Compose-Datei.
2. **Benanntes Volume:** Liegen die Daten in einem anonymen Volume, verwirft `docker compose down` sie. Die Vorlage nutzt deshalb das benannte Volume `mumble-data` (vorher die Daten hineinkopieren).
3. **Ice:** `MUMBLE_CONFIG_ICE: '"tcp -h 0.0.0.0 -p 6502"'`. Port 6502 wird **nicht** veröffentlicht; Ruumble erreicht ihn über das gemeinsame Docker-Netz `mumble-network`.
4. **Secrets:** zwei verschiedene Zufallswerte in `secrets/ice_read` und `secrets/ice_write` (Rechte 600), eingebunden als Docker-Secrets `MUMBLE_CONFIG_ICESECRETREAD` bzw. `…WRITE`. Ruumble erhält **nur** das Read-Secret.
5. **SuperUser-Passwort** (optional): als Docker-Secret `MUMBLE_SUPERUSER_PASSWORD` in `secrets/superuser_password` (Rechte 600). Das Image setzt es bei jedem Start.
6. **Willkommensnachricht mit Link zu Ruumble** (`MUMBLE_CONFIG_WELCOMETEXT`). Plugins können in Mumble weder Knöpfe noch anklickbare Links anzeigen, die Begrüßung des Servers aber schon: Mumble zeigt sie bei jedem Verbinden im Protokoll. Der ganze Wert steht in Anführungszeichen (INI: ein Komma würde ihn sonst in eine Liste zerlegen), der Link in einfachen Anführungszeichen, Umlaute als HTML-Entities.

Vorlage: [`mumble.docker-compose.yml`](mumble.docker-compose.yml). Das zusätzliche externe Netz `homeserver-network` darin ist ein Beispiel für einen vorhandenen Reverse-Proxy und kann entfallen.

## Ruumble

- **Image:** `docker build -f deploy/Dockerfile -t ruumble:<version> .` (im Repository), auf den Server z. B. mit `docker save ruumble:<version> | gzip | ssh <server> 'gunzip | docker load'`.
- **Compose:** [`ruumble.docker-compose.yml`](ruumble.docker-compose.yml). Ruumble hängt nur im `mumble-network`, der Port ist nur an die LAN-Adresse gebunden.
- **Prüfen:** `curl http://<LAN-IP>:8080/healthz` → `{"ice":"ok",…}`
- **`ADDRESS_CHECK: enforce`:** Im Heimnetz stimmen die IP-Adressen von Plugin und Mumble-Verbindung überein (P7). Über VPN oder Proxy ist das noch zu prüfen.
- **Plugin im Image:** gebaut auf Debian 12 (glibc 2.36), damit es auch mit älteren Distributionen läuft. Download unter `http://<LAN-IP>:8080/download`; die Oberfläche verlinkt es auf ihren Hinweisseiten.
- **Update:** vorher das Volume sichern, dann Image-Tag in der Compose-Datei ändern und `docker compose up -d`:
  ```sh
  docker run --rm -v ruumble-data:/d -v <backup-dir>:/b alpine tar czf /b/ruumble-data-$(date +%Y%m%d-%H%M%S).tgz -C /d .
  ```

## Adresse für das Plugin (Root-Beschreibung)

Es gibt **ein** Plugin für alle Server (ADR-0010). Die Adresse des Dienstes steht in der Beschreibung des obersten Kanals, als eigene Zeile, die auf `ruumble: <adresse>` endet:

```
Hier ein paar wichtige Konfigurationen für Ruumble:

- ruumble: http://<LAN-IP>:8080
```

Die Beschreibung sollte **unter 128 Zeichen** bleiben, gemessen am gespeicherten HTML. Dann bekommen sie alle Clients sofort. Bei längerer Beschreibung muss jeder Nutzer einmal mit der Maus über den obersten Kanal fahren; das Plugin weist im Mumble-Protokoll darauf hin. Mumbles Editor fügt viel Formatierung ein (aus drei Zeilen können so fast 400 Zeichen werden). Kurz bleibt sie, wenn man sie einmalig per Ice mit dem Write-Secret setzt, in einem kurzlebigen Hilfscontainer, nicht über Ruumble.

Übersteuern lässt sich die Adresse je Nutzer in `~/.config/ruumble/plugin.json` (`bridgeUrl`).

Plugin selbst bauen (statt Download):

```sh
cmake -S plugin -B plugin/build -DCMAKE_BUILD_TYPE=Release && cmake --build plugin/build
# → plugin/build/ruumble-<version>.mumble_plugin
```

## Pinnwand

- **Ablage:** im Volume `ruumble-data`, also `/data/board.sqlite` (SQLite im WAL-Modus) und die Anhänge unter `/data/board/<xx>/<sha256>`. Gleiche Dateien liegen nur einmal dort.
- **Grenzen** (ADR-0011): Aufbewahrung 30 Tage (`RETENTION_DAYS`), Kontingent 2 GB (`BOARD_QUOTA_MB`), einzelne Dateien bis 10 MB. Ist das Kontingent voll, löscht der Dienst die ältesten Beiträge mit Anhang. Beiträge gelöschter Kanäle bleiben 7 Tage erhalten. Aufgeräumt wird stündlich.
- **Füllstand:** `curl http://<LAN-IP>:8080/healthz` → `"board":{"usedMB":…,"quotaMB":2048}`
- **Sicherung im laufenden Betrieb** (SQLite-Backup-API, danach die Anhänge):
  ```sh
  docker exec ruumble node dist/main.mjs backup /data/backup
  docker cp ruumble:/data/backup <backup-dir>/board-$(date +%Y%m%d)
  docker exec ruumble rm -rf /data/backup
  ```
- **Hinweis in Mumble:** Heftet jemand etwas an, sehen die anderen Anwesenden im Mumble-Protokoll z. B. „Ruumble: Ben hat Code an die Pinnwand geheftet.“ Das braucht Plugin **0.3.0** oder neuer; ältere Plugins ignorieren den Hinweis.
- **Kopieren ohne HTTPS:** Über `http://<LAN-IP>` gibt es die Clipboard-API des Browsers nicht; die Oberfläche kopiert dann über einen Rückfall.

## Rückweg

```sh
cd <compose-dir>/ruumble && docker compose down      # Ruumble entfernen
cd <compose-dir>/mumble
cp <backup-dir>/docker-compose.yml.bak docker-compose.yml
docker compose up -d
```

Liefen die Mumble-Daten vorher in einem anonymen Volume, dieses in der alten Compose-Datei wieder als `/data` einbinden (`volumes: { <volume>: { external: true } }`).
