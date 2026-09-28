# Designunterlagen

Die ursprüngliche Designübergabe für die Etagenansicht, **neutralisiert**: Es gibt keine Firmen-Tokens und keine internen Namen oder Personen.

| Datei | Inhalt |
|---|---|
| `SPEC.md` | ursprüngliche Spezifikation. Wo sie abweicht, gilt [`../PLANUNG.md`](../PLANUNG.md). |
| `prototype/index.html` | lauffähiger Referenzprototyp (Vanilla JS, Mock-Daten), einfach im Browser öffnen. Dient als visuelle Referenz für den Screenshot-Vergleich (AP4). |
| `prototype/mock-data.json` | Beispieldaten „Musterhaus“ im Mumble-Format |
| `tokens.css` | Farben, Maße und Motion, die die Oberfläche nutzt |
| `pinnwand-varianten.html` | Entwurfsvarianten der Pinnwand-Grafik im Raum; entschieden wurde Variante B (ADR-0011) |

Der Prototyp setzt die Regeln aus `PLANUNG.md` nicht um, z. B. gesperrte Etagen, den Eingang und das Ausblenden verlinkter Kanäle. Auch die kompakte Kopfzeile und die Raumbreiten nach Rang (E31) fehlen dort. Er bleibt die Referenz für den Layouttest (`web/e2e/layout.spec.ts`).
