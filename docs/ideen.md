# Ruumble – Ideen für Erweiterungen

Stand: 28.09.2026 · Status: Sammlung. **D und E sind geplant** ([FEINPLANUNG.md](FEINPLANUNG.md), AP9 und AP10). Die übrigen Ideen brauchen eine Entscheidung, bevor sie geplant werden.

Grundlage ist die Analyse der Mumble-Schnittstellen ([analyse/mumble-schnittstellen.md](analyse/mumble-schnittstellen.md)). Alle Belege beziehen sich auf Mumble v1.5.735 bzw. v1.6.870.

---

## Was Mumble *nicht* hergibt

- **Chat lesen oder schreiben:** Die Plugin-API hat dafür weder Callbacks noch Funktionen. Über Ice ginge es nur mit dem Write-Secret (`addCallback` → `userTextMessage`). Ruumble hat das bewusst nicht (ADR-0002), und der Callback liefert **auch alle privaten Nachrichten** an den Dienst. Ruumble ergänzt Mumbles Chat deshalb, statt ihn zu ersetzen oder mitzulesen.
- **Knöpfe, Menüs oder anklickbare Links im Mumble-Client:** Die Plugin-API hat keine Oberfläche, und Protokollmeldungen des Plugins werden als reiner Text maskiert. Anklickbar ist nur, was vom Server kommt, z. B. die Willkommensnachricht.
- **Töne abspielen:** `playSample` gibt es erst ab Plugin-API 1.2, damit liefe das Plugin nicht mehr mit Mumble 1.4 (Fedora). Töne kommen deshalb aus dem Browser.

## Übersicht

| # | Idee | Nutzen | Eigener Speicher? | Aufwand | Status |
|---|---|---|---|---|---|
| **A** | Pinnwand je Raum: Text, Code, Bilder, Dateien | lange Texte, Quellcode, Bilder in voller Größe | **ja, erstmals** | L | Entscheidung offen (ADR-0011) |
| **B** | Status-Zeile („Im Termin bis 14 Uhr“) | Ansprechbarkeit sichtbar, auch in normalen Mumble-Clients | nein (Mumble-Kommentar) | S | Entscheidung offen |
| **C** | Anklopfen | höflich statt hineinplatzen | nein (flüchtig) | M | Entscheidung offen |
| **D** | Echte Avatare | schnelleres Wiedererkennen | nein (Zwischenspeicher im RAM) | S | **geplant (AP9)** |
| **E** | Still, abwesend und Aufnahme sichtbar | Anwesenheit und Transparenz | nein | S | **geplant (AP10)** |
| **F** | Mehr Steuerung: lokal stummschalten, Sendemodus, Sprechtaste | seltener zu Mumble wechseln | nein | S–M | Entscheidung offen |
| **G** | „Tür zu“ | ungestört arbeiten | nein (über B) | S | nach B und C |

---

## A – Pinnwand je Raum

**Idee:** Jeder Raum (und jeder Flur) bekommt eine Pinnwand als Seitenleiste neben dem Grundriss. Dort lassen sich posten:
- **Text mit Markdown**: Überschriften, Listen, Links, Tabellen.
- **Quellcode**: Blöcke mit Syntax-Hervorhebung, Zeilennummern und einem „Kopieren“-Knopf.
- **Bilder**: aus der Zwischenablage einfügen oder hineinziehen. Sie erscheinen als Vorschau, ein Klick öffnet die Vollbildansicht mit Zoom und Download.
- **Dateien** (optional): mit festem Größenlimit.

Beiträge sind **an den Raum gebunden**. Wer den Raum betritt, sieht, was dort liegt. Das ist die Gebäude-Metapher: die Pinnwand im Büro. Im Mumble-Protokoll der Anwesenden erscheint ein kurzer Hinweis, z. B. „Neuer Beitrag von Anna in ‚Büro von Anna‘ – in Ruumble ansehen“. Er kommt als `log`-Befehl an deren Plugins.

**Warum das der wertvollste Teil ist:** Mumbles Chat taugt nicht für längere Texte und Code. Bilder werden dort nur klein gezeigt und sind auf 128 KB begrenzt. Die Pinnwand schließt genau diese Lücke, ohne Mumble zu verändern.

### Der eigene Speicher: das ist der eigentliche Schritt

Bisher speichert Ruumble **nichts Inhaltliches**. Es liest Mumble, und nur die Geräte-Tokens liegen in `data/tokens.json`. Mit der Pinnwand wird der Dienst zum **Datenhalter**. Daraus folgen Anforderungen, die vor der Umsetzung entschieden sein müssen (ADR-0011):

