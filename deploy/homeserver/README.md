# Betrieb neben einem bestehenden Mumble-Container

So wurde Ruumble am 28.09.2026 zum ersten Mal neben einem laufenden Mumble-Server (Docker, Mumble 1.5.735) in Betrieb genommen. Die Dateien in diesem Ordner sind Vorlagen: `<LAN-IP>` durch die Adresse des Servers im Heimnetz ersetzen.

## Änderungen am Mumble-Container

1. **Sicherung:** `docker cp mumble-server:/data/. <backup>/data-live/`, dann nach dem Stoppen nochmals nach `<backup>/data-stopped/`. Dazu kommt eine Kopie der alten Compose-Datei (`docker-compose.yml.bak-<zeitstempel>`).
2. **Benanntes Volume:** Die Daten lagen in einem anonymen Volume, das ein `docker compose down` verworfen hätte. Sie wurden in das Volume `mumble-data` kopiert. Das alte anonyme Volume bleibt als Rückfallebene erhalten.
3. **Ice:** `MUMBLE_CONFIG_ICE: '"tcp -h 0.0.0.0 -p 6502"'`. Port 6502 wird **nicht** veröffentlicht.
4. **Secrets:** zwei verschiedene Zufallswerte in `secrets/ice_read` und `secrets/ice_write` (Rechte 600), eingebunden als Docker-Secrets `MUMBLE_CONFIG_ICESECRETREAD` bzw. `…WRITE`. Ruumble erhält **nur** das Read-Secret.

5. **SuperUser-Passwort:** Es liegt als Docker-Secret `MUMBLE_SUPERUSER_PASSWORD` in `secrets/superuser_password` (Rechte 600). Das Image setzt es bei jedem Start. Nachlesen mit `cat ~/server/docker/services/mumble/secrets/superuser_password`.

**Neuaufsetzen am 28.09.2026:** Die Datenbank enthielt schon vor der Umstellung nur den Root-Kanal und den SuperUser (Sicherung von 15:37, Protokoll zurück bis 02.09.). Die Datenbank wurde deshalb auf Wunsch neu angelegt (`docker compose down`, `docker volume rm mumble-data`, `docker compose up -d`). Dabei entstand ein neues Server-Zertifikat, Clients fragen daher einmal nach, ob sie ihm vertrauen. Alle Sicherungen und das alte anonyme Volume sind erhalten.

6. **Willkommensnachricht mit Link zu Ruumble** (`MUMBLE_CONFIG_WELCOMETEXT`). Plugins können in Mumble weder Knöpfe noch anklickbare Links anzeigen, die Begrüßung des Servers aber schon: Mumble zeigt sie bei jedem Verbinden im Protokoll. Der ganze Wert steht in Anführungszeichen (INI: ein Komma würde ihn sonst in eine Liste zerlegen), der Link in einfachen Anführungszeichen, Umlaute als HTML-Entities.

Vorlage: [`mumble.docker-compose.yml`](mumble.docker-compose.yml)

## Ruumble

- Image: lokal gebaut (`docker build -f deploy/Dockerfile -t ruumble:<version> .`) und mit `docker save | ssh … docker load` übertragen
- Compose: [`ruumble.docker-compose.yml`](ruumble.docker-compose.yml). Ruumble hängt nur im `mumble-network`, und der Port ist nur an die LAN-Adresse gebunden.
- Prüfen: `curl http://<LAN-IP>:8080/healthz` → `{"ice":"ok",…}`
- `ADDRESS_CHECK: enforce` (seit 0.2.0): Im Heimnetz stimmen die IP-Adressen von Plugin und Mumble-Verbindung überein (P7). Über VPN oder Proxy ist das noch zu prüfen.
- Das Image enthält das Plugin (gebaut auf Debian 12, glibc 2.36). Es steht unter `http://<LAN-IP>:8080/download` bereit, und die Oberfläche verlinkt es auf ihren Hinweisseiten.
- **Root-Beschreibung kurz halten** (unter 128 Zeichen, gemessen am gespeicherten HTML). Mumbles Editor fügt viel Formatierung ein, z. B. wurden aus drei Zeilen 398 Zeichen. Gesetzt wurde sie deshalb einmalig per Ice mit dem Write-Secret in einem kurzlebigen Hilfscontainer, nicht über Ruumble. Der alte Text liegt in `<backup>/root-description-before.html`.

## Pinnwand (ab 0.5)

- **Ablage:** im Volume `ruumble-data`, also `/data/board.sqlite` (SQLite im WAL-Modus) und die Anhänge unter `/data/board/<xx>/<sha256>`. Gleiche Dateien liegen nur einmal dort.
- **Grenzen** (ADR-0011): Aufbewahrung 30 Tage (`RETENTION_DAYS`), Kontingent 2 GB (`BOARD_QUOTA_MB`), einzelne Dateien bis 10 MB. Ist das Kontingent voll, löscht der Dienst die ältesten Beiträge mit Anhang. Beiträge gelöschter Kanäle bleiben 7 Tage erhalten. Aufgeräumt wird stündlich.
- **Füllstand:** `curl http://<LAN-IP>:8080/healthz` → `"board":{"usedMB":…,"quotaMB":2048}`
- **Sicherung im laufenden Betrieb** (SQLite-Backup-API, danach die Anhänge):
  ```sh
  docker exec ruumble node dist/main.mjs backup /data/backup
  docker cp ruumble:/data/backup ~/server/backups/ruumble/board-$(date +%Y%m%d)
  docker exec ruumble rm -rf /data/backup
  ```
  Vor jedem Update sichert der Ablauf zusätzlich das ganze Volume als `tgz` nach `~/server/backups/ruumble/`.
- **Hinweis in Mumble:** Heftet jemand etwas an, sehen die anderen Anwesenden im Mumble-Protokoll z. B. „Ruumble: Ben hat Code an die Pinnwand geheftet.“ Das braucht Plugin **0.3.0** oder neuer. Ältere Plugins ignorieren den Hinweis, alles andere funktioniert weiter.

## Plugin

Es gibt **ein** Plugin für alle Server (ADR-0010). Die Adresse des Dienstes steht in der Beschreibung des obersten Kanals, als eigene Zeile, die auf `ruumble: <adresse>` endet:

```
Hier ein paar wichtige Konfigurationen für Ruumble:

- ruumble: http://<LAN-IP>:8080
```

Die Beschreibung sollte möglichst **unter 128 Zeichen** bleiben. Dann bekommen sie alle Clients sofort. Bei längerer Beschreibung muss jeder Nutzer einmal mit der Maus über den obersten Kanal fahren, das Plugin weist im Mumble-Protokoll darauf hin.

```sh
cmake -S plugin -B plugin/build -DCMAKE_BUILD_TYPE=Release && cmake --build plugin/build
# → plugin/build/ruumble-<version>.mumble_plugin
```

Übersteuern lässt sich die Adresse in `~/.config/ruumble/plugin.json` (`bridgeUrl`).

## Rückweg

```sh
cd ~/server/docker/services/ruumble && docker compose down           # Ruumble entfernen
cd ~/server/docker/services/mumble
cp docker-compose.yml.bak-<zeitstempel> docker-compose.yml
# alte Datenablage wieder einbinden: in der Compose-Datei unter mumble-server ergänzen
#   volumes: [ "<anonymes-volume>:/data" ]   (Name steht in <backup>/anon-volume.txt)
# und am Dateiende:  volumes: { <anonymes-volume>: { external: true } }
docker compose up -d
```
