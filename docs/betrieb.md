# Anleitung für Betreiber: Ruumble neben einem Mumble-Server

Ruumble besteht aus einem **Dienst** (Docker-Container, liefert auch die Oberfläche aus) und einem **Plugin** für die Mumble-Clients der Nutzer. Der Dienst liest den Mumble-Server über dessen Ice-Schnittstelle **nur lesend**; Mumble selbst bleibt unverändert.

```
Browser ──http(s)──▶ Ruumble-Dienst ──Ice (nur lesen)──▶ Mumble-Server
                          ▲
                          │ WebSocket (ausgehend)
                     Ruumble-Plugin im Mumble-Client
```

Platzhalter in dieser Anleitung: `<LAN-IP>` (Adresse des Servers), `<compose-dir>` (Ablage der Compose-Dateien, z. B. je ein Ordner `mumble/` und `ruumble/`), `<backup-dir>` (Sicherungen).

## Voraussetzungen

| | Anforderung |
|---|---|
| Mumble-Server | **ab 1.5** (bis 1.4 hieß die Ice-Schnittstelle `Murmur`, Ruumble spricht `MumbleServer`). Ice muss aktiviert sein. |
| Mumble-Client der Nutzer | ab 1.4, **Linux** (das Plugin gibt es nur als `.so`) |
| Dienst | Docker; der Container braucht Netzzugang zum Ice-Port des Mumble-Servers |
| Netz | Die Clients der Nutzer müssen den Dienst erreichen (Plugin und Browser) |

**Getestet mit:**

| Komponente | Versionen |
|---|---|
| Mumble-Server | 1.5.735, 1.6.870 (offizielles Image `mumblevoip/mumble-server`) |
| Mumble-Client | 1.4.287 (Fedora), 1.5.517 (Ubuntu 24.04), 1.5.735 (Debian 13) |

Bekannte Einschränkung: Ab Mumble-Server 1.6 liefert Ice keine Avatarbilder registrierter Nutzer (Fehler in Mumble); Ruumble zeigt dann Initialen.

## 1. Mumble-Server vorbereiten

Ruumble braucht Ice mit **zwei verschiedenen Secrets**. Der Dienst bekommt nur das **Read-Secret**; das Write-Secret bleibt beim Betreiber (z. B. für einmalige Einrichtung).

### Mit Docker (offizielles Image)

Vorlage: [`deploy/compose/mumble.docker-compose.yml`](../deploy/compose/mumble.docker-compose.yml)

1. **Sichern:** `docker cp mumble-server:/data/. <backup-dir>/mumble-data/` und die bisherige Compose-Datei kopieren.
2. **Benanntes Volume:** Liegen die Daten in einem anonymen Volume, verwirft `docker compose down` sie. Die Vorlage nutzt das benannte Volume `mumble-data` (vorher die Daten hineinkopieren).
3. **Ice:** `MUMBLE_CONFIG_ICE: '"tcp -h 0.0.0.0 -p 6502"'`. Port 6502 wird **nicht** veröffentlicht; Ruumble erreicht ihn über das gemeinsame Docker-Netz `mumble-network`.
4. **Secrets:** zwei verschiedene Zufallswerte in `secrets/ice_read` und `secrets/ice_write` (Rechte 600), eingebunden als Docker-Secrets `MUMBLE_CONFIG_ICESECRETREAD` und `MUMBLE_CONFIG_ICESECRETWRITE`.
5. **SuperUser-Passwort** (optional): Docker-Secret `MUMBLE_SUPERUSER_PASSWORD` in `secrets/superuser_password`.
6. **Begrüßung mit Link zu Ruumble** (optional, empfohlen): `MUMBLE_CONFIG_WELCOMETEXT`. Plugins können in Mumble keine Links anzeigen, die Begrüßung des Servers schon. Den ganzen Wert in Anführungszeichen setzen (ein Komma würde ihn sonst zerlegen), den Link in einfache Anführungszeichen, Umlaute als HTML-Entities.

Das zusätzliche externe Netz `homeserver-network` in der Vorlage ist nur ein Beispiel für einen vorhandenen Reverse-Proxy und kann entfallen.

### Ohne Docker (Paket der Distribution)

In `mumble-server.ini` (bzw. `murmur.ini`):

```ini
ice="tcp -h 127.0.0.1 -p 6502"
icesecretread=<zufallswert-1>
icesecretwrite=<zufallswert-2>
```

Danach den Server neu starten. Läuft der Ruumble-Container auf demselben Rechner, `-h` auf eine Adresse setzen, die der Container erreicht (z. B. die Docker-Bridge), und den Port per Firewall auf diesen Weg beschränken.

## 2. Dienst einrichten

Vorlage: [`deploy/compose/ruumble.docker-compose.yml`](../deploy/compose/ruumble.docker-compose.yml)

1. **Image bauen** (im Repository) und auf den Server bringen:
   ```sh
   docker build -f deploy/Dockerfile -t ruumble:<version> .
   docker save ruumble:<version> | gzip | ssh <server> 'gunzip | docker load'
   ```
2. **Compose-Datei** anpassen (Image-Tag, `PUBLIC_URL`, Port-Bindung an `<LAN-IP>`) und starten: `docker compose up -d`.
3. **Prüfen:** `curl http://<LAN-IP>:8080/healthz` → `{"ice":"ok",…}`. Dort stehen auch die Version des Mumble-Servers (`mumbleServer`) und die verbundenen Clients je Mumble- und Plugin-Version (`clients`, ab Plugin 0.4).

Ist der Mumble-Server älter als 1.5, bricht der Dienst mit einer klaren Meldung ab („… braucht Mumble-Server ab 1.5 …“).