| Thema | Frage | Vorschlag |
|---|---|---|
| **Ablage** | Datenbank oder Dateien? | **SQLite** im Volume `ruumble-data` für Beiträge und Metadaten. Bilder und Dateien liegen als Dateien daneben, benannt nach ihrem Inhalts-Hash (SHA-256), dadurch gibt es keine Doppelten. `node:sqlite` ist in Node 22 noch experimentell, deshalb `better-sqlite3` (natives Modul, für das Image unkritisch). |
| **Aufbewahrung** | Wie lange bleiben Beiträge? | Standard **30 Tage**, danach automatisch gelöscht. „Anpinnen“ hält einen Beitrag dauerhaft. Einstellbar pro Server (`RETENTION_DAYS`). |
| **Grenzen** | Wie viel darf gespeichert werden? | Bild bis 10 MB, Datei bis 25 MB, Beitragstext bis 100 KB, insgesamt z. B. 2 GB. Beim Überschreiten werden die ältesten nicht angepinnten Beiträge zuerst gelöscht. |
| **Sichtbarkeit** | Wer darf lesen? | Alle **gekoppelten** Nutzer, die den Raum **betreten dürfen** (`canEnter`, ADR-0003). Man muss nicht anwesend sein, damit man die Pinnwand eines Raums vorher ansehen kann. Räume ohne Zutrittsrecht bleiben verschlossen. |
| **Schreiben** | Wer darf posten? | Wer **im Raum ist**, wie im echten Büro. |
| **Löschen** | Wer darf löschen? | der Autor und Mumble-Admins (Ice `hasPermission(…, Write)` auf den Kanal) |
| **Identität** | Wer ist „Autor“? | Der Zertifikats-Hash des Plugins (ADR-0004), dazu der Name zum Zeitpunkt des Beitrags. Er ist stabil über Sessions hinweg. |
| **Sicherheit** | XSS durch Markdown oder HTML? | Markdown auf dem Server **und** im Browser bereinigen (Whitelist, kein rohes HTML), Bilder mit eigenem `Content-Type` ausliefern, `Content-Security-Policy` für die ganze Oberfläche. Dateien kommen immer als Download (`Content-Disposition: attachment`). |
| **Kanäle, die verschwinden** | Was passiert mit der Pinnwand eines gelöschten Kanals? | Die Beiträge bleiben 7 Tage zugänglich (für Admins), danach werden sie gelöscht. Temporäre Kanäle bekommen **keine** Pinnwand, ihre IDs werden wiederverwendet (S1). |
| **Sicherung** | Wie wird gesichert? | Das Volume `ruumble-data` sichern, SQLite im WAL-Modus. Dazu ein Befehl `ruumble backup`, der konsistent kopiert. |
| **Datenschutz** | Welche Daten fallen an? | Beitrag, Autor-Hash, Name und Zeitpunkt. Keine IP-Adressen. Nutzer können ihre eigenen Beiträge vollständig löschen. |
| **Protokoll** | Wie kommen die Daten in die Oberfläche? | Neue REST-Endpunkte für das Hochladen (Bilder und Dateien, nicht über WebSocket) sowie ein WebSocket-Ereignis `board` für Änderungen, damit Anwesende Beiträge sofort sehen. |

### Nötige Schritte
1. **ADR-0011 „Eigener Speicher für Pinnwand“** mit den Entscheidungen oben
2. `protocol`: Typen für Beitrag, Anhang und Pinnwand-Ereignis
3. `bridge`: Speichermodul (SQLite, Dateiablage nach Hash, Aufbewahrung und Aufräumen, Kontingente), REST-Endpunkte (Liste, Beitrag, Upload, Download, Löschen) mit Rechteprüfung, WebSocket-Ereignis, Bereinigung von Markdown, CSP-Header
4. `plugin`: neuer Befehl `notify`, der einen Text in das Mumble-Protokoll schreibt (für den Hinweis auf neue Beiträge)
5. `web`: Seitenleiste „Pinnwand“ je Raum, Editor mit Markdown-Vorschau, Einfügen aus der Zwischenablage, Code-Hervorhebung (z. B. Shiki), Vollbildansicht für Bilder, Zähler am Raum („3 Beiträge“)
6. Tests: Speicher (Aufbewahrung, Kontingente, Rechte), XSS-Fälle, Upload-Grenzen, E2E im Mock und im Live-Test
7. Betrieb: Sicherung des Volumes, Grenzwerte in `deploy/homeserver`

---

## B – Status-Zeile

