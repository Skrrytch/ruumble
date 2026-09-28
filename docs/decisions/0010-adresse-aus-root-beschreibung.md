# ADR-0010: Adresse des Dienstes aus der Root-Beschreibung

Status: angenommen (28.09.2026)

## Kontext
Das Plugin muss wissen, unter welcher Adresse der Ruumble-Dienst läuft. Die Plugin-API liefert aber keine Serveradresse, nicht einmal den Hostnamen der Mumble-Verbindung, nur einen Hash des Server-Zertifikats. Bisher stand die Adresse beim Build fest im Plugin. Dann bräuchte jede Installation ein eigenes Plugin, und mehrere Mumble-Server wären nicht möglich.

## Optionen
1. Adresse beim Build fest eintragen (bisher)
2. Nur `~/.config/ruumble/plugin.json`, von jedem Nutzer von Hand gepflegt
3. **Der Server nennt die Adresse in der Beschreibung des Root-Kanals**, das Plugin liest sie mit `getChannelDescription`.
4. Erkennung im lokalen Netz (DNS-SD/mDNS): aufwendig, und über VPN klappt es nicht

## Entscheidung
Option 3, dazu `plugin.json` als Übersteuerung:
- **Format:** Eine Zeile der Root-Beschreibung *endet* auf `ruumble: <adresse>`. Davor darf beliebiger Text stehen, z. B. `- `. Mumble speichert Beschreibungen als HTML: Tags werden entfernt, `<br>` und Absatzenden werden zu Zeilen, Entities werden aufgelöst. Fehlt das Schema, wird `http://` ergänzt. Erlaubt sind nur http und https. Die erste passende Zeile gilt.
- **Vorrang:** `bridgeUrl` in `plugin.json`, dann die Root-Beschreibung. Ohne passende Zeile bleibt das Plugin auf diesem Server still.
- **Zeitpunkt:** bei jedem Sync. Trennt Mumble die Verbindung, trennt sich auch das Plugin vom Dienst. Ein anderer Server kann einen anderen Dienst nennen.
- **Kopplung je Dienst:** `pairedWith` in `plugin.json` statt eines einzelnen `paired`. Der ältere Wert `"paired": true` gilt für eine feste `bridgeUrl` weiter.

## Einschränkung (im Mumble-Code und live geprüft)
Beschreibungen **ab 128 Zeichen** schickt der Server nur als Hash (`Server::hashAssign`, `Messages.cpp`). Der Client lädt den Text erst, wenn ein Nutzer ihn ansieht, also beim Tooltip über dem Kanal oder beim Bearbeiten. Bis dahin liefert die API `MUMBLE_EC_UNSYNCHRONIZED_BLOB`. Der Client speichert den Text danach dauerhaft zwischen.
- Kürzere Beschreibungen funktionieren sofort. Im HTML-Editor von Mumble wird eine Beschreibung aber leicht länger als der sichtbare Text.
- Bei langer Beschreibung schreibt das Plugin einmal einen Hinweis ins Mumble-Protokoll (*„Fahre einmal mit der Maus über den obersten Kanal „<Servername>“ …“*) und prüft alle 3 s erneut. Der Kanal heißt im Client wie der `registername`, nicht „Root“.

## Konsequenzen
- **Ein Plugin für alle Server**, ohne Build pro Installation. Die CMake-Option `RUUMBLE_DEFAULT_BRIDGE_URL` entfällt.
- Die Zeile ist in der Root-Beschreibung für alle sichtbar. Das ist unkritisch, weil der Dienst ohnehin nur im Heimnetz oder VPN erreichbar ist.
- Leichte Abweichung von L3: Ruumble liest außer der Kanalstruktur eine technische Angabe. Die Darstellung bleibt davon unberührt.
- Live-Test: Kurze Beschreibung → sofort gekoppelt. Lange Beschreibung → erst nach einem Hover, dann gekoppelt (`web/e2e-live`).
