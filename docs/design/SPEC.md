> **Hinweis:** Das ist die ursprüngliche Designspezifikation (neutralisiert). Wo sie abweicht, gilt [`../PLANUNG.md`](../PLANUNG.md), vor allem bei tieferen Ebenen, Sortierung, Label „primary“, Schrift und Icons.

# Spezifikation: Mumble-Bürogebäude (Etagenansicht)

Grafische Oberfläche für einen Mumble-Server, die den Kanalbaum als Bürogebäude darstellt. Nutzer sehen, wer wo sitzt, und wechseln den Kanal per Klick auf einen Raum.

Visuelle Referenz: `prototype/index.html` (lauffähig, pixelgenau zum Design). Tokens: `tokens.css`.

---

## 1. Abbildung Kanalbaum → Gebäude

| Mumble                       | Gebäude                   | Regel                                                                                                                                                                   |
| ---------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root-Kanal (z. B. „Musterhaus“) | Gebäude                   | Name erscheint als Gebäudeschild im Aufzugskern                                                                                                                         |
| Kanäle der 1. Ebene          | Etagen                    | Reihenfolge nach `position`, dann Name. Index 0 = „EG“ / „Erdgeschoss“, danach „1“ / „1. Obergeschoss“ usw.                                                             |
| Kanäle der 2. Ebene          | Räume (Büros) einer Etage | Reihenfolge nach `position`, dann Name                                                                                                                                  |
| Etagenkanal selbst           | **Flur**                  | Nutzer, die direkt im Etagenkanal sind (nicht in einem Unterraum), stehen im Flur. Der Flur ist **immer betretbar**. Ein Kanal namens „Flur“ hat keine Sonderbedeutung. |
| Kanäle ab der 3. Ebene       | –                         | führen zu einer Sperre der Etage (siehe feinkonzeption)                                                                                                                 |

Sonderfälle:

- **Etage ohne Unterkanäle** (z. B. „Lobby“): wird als ein großer offener Raum dargestellt, der dem Etagenkanal entspricht.
- **Raumname enthält „(stumm)“** (Groß-/Kleinschreibung egal): Lautsprecher-aus-Symbol neben dem Namen. Rein visuell.

## 2. Layout

Feste Referenzgröße 1440 × 900 px (Desktop). Aufbau von oben nach unten:

1. **Kopfzeile**: Kicker mit Geschossbezeichnung (15 px, Blau 500), H1 Etagenname (40 px, Bold, −0,02 em), Zusammenfassung „N Personen auf dieser Etage · M Räume“. Rechts: Hinweis „Klick auf einen Raum wechselt den Kanal. / Etagenwechsel über den Aufzug · N online“.
2. **Grundriss** (Höhe 670 px): Hintergrund Dunkelblau mit 4 px Padding und 4 px Gap. Die Lücken bilden die **Wände**.
   - **Aufzugskern** links, 300 px breit, Hintergrund Grau (`--color-surface`). Hat eine 110 px hohe Öffnung zum Flur (auf Flurhöhe, `top: 276px`).
   - **Etagenfläche** rechts: obere Raumreihe (272 px), Flur (110 px), untere Raumreihe (272 px).

### Raumaufteilung (dynamisch)

- Räume der Etage (ohne Etagenkanal) werden geteilt: `top = rooms[0 .. ceil(n/2)]`, `bottom = Rest`.
- Breite je Raum nach seinem Rang in der Mumble-Reihenfolge (E31): Raum 1 und 2 `flex-grow` 1,3, danach schrittweise kleiner (1,1; 1,05; … bis 0,85). Die großen Räume stehen so immer oben links.
- Aufteilung: oben `⌊n/2⌋` Räume (mindestens 1), der Rest unten. Die untere Reihe hat bei ungerader Anzahl also einen Raum mehr.
- Etagen mit 1–2 Räumen: Ist die Pinnwand offen, teilen sich Grundriss und Pinnwand die Breite.
- Jeder Raum hat eine **Tür** zum Flur: eine 48 px breite Lücke in der Wand (weißes 4 px-Element über der Wandfuge), 28 px vom linken Raumrand, plus Türbogen (Viertelkreis, 1,5 px, Blau 300). Die obere Reihe hat die Tür unten, die untere Reihe oben (gespiegelt). Die untere Reihe hat `padding-top: 56px`, damit der Bogen den Text nicht überdeckt.
- Flur: Hintergrundraster (Punkte `#E3E3E3`, Radius 2 px, Abstand 10 px auf Weiß).

## 3. Aufzugskern (Navigation + Benutzermenü)

Von oben nach unten:

1. **Gebäudeschild**: Servername (20 px Bold), darunter „Mumble-Server · <Label>“.
2. **Aufzug-Panel** (`<nav aria-label="Aufzug – Etagen">`): Verlauf (`--gradient-elevator`), 4 px Radius. Kopf mit Aufzug-Icon, „Aufzug“ und „Etage <Badge>“ der angezeigten Etage.
   - Eine Taste pro Etage, **höchste Etage oben** (umgekehrte Reihenfolge).
   - Taste: runder Badge (40 px) mit „EG“/Zahl, Etagenname, „N online“.
   - Die angezeigte Etage wird hervorgehoben (weißer Hintergrund, gefüllter Badge) und hat `aria-current="page"`.
   - **Kein** Marker „Du“ für die eigene Etage.