**Idee:** In Ruumble setzt man einen kurzen Status, z. B. „Im Kundentermin bis 14 Uhr“ oder „Fokus – bitte nicht stören“, wahlweise aus Vorlagen und mit Ablaufzeit. Er erscheint unter dem Avatar im Grundriss und im Tooltip.

**Umsetzung ohne eigenen Speicher:** Der Status wird Teil des **Mumble-Kommentars** des Nutzers.
- Setzen: Plugin `requestSetLocalUserComment` (API 1.0).
- Lesen: Ice `User.comment` (liefert den vollständigen Text serverseitig, auch bei langen Kommentaren).
- Dadurch sehen ihn **auch normale Mumble-Clients**. Bei registrierten Nutzern speichert der Server den Kommentar dauerhaft.

**Knackpunkte:**
- Ein vorhandener Kommentar darf nicht überschrieben werden. Der Status steht deshalb als eigene, erkennbare Zeile am Anfang (z. B. `📍 Im Termin bis 14 Uhr`), der Rest bleibt erhalten.
- Den eigenen Kommentar liefert das Plugin wie bei den Kanalbeschreibungen nur, wenn er geladen ist (ab 128 Zeichen nur als Hash). Die Oberfläche bekommt ihn deshalb **von Ice** und schickt dem Plugin den **ganzen neuen Kommentar**.
- Die Ablaufzeit („bis 14 Uhr“) wertet der Dienst aus und entfernt den Status danach per Befehl an das Plugin.
- Die Größe ist durch `textmessagelength` begrenzt (Standard 5000 Zeichen).

**Nötige Schritte:**
1. `bridge`: `comment` aus Ice übernehmen, die Statuszeile herausziehen (Format zentral in `protocol`) und an die Oberfläche geben
2. `protocol`/`plugin`: Befehl `setComment{text}` → `requestSetLocalUserComment`
3. `web`: Status-Dialog (Vorlagen, eigener Text, Ablaufzeit), Anzeige am Avatar
4. `bridge`: Ablaufzeiten überwachen und abgelaufene Status entfernen
5. Tests: Kommentar mit und ohne vorhandenen Text, HTML-Kommentare aus Mumble, Ablauf

---

## C – Anklopfen

**Idee:** An einem fremden Büro erscheint „Anklopfen“. Die Anwesenden bekommen in Ruumble eine Meldung mit Ton: „Ben klopft an – [Hereinbitten] [Gleich] [Später]“. Parallel steht ein Hinweis im Mumble-Protokoll. „Hereinbitten“ lässt Ben automatisch eintreten, „Gleich“ oder „Später“ schickt ihm eine kurze Antwort.

**Umsetzung ohne eigenen Speicher:** Der Dienst verbindet ohnehin die Oberflächen aller gekoppelten Nutzer.
- Das Anklopfen läuft **über den Dienst**, flüchtig und nur im Speicher mit Ablauf nach 60 s.
- Die Plugin-zu-Plugin-Nachrichten von Mumble (`sendData`, 1000 Byte, 4 pro Sekunde) sind dafür nicht nötig. Sie würden nur funktionieren, wenn beide Seiten das Plugin haben, und sind stärker begrenzt.
- Für den Hinweis im Mumble-Protokoll bekommt das Plugin den Befehl `notify` (wie bei A).

**Nötige Schritte:**
1. `protocol`: Nachrichten `knock` (Oberfläche → Dienst), `knocked` (Dienst → Oberflächen im Raum), `knockReply` und das Ergebnis
2. `bridge`: Zustellen an alle gekoppelten Anwesenden des Zielraums, Ablauf nach 60 s, Missbrauchsschutz (z. B. höchstens 1 Klopfen pro Raum und 30 s)
3. `plugin`: Befehl `notify` → `log`
4. `web`: Knopf „Anklopfen“ am Raum, Meldung mit Ton (aus dem Browser) und Antwortknöpfen, „Hereinbitten“ löst beim Anklopfenden einen `join` aus
5. Tests: Zustellung nur an Anwesende, Ablauf, Missbrauchsschutz, Live-Test mit zwei Clients

---

## D – Echte Avatare → geplant als AP9

**Idee:** Statt Initialen zeigt Ruumble das Avatarbild, das der Nutzer in Mumble hinterlegt hat (*Selbst → Avatar ändern*). Ohne Bild bleibt es bei den Initialen.

