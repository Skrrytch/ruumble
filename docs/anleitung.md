# Anleitung für Nutzer

Ruumble zeigt deinen Mumble-Server als Bürogebäude im Browser. Du siehst, wer wo sitzt, wechselst den Kanal per Klick und kannst in jedem Raum etwas an die Pinnwand heften. Gesprochen wird weiter über deinen normalen Mumble-Client.

## Voraussetzungen

- **Linux** mit dem Mumble-Client **ab Version 1.4** (aus der Paketverwaltung deiner Distribution). Für Windows und macOS gibt es das Plugin noch nicht.
- Ein Mumble-Server, auf dem Ruumble eingerichtet ist. Das erkennst du an einer Zeile `ruumble: …` in der Beschreibung des obersten Kanals oder an einem Link in der Begrüßung beim Verbinden.
- Ein aktueller Browser (Firefox, Chrome, Edge).

## Einrichten (einmalig)

### 1. Plugin herunterladen

Öffne die Adresse des Ruumble-Dienstes im Browser und lade dort das Plugin herunter (`…/download`, die Datei heißt `ruumble-<version>.mumble_plugin`). Die Adresse steht in der Beschreibung des obersten Kanals, z. B. `ruumble: http://192.0.2.10:8080`, oder du bekommst sie vom Betreiber des Servers.

### 2. Plugin in Mumble installieren

| Mumble auf Deutsch | Mumble auf Englisch |
|---|---|
| **Konfigurieren → Einstellungen → Plugins** | **Configure → Settings → Plugins** |
| Schaltfläche **„Installiere Plugin …“**, die Datei wählen, mit **Ja** bestätigen | **„Install plugin…“**, choose the file, confirm with **Yes** |
| In der Liste bei **Ruumble** den Haken in der Spalte **„Aktivieren“** setzen, dann **OK** | Tick **„Enable“** next to **Ruumble**, then **OK** |

### 3. Verbinden und koppeln

Verbinde dich wie gewohnt mit dem Server. Beim ersten Mal öffnet das Plugin deinen Browser mit einem **Kopplungslink**. Damit weiß Ruumble, dass dieser Browser zu deinem Mumble gehört. Danach öffnest du Ruumble einfach über die Adresse des Dienstes; der Browser bleibt gekoppelt.

Steht im Mumble-Protokoll „Fahre einmal mit der Maus über den obersten Kanal …“, ist die Kanalbeschreibung zu lang für eine automatische Übertragung. Einmal mit der Maus über den obersten Kanal fahren genügt, dann verbindet sich das Plugin.

## Bedienung

- **Aufzug (links):** eine Taste je Etage. Gesperrte Etagen (zu tief verschachtelt oder mehr als 8 Räume) sind ausgegraut; dort hilft nur die klassische Ansicht in Mumble.
- **Räume und Flur:** Ein Klick auf einen Raum oder den Flur wechselt deinen Kanal. Dein Raum ist hellblau, dein Avatar hat einen gelben Ring.
- **Symbole an Personen:** stumm, taub, „still“ (spricht seit 15 Minuten nicht), „abwesend“ (taub und 5 Minuten still). Ein Ohr am Raum heißt: jemand hört mit. „● Aufnahme“ heißt: dort wird aufgezeichnet.
- **Benutzerbereich (unten links):** Mikrofon stumm, taub, zurück zur eigenen Etage.

### Pinnwand

- Die **zwei Zettel oben rechts in deinem Raum** blenden die Pinnwand ein und aus. Es gibt sie nur in Räumen, nicht im Flur oder im Eingang.
- Sehen und bearbeiten kann sie jeder, **der gerade im Raum ist**. Löschen dürfen der Verfasser und Mumble-Admins.
- **Text** mit Markdown (`**fett**`, Listen, Links), **Code** über das Symbol `<>` (beim Einfügen von Quelltext schlägt Ruumble das selbst vor), **Bilder und Dateien** bis 10 MB über die Büroklammer, per Strg+V oder durch Hineinziehen.
- Senden mit dem Papierflieger oder **Strg+Enter**. Die anderen im Raum sehen im Mumble-Protokoll einen kurzen Hinweis.
- Beiträge bleiben 30 Tage.

## Fragen und Probleme

| Problem | Lösung |
|---|---|
| „Dieses Gerät ist noch nicht gekoppelt.“ | Der Browser kennt dich noch nicht. Mumble mit aktiviertem Plugin starten und verbinden; beim ersten Mal öffnet sich der Kopplungslink. |
| Einen **weiteren Browser** oder Rechner koppeln | Das Plugin öffnet den Kopplungslink nur einmal je Server. In `~/.config/ruumble/plugin.json` die Adresse aus `pairedWith` entfernen und neu verbinden. |
| „Mumble ist nicht verbunden.“ | Mumble läuft nicht, ist nicht mit dem Server verbunden oder das Plugin ist nicht aktiviert (Schritt 2). |
| Das Plugin findet den Dienst nicht | Im Mumble-Protokoll nachsehen (Zeilen mit „Ruumble:“). Die Adresse lässt sich in `~/.config/ruumble/plugin.json` mit `"bridgeUrl": "http://…"` fest vorgeben. |
| Klick auf einen Raum tut nichts | Dir fehlt in Mumble das Recht, den Kanal zu betreten; Ruumble zeigt dann einen Hinweis. |
| Plugin aktualisieren | Neue Datei herunterladen und wie in Schritt 2 installieren (vorhandenes überschreiben). |

### Einstellungen des Plugins

`~/.config/ruumble/plugin.json` (bzw. `$XDG_CONFIG_HOME/ruumble/plugin.json`):

| Feld | Bedeutung |
|---|---|
| `bridgeUrl` | Adresse des Dienstes fest vorgeben, statt sie aus der Kanalbeschreibung zu lesen |
| `autoOpen` | `false`: den Kopplungslink nicht automatisch im Browser öffnen |
| `pairedWith` | Dienste, mit denen dieser Rechner schon gekoppelt ist (verwaltet das Plugin selbst) |
