# ADR-0011: Eigener Speicher für die Pinnwand

Status: angenommen (28.09.2026)

## Kontext
Die Pinnwand (Idee A) ist der erste Teil von Ruumble, der **selbst Inhalte speichert**. Bisher liest der Dienst Mumble nur und hält lediglich Geräte-Tokens. Die Beiträge (Text, Code, Bilder, Dateien) müssen dauerhaft, begrenzt und zugriffsgeschützt abgelegt werden.

## Entscheidung

| Thema | Entscheidung |
|---|---|
| **Wo gibt es Pinnwände?** | **Nur in Räumen**, also auf der 2. Ebene. Eingang, Flure und offene Etagen haben keine. Temporäre Kanäle auch nicht, weil ihre IDs wiederverwendet werden (S1). |
| **Ablage** | **SQLite** (`better-sqlite3`, WAL-Modus) unter `data/board.sqlite` für Beiträge und Metadaten. Anhänge liegen als Dateien unter `data/board/<hash[0..2]>/<sha256>`, doppelte gibt es dadurch nicht. |
| **Lesen** | Gekoppelte Nutzer, die **gerade im Raum anwesend** sind |
| **Schreiben** | Wer im Raum anwesend ist |
| **Bearbeiten** | **Alle Anwesenden**. Am Beitrag steht „zuletzt bearbeitet von …“. Einen Versionsverlauf gibt es nicht. |
| **Löschen** | Der Autor und Mumble-Admins (`hasPermission(session, channel, Write)`) |
| **Aufbewahrung** | **30 Tage** ab Erstellung, danach automatisch gelöscht, samt Anhängen (`RETENTION_DAYS`) |
| **Grenzen** | **Bilder und Dateien bis 10 MB**, Text bis 100 KB, insgesamt 2 GB (`BOARD_QUOTA_MB`) |
| **Speicher voll** | **Die ältesten Beiträge werden zuerst gelöscht**, samt Anhängen, bis wieder Platz ist |
| **Kanal gelöscht** | Die Beiträge bleiben 7 Tage für Admins zugänglich, danach werden sie gelöscht. |
| **Anzeige im Grundriss** | **Kein Zähler**, sondern eine Pinnwand-Grafik: **Variante B mit zwei Zetteln** (Entwürfe: `docs/design/pinnwand-varianten.html`), rechtsbündig oben im Raum, immer gleich, egal wie viele Beiträge hängen. **Die Grafik ist zugleich der Schalter:** Ein Klick im eigenen Raum blendet die Seitenleiste ein oder aus, **zu Beginn ist sie ausgeblendet**. Im eigenen Raum ist sie immer gleich kräftig sichtbar, auch ohne Beiträge, und ohne Kasten: Dort zeigt sie nicht den Inhalt an, sondern ist nur der Schalter (Änderung 28.09.2026). In fremden Räumen erscheint sie nicht (Änderung 28.09.2026), der Inhalt bleibt ohnehin den Anwesenden vorbehalten. Der Snapshot enthält deshalb keine Liste der Räume mit Beiträgen mehr. |
| **Hinweis in Mumble** | „Neuer Beitrag von X in ‚Raum‘ – in Ruumble ansehen“ als Protokollmeldung bei den Anwesenden außer dem Autor (Plugin-Befehl `notify`) |
| **Autor** | Zertifikats-Hash (stabil) und Name zum Zeitpunkt des Beitrags. Den Hash gibt der Dienst nie heraus, die Oberfläche bekommt nur `name` und `mine`. |
| **Sicherheit** | Der Dienst speichert Markdown als **Rohtext** und erzeugt nie HTML. Die Oberfläche rendert mit markdown-it (`html: false`) und bereinigt mit DOMPurify. Content-Security-Policy für die ganze Oberfläche. Bilder mit geprüftem `Content-Type` und `nosniff`, Dateien immer als Download (`Content-Disposition: attachment`). |
| **Datenschutz** | Gespeichert werden Beitrag, Autor-Hash, Name und Zeitpunkte, keine IP-Adressen. Nutzer löschen ihre eigenen Beiträge vollständig. |
| **Sicherung** | Das Volume `ruumble-data` sichern. `node dist/main.mjs backup <ziel>` kopiert konsistent (SQLite-Backup-API). |

## Verworfene Optionen
- **Beiträge im Mumble-Chat oder in Kanalbeschreibungen:** Dafür bräuchte der Dienst das Write-Secret (ADR-0002). Außerdem sind die Grenzen dort viel zu klein (Bilder 128 KB, Text 5000 Zeichen).
- **Nur Dateien, ohne Datenbank:** Mehrere Personen schreiben gleichzeitig, und Aufbewahrung, Kontingent und Rechte müssen abgefragt werden. Das wird mit einzelnen Dateien schnell fehleranfällig.
- **`node:sqlite`:** in Node 22 noch experimentell

## Konsequenzen
- Der Dienst wird **zum Datenhalter**. Damit werden eine Sicherung und das Löschen nach Frist zur Pflicht (Aufräumlauf stündlich).
- `better-sqlite3` ist ein natives Modul. Im Image wird es für die Zielplattform installiert (vorgebaute Binärdateien, sonst Build-Werkzeuge in der Build-Stufe).
- Das Protokoll wächst: REST für Beiträge und Uploads, das WebSocket-Ereignis `board` an die Anwesenden eines Raums und `notify` an deren Plugins (Hinweis im Mumble-Protokoll). Eine Liste der Räume mit Beiträgen im Snapshot gab es anfangs, sie ist entfallen.
