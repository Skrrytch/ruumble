# Betrieb neben einem bestehenden Mumble-Container

So wurde Ruumble am 28.09.2026 zum ersten Mal neben einem laufenden Mumble-Server (Docker, Mumble 1.5.735) in Betrieb genommen. Die Dateien in diesem Ordner sind Vorlagen: `<LAN-IP>` durch die Adresse des Servers im Heimnetz ersetzen.

## Änderungen am Mumble-Container

1. **Sicherung:** `docker cp mumble-server:/data/. <backup>/data-live/`, dann nach dem Stoppen nochmals nach `<backup>/data-stopped/`. Dazu kommt eine Kopie der alten Compose-Datei (`docker-compose.yml.bak-<zeitstempel>`).
2. **Benanntes Volume:** Die Daten lagen in einem anonymen Volume, das ein `docker compose down` verworfen hätte. Sie wurden in das Volume `mumble-data` kopiert. Das alte anonyme Volume bleibt als Rückfallebene erhalten.
3. **Ice:** `MUMBLE_CONFIG_ICE: '"tcp -h 0.0.0.0 -p 6502"'`. Port 6502 wird **nicht** veröffentlicht.
4. **Secrets:** zwei verschiedene Zufallswerte in `secrets/ice_read` und `secrets/ice_write` (Rechte 600), eingebunden als Docker-Secrets `MUMBLE_CONFIG_ICESECRETREAD` bzw. `…WRITE`. Ruumble erhält **nur** das Read-Secret.

5. **SuperUser-Passwort:** Es liegt als Docker-Secret `MUMBLE_SUPERUSER_PASSWORD` in `secrets/superuser_password` (Rechte 600). Das Image setzt es bei jedem Start. Nachlesen mit `cat ~/server/docker/services/mumble/secrets/superuser_password`.

**Neuaufsetzen am 28.09.2026:** Die Datenbank enthielt schon vor der Umstellung nur den Root-Kanal und den SuperUser (Sicherung von 15:37, Protokoll zurück bis 02.09.). Die Datenbank wurde deshalb auf Wunsch neu angelegt (`docker compose down`, `docker volume rm mumble-data`, `docker compose up -d`). Dabei entstand ein neues Server-Zertifikat, Clients fragen daher einmal nach, ob sie ihm vertrauen. Alle Sicherungen und das alte anonyme Volume sind erhalten.

Vorlage: [`mumble.docker-compose.yml`](mumble.docker-compose.yml)

## Ruumble

- Image: lokal gebaut (`docker build -f deploy/Dockerfile -t ruumble:<version> .`) und mit `docker save | ssh … docker load` übertragen
- Compose: [`ruumble.docker-compose.yml`](ruumble.docker-compose.yml). Ruumble hängt nur im `mumble-network`, und der Port ist nur an die LAN-Adresse gebunden.
- Prüfen: `curl http://<LAN-IP>:8080/healthz` → `{"ice":"ok",…}`

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