Das Image enthält das Plugin (gebaut auf Debian 12, glibc 2.36, läuft damit auch auf älteren Distributionen). Nutzer laden es unter `http://<LAN-IP>:8080/download`.

### Umgebungsvariablen

| Variable | Standard | Bedeutung |
|---|---|---|
| `ICE_HOST` | – (Pflicht) | Rechner des Mumble-Servers |
| `ICE_PORT` | `6502` | Ice-Port |
| `ICE_SECRET_READ` / `ICE_SECRET_READ_FILE` | – (Pflicht) | Read-Secret, direkt oder als Datei (Docker-Secret). **Nie das Write-Secret.** |
| `SERVER_ID` | erster laufender | Server-ID, falls der Mumble-Prozess mehrere Server betreibt |
| `PUBLIC_URL` | `http://localhost:8080` | Adresse, unter der Nutzer Ruumble erreichen (für Kopplungslinks) |
| `PORT`, `HOST` | `8080`, `0.0.0.0` | HTTP und WebSocket |
| `DATA_DIR` | `./data` (im Image `/data`) | Geräte-Tokens und Pinnwand |
| `ADDRESS_CHECK` | `warn` | `off` / `warn` / `enforce`: IP von Plugin und Mumble-Verbindung vergleichen (ADR-0004). Im Heimnetz `enforce`; über VPN oder Proxy vorher prüfen. |
| `TRUST_PROXY` | `false` | `true` hinter einem Reverse-Proxy |
| `PREVIEW` | `false` | `true`: Gebäude ohne Kopplung nur lesend zeigen |
| `RETENTION_DAYS` | `30` | Aufbewahrung der Pinnwand-Beiträge |
| `BOARD_QUOTA_MB` | `2048` | Speicher für Anhänge; ist er voll, werden die ältesten Beiträge mit Anhang gelöscht |
| `LOG_LEVEL` | `info` | Protokollstufe |
| `WEB_DIST`, `PLUGIN_BUNDLE`, `PLUGIN_BUNDLE_DIR` | im Image gesetzt | Pfade zu Oberfläche und Plugin-Datei |

## 3. Adresse für das Plugin bekanntgeben

Es gibt **ein** Plugin für alle Server (ADR-0010). Es liest die Adresse des Dienstes aus der **Beschreibung des obersten Kanals**, aus einer eigenen Zeile, die auf `ruumble: <adresse>` endet:

```
Hier ein paar wichtige Konfigurationen für Ruumble:

- ruumble: http://<LAN-IP>:8080
```

Die Beschreibung sollte **unter 128 Zeichen** bleiben, gemessen am gespeicherten HTML; dann bekommen sie alle Clients sofort. Bei längerer Beschreibung muss jeder Nutzer einmal mit der Maus über den obersten Kanal fahren (das Plugin weist darauf hin). Mumbles Editor fügt viel Formatierung ein, aus drei Zeilen werden leicht 400 Zeichen. Kurz bleibt sie, wenn man sie einmalig per Ice mit dem Write-Secret setzt, in einem kurzlebigen Hilfscontainer, nicht über Ruumble.

Die Reihenfolge der Etagen und Räume kommt aus dem Feld **Position** der Kanäle (in Mumble: Kanal bearbeiten → Position; kleinere Zahlen zuerst, bei Gleichstand alphabetisch). Der erste Kanal der obersten Ebene ist das Erdgeschoss.

## 4. Pinnwand

- **Ablage:** im Volume `ruumble-data`: `/data/board.sqlite` (SQLite, WAL) und die Anhänge unter `/data/board/<xx>/<sha256>`. Gleiche Dateien liegen nur einmal dort.
- **Grenzen** (ADR-0011): Dateien bis 10 MB, Aufbewahrung `RETENTION_DAYS`, Speicher `BOARD_QUOTA_MB`. Beiträge gelöschter Kanäle bleiben 7 Tage. Aufgeräumt wird stündlich.
- **Füllstand:** `/healthz` → `"board":{"usedMB":…,"quotaMB":…}`
- **Hinweis in Mumble** beim Anheften braucht Plugin 0.3.0 oder neuer; ältere Plugins ignorieren ihn.

## 5. Sichern, aktualisieren, zurück

**Pinnwand im laufenden Betrieb sichern** (SQLite-Backup-API, danach die Anhänge):

```sh
docker exec ruumble node dist/main.mjs backup /data/backup
docker cp ruumble:/data/backup <backup-dir>/board-$(date +%Y%m%d)
docker exec ruumble rm -rf /data/backup
```

**Aktualisieren:** vorher das ganze Volume sichern, dann den Image-Tag in der Compose-Datei ändern und `docker compose up -d`:

```sh
docker run --rm -v ruumble-data:/d -v <backup-dir>:/b alpine tar czf /b/ruumble-data-$(date +%Y%m%d-%H%M%S).tgz -C /d .
```

**Ruumble entfernen:**

```sh
cd <compose-dir>/ruumble && docker compose down
```

Mumble läuft unverändert weiter. Wer Mumble für Ruumble umgestellt hat, kann die gesicherte Compose-Datei zurückspielen; liefen die Daten vorher in einem anonymen Volume, dieses wieder als `/data` einbinden (`volumes: { <volume>: { external: true } }`).

## Hinweise

- **Kopieren ohne HTTPS:** Über `http://<LAN-IP>` bietet der Browser keine Clipboard-API; die Oberfläche kopiert dann über einen Rückfall.
- **Lizenz:** Der Dienst nutzt Ice for JavaScript (GPL-2.0). Ein verteiltes Image ist als Gesamtwerk GPL-2.0 (ADR-0006).