3. **Benutzermenü** (unten, `margin-top: auto`):
   - Eigener Avatar + Name + „<Raumname> · Etage <Badge>“.
   - Werkzeugleiste (`role="toolbar"`), 44 × 44 px Knöpfe:
     - **Mikrofon stumm** (Toggle, `aria-pressed`)
     - **Taub** (Toggle, `aria-pressed`): Taub schaltet auch stumm. Wird „stumm“ bei aktivem „taub“ gedrückt, heben sich beide auf (Mumble-Verhalten).
     - **Zu meiner Etage**: springt mit der Ansicht auf die Etage des eigenen Kanals.
     - **Einstellungen**: Platzhalter, noch ohne Funktion.
   - Aktiv-Zustand eines Toggles: Dunkelblau gefüllt, Icon weiß mit Durchstrich.
   - Versionszeile: „Server <Version>“ links, „Oberfläche <Version>“ rechts (12 px).

## 4. Räume & Personen

- Raum = `<button>` mit Titel (16 px Bold), Belegung („frei“ / „1 Person“ / „N Personen“, 13 px Blau 700) und Avataren.
- Avatar: Kreis 44 px, Initialen = die ersten 2 Zeichen des Namens, Name darunter (13 px). Fremde Nutzer: Blau 500 (#0078BE) mit weißer Schrift. **Eigener Nutzer**: Dunkelblau mit 3 px **gelbem Ring**. Das ist das einzige gelbe Element (Regel: Gelb sparsam).
- Ist ein Nutzer stumm oder taub, zeigt ein kleines weißes Badge unten rechts am Avatar ein durchgestrichenes Mikrofon.
- **Eigener Raum**: Hintergrund Blau 100 (#CEE4F8), kein Hover, `cursor: default`. **Kein** Label „Du bist hier“ (nur im `aria-label`).
- Hover auf fremde Räume: Grau. Fokus: 3 px Ring in Mittelblau, nach innen versetzt.

## 5. Interaktionen

| Aktion                               | Wirkung                                                                      |
| ------------------------------------ | ---------------------------------------------------------------------------- |
| Klick auf Raum / Flur / offene Etage | eigener Nutzer wechselt in diesen Kanal (Klick auf den eigenen Raum: nichts) |
| Klick auf Etagentaste                | nur die **Ansicht** wechselt, der Kanal bleibt                               |
| „Zu meiner Etage“                    | Ansicht → Etage des eigenen Kanals                                           |
| Stumm / Taub                         | Self-Mute / Self-Deaf setzen                                                 |
| Beim Start                           | Es wird die Etage des eigenen Kanals angezeigt                               |

Live-Updates: Kanal- und Nutzeränderungen (Join/Leave/Move/Mute, neue oder umbenannte Kanäle) müssen sofort neu gerendert werden. Die Aufteilung der Räume ergibt sich aus den Daten und wird nie gespeichert.

Motion: Übergänge 160 ms, `cubic-bezier(0.22, 1, 0.36, 1)`. Keine Bounces.

## 6. Datenmodell (Frontend)

Siehe `prototype/mock-data.json`. Minimal benötigt:

```ts
type Channel = { id: number; parent: number | null; name: string; position: number };
type User = { session: number; name: string; channel: number; selfMute: boolean; selfDeaf: boolean };
type Snapshot = { server: { name: string; label: string; version: string }; self: { session: number }; channels: Channel[]; users: User[] };
```

Die Ableitungen (Etagen, Räume, Belegung, Breiten) sind reine Funktionen. Sie sind im Prototyp unter „Ableitung Gebäude aus Kanalbaum“ zu finden und sollten 1:1 übernommen und unit-getestet werden.

## 7. Barrierefreiheit

- Alle klickbaren Flächen sind echte `<button>` mit sprechendem `aria-label` („Büro von Clara betreten“, „Flur ENTWICKLUNG betreten“, „… – du bist hier“).
- Etagennavigation als `<nav>`, aktive Etage mit `aria-current="page"`. Toggles mit `aria-pressed`.
- Kontrast: Sekundärtext in Blau 700 (#00508C) auf Weiß/Grau ≥ 4,5:1. Keine Information nur über Farbe.
- Touch-Ziele ≥ 44 px.

## 8. Design-Regeln

- Schrift: Inter, Fallback Arial. Überschriften Bold, keine Versalien, keine Emojis.
- Farben nur aus `tokens.css`. Gelb nur für den Ring um den eigenen Avatar.
- Radien: 0 für Räume/Wände, 4 px für Panels/Knöpfe, rund nur für Avatare/Badges.
- Icons: Linien-Icons, 2 px Strich. Die Icons im Prototyp sind Platzhalter nach Spezifikation und werden durch Lucide ersetzt.

## 9. Offene Entscheidungen (vor der Umsetzung klären)

1. **Anbindung an Mumble**: Die Oberfläche braucht Live-Daten und muss den eigenen Nutzer verschieben können. Mögliche Wege: ein eigener Mumble-Client im Browser (Web-Client mit WebSocket-Proxy) oder ein Backend, das über die Server-Admin-Schnittstelle von Murmur/Mumble-Server Zustand liest und setzt. Dazu kommt die Frage, ob die Oberfläche **selbst Audio** macht oder nur den Desktop-Client „fernsteuert“.
2. **Identität**: Woher kennt die Oberfläche den eigenen Nutzer (`self.session`)? Das hängt von 1. ab.
3. **Tech-Stack** des Frontends (Framework, Build).
4. **Responsiveness**: Das Design ist für 1440 × 900 ausgelegt. Es fehlt ein Verhalten für kleinere Fenster und für Etagen mit vielen Räumen (z. B. > 10: Reihen scrollen oder mehrere Flure).
5. **Kanäle ab der 3. Ebene**: aktuell ignoriert. Optionen: als Nutzer des übergeordneten Raums zählen oder als Unterbereich im Raum zeigen.
6. **Einstellungen**: Inhalt des Menüs.
7. **Versionsnummern**: Quelle für die Server-Version (aus dem Handshake) und die UI-Version (aus dem Build).
