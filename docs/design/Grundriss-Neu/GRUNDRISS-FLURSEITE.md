# Ruumble · Grundriss: Raumbeschriftung auf der Flurseite (Variante A)

Ziel: Räume so flach wie möglich halten und trotzdem **zwei Reihen Personen** je Raum zeigen. Der Türschwung soll keinen eigenen Platz mehr kosten.

Referenz: `reference/4-grundriss-a.html` (statisches HTML/CSS, im Browser öffnen). Namen und Personen darin sind Beispieldaten.

## Grundidee

Jeder Raum hat eine **Flurseite** (die Wand zum Flur) und eine **ferne Seite**.

- Obere Raumreihe: Flurseite = unten.
- Untere Raumreihe: Flurseite = oben. Alles wird gespiegelt.

An der Flurseite liegt ein 48 px hoher **Türstreifen**, der alles außer den Personen aufnimmt:

```
ferne Wand ─────────────────────────────────────────────────
│  (Su)(An)(Be)(Ca)(Da)                                     │  ← Personen, Reihe 1
│  (Em)(Fr)(Gr)(Ha)                                         │  ← Personen, Reihe 2
│ 🌱 │╲                              [Pinnwand]  Bert         │  ← Türstreifen (48 px)
│    │ ╲                                       9 Personen   │
Flurwand ════  ═══════════════════════════════════════════════
         ↑ Türöffnung
```

Von links nach rechts im Türstreifen:

1. **Pflanze (Raumpflege)** in der Ecke zwischen Seitenwand und Türangel, also „hinter der offenen Tür“: x = 4–34 px, Schaltfläche 30×32, Grafik 22×24.
2. **Tür:** Angel bei x = 36 px ab linker Raumwand. Die Öffnung in der Flurwand ist 44 px breit. Das Türblatt steht senkrecht zur Flurwand im Raum (44 px lang), der Schwenkbogen hat 44 px Radius.
3. **Rechtsbündig mit 14 px Abstand zur rechten Wand und 8 px zur Flurwand:** [Pinnwand-Symbol] dann das Türschild aus **Name** (15/700) und darunter **Status** (12, `#00508C`), beide rechtsbündig. Abstand Pinnwand ↔ Schild: 10 px.

Die **Personen** füllen den Rest von der fernen Wand her: 12 px Abstand zur fernen Wand, 14 px links/rechts, Reihen von links nach rechts.

## Maße und Raumhöhe

| Größe | Wert |
|---|---|
| Wandstärke | 4 px, `#003869` |
| Türstreifen | 48 px (= Türbreite 44 + 4) |
| Abstand Personen ↔ Türstreifen | 8 px |
| Abstand Personen ↔ ferne Wand | 12 px |
| Avatar-Kachel | Breite 60, Kreis wie heute + 3 px + Namenszeile 16 px |
| Reihenabstand | 6 px, Spaltenabstand 3 px |

Raumhöhe:

```
H = 12 + 2 × Kachelhöhe + 6 + 8 + 48
```

- Bei 44-px-Avatar (Kachel 63): **H = 200** (Referenz nutzt 204).
- Bei 48-px-Avatar (Kachel 67): **H = 208**.

Heute sind es ca. 270 px.

Alle Räume einer Raumreihe haben dieselbe Höhe. Passen mehr Personen hinein, als zwei Reihen fassen, wird die letzte Kachel zu einem „+n“-Plättchen (gleiche Größe wie ein Avatar, Grund `#EEF5FC`, Text `#003869`, fett). Ein Klick oder Hover darauf zeigt die übrigen Namen. Das ist ein Vorschlag, eine Alternative wäre ein Scrollbereich.

Die Raumbreite bleibt frei (auch unterschiedlich breite Räume wie heute). Alle Positionen sind relativ zur linken Wand bzw. zur Flurwand des jeweiligen Raums.

## Spiegelung (untere Reihe)

- Türstreifen oben, Personen darunter (Personenbereich endet 12 px über der fernen Wand und beginnt bei 4 + 48 + 8 px).
- Tür: dasselbe SVG mit `transform: scaleY(-1)`, an der oberen Raumkante.
- Pflanze oben links in der Ecke, Schild oben rechts (`top: 8px`).
- Reihenfolge der Personen bleibt von oben nach unten, links nach rechts.

## Tür-SVG

Liegt um die Wandstärke über die Flurwand hinaus, damit die weiße Fläche die Öffnung in die Wand schneidet:

```html
<svg class="door" width="48" height="52" viewBox="0 0 48 52" fill="none" aria-hidden="true">
  <rect x="2" y="48" width="44" height="4" fill="#fff"/>                 <!-- Öffnung in der Flurwand -->
  <path d="M2 48V4" stroke="#9CCAF1" stroke-width="2"/>                  <!-- Türblatt -->
  <path d="M2 4A44 44 0 0 1 46 48" stroke="#9CCAF1" stroke-width="1.5"/> <!-- Schwenkbogen -->
</svg>
```

```css
.room.top    .door { left: 34px; bottom: -4px; z-index: 2; }
.room.bottom .door { left: 34px; top: -4px; transform: scaleY(-1); z-index: 2; }
```

Die Füllfarbe der Öffnung (`#fff`) soll zum Flurgrund passen; liegt der Flur auf einem Raster, reicht Weiß, weil die Öffnung nur so hoch wie die Wand ist.

## Lange Namen und schmale Räume

- Das Schild hat `max-width: calc(100% - 14px - 90px)`. 90 px ist der Platz für Pflanze und Tür. Der Name wird einzeilig mit Ellipsis gekürzt, der volle Name steht im `title` bzw. Tooltip.
- Unter ca. 220 px Raumbreite: die Statuszeile ausblenden (die Personenzahl steht dann als kleines Symbol mit Zahl hinter dem Namen).
- Unter ca. 170 px: Pinnwand-Symbol auf 20×16 verkleinern.

## Zustände (unverändert übernehmen)

- Eigener Raum: Fläche `#CEE4F8`.
- Gesperrter/nicht betretbarer Raum: Fläche `#F3F3F3`.
- Sprechende Person: gelber Ring (`box-shadow: 0 0 0 3px #FBD200`), Stummschaltung wie heute.
- Flur: Punktraster, Beschriftung „Flur / Etagenkanal · frei“ links, Pflanze (Etagenpflege) am rechten Ende.

## Interaktion und Zugänglichkeit

- **Pflanze:** `<button aria-label="Raumpflege <Raum>">`, öffnet die Raumpflege (siehe `HAUSMEISTER-DIALOGE.md`). Nur für Admins sichtbar.
- **Pinnwand:** `<button aria-label="Pinnwand von <Raum> öffnen">`, nur sichtbar, wenn die Pinnwand Beiträge hat.
- Raum betreten wie bisher (Klick bzw. Doppelklick auf die Raumfläche). Die Schaltflächen im Türstreifen stoppen die Weitergabe des Klicks (`stopPropagation`).
- Tür und Raster sind dekorativ (`aria-hidden="true"`).

## Was entfällt

- Raumname und Status oben links im Raum.
- Pinnwand-Symbol oben rechts im Raum.
- Pflanze unten rechts im Raum.
- Der freie Bereich neben dem Türschwung (der Türschwung teilt sich die Höhe jetzt mit dem Schild).