**Befunde (Mumble-Code):**
- Ice `getTexture(userid)` ist mit dem Read-Secret erlaubt, aber **nur für registrierte Nutzer** (Nutzer-ID ≥ 0). Unregistrierte behalten die Initialen.
- Aktuelle Clients laden **Bilddateien** hoch (PNG, JPEG usw.). Das alte Format (600×60 BGRA, zlib) kommt nur noch von sehr alten Clients (`Overlay.cpp:356`).
- Grenze: `imagemessagelength`, Standard 128 KB (`Meta.cpp:61`).
- Ice meldet keine Änderung am Bild. Der Dienst fragt deshalb in Abständen ab und vergleicht einen Hash.

**Eigener Speicher:** nein, nur ein Zwischenspeicher im Arbeitsspeicher (Hash → Bild).

## E – Still, abwesend und Aufnahme sichtbar → geplant als AP10

**Idee:** Man sieht, wer gerade wirklich da ist, und ob jemand aufzeichnet.

**Befunde (Mumble-Code):**
- Ice `User.idlesecs` zählt **nur die Zeit seit dem letzten Sprechen**, andere Aktivität nicht (`MumbleServer.ice:84`). Wer still zuhört, ist dadurch nicht „abwesend“. Ruumble unterscheidet deshalb:
  - **still**: nach 15 Minuten ohne Sprechen. Der Avatar wird leicht blasser, der Tooltip sagt „hat seit 25 Min. nicht gesprochen“.
  - **abwesend**: selbst taub und mindestens 5 Minuten still. Der Avatar ist deutlich blass, der Tooltip sagt „abwesend“.
- Ice `User.recording` zeigt, dass jemand aufzeichnet. Ruumble zeigt dann einen roten Punkt am Avatar und einen Hinweis am Raum („Hier wird aufgezeichnet“).

**Eigener Speicher:** nein.

---

## F – Mehr Steuerung in der Oberfläche

**Idee:** Häufige Mumble-Handgriffe direkt in Ruumble:
1. **Jemanden nur für mich stummschalten**, z. B. bei lauter Umgebung: Kontextmenü am Avatar, „Für mich stumm“. Andere hören die Person weiter, wie in Mumble. Plugin: `requestLocalMute(user, on)`, Zustand über `isUserLocallyMuted`.
2. **Sendemodus umschalten**: dauerhaft senden, Sprachaktivierung oder Push-to-Talk, als Auswahl im Benutzermenü. Plugin: `requestLocalUserTransmissionMode`, `getLocalUserTransmissionMode`.
3. **Sprechtaste in Ruumble**, für Push-to-Talk: Solange man den Knopf (oder die Leertaste im Ruumble-Fenster) hält, sendet Mumble. Plugin: `requestMicrophoneActivationOverwrite(true/false)`. Die Laufzeit über WebSocket liegt im Heimnetz deutlich unter 100 ms.
4. **Einstellungen-Knopf** (E29) sinnvoll belegen: Sendemodus, „Oberfläche bei jedem Verbinden öffnen“ (Option in `plugin.json`), Kopplung dieses Geräts aufheben (`/logout`).

**Eigener Speicher:** nein. Das Plugin meldet die lokalen Zustände (lokal Stummgeschaltete, Sendemodus) im `selfState`.

**Knackpunkte:**
- Lokales Stummschalten gilt nur für den eigenen Client. Die Oberfläche kennzeichnet das deutlich, damit man es nicht für ein Server-Mute hält.
- Bei der Sprechtaste muss das Loslassen zuverlässig ankommen, auch wenn das Fenster den Fokus verliert. Deshalb schickt die Oberfläche beim Loslassen, bei Fokusverlust und bei Verbindungsabbruch ein „aus“. Das Plugin schaltet zusätzlich nach 60 s ohne Signal selbst ab.

**Nötige Schritte:**
1. `protocol`: Befehle `localMute{session,on}`, `transmissionMode{mode}`, `ptt{on}`. `selfState` wird um `localMuted[]` und `transmissionMode` erweitert.
2. `plugin`: Befehle ausführen, Zustände melden, Sicherheitsabschaltung bei der Sprechtaste
3. `web`: Kontextmenü am Avatar, Auswahl im Benutzermenü, Sprechtaste, Einstellungsdialog
4. Tests: Unit-Tests im Plugin, E2E im Mock, Live-Test (lokal stumm, Sendemodus, Sprechtaste)

---

## G – „Tür zu“

Das eigene Büro erscheint als geschlossene Tür. Wer hinein will, klopft an (C). Technisch ist das ein Kennzeichen in der Statuszeile (B), die Oberfläche zeigt dann das Anklopfen statt „betreten“. Mumbles eigene Rechte bleiben unverändert, man kann also trotzdem hinein. Es ist eine Bitte, keine Sperre.
