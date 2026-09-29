# Design documents

The original design handover for the floor view, **neutralised**: there are no company tokens and no internal names or people.

| File | Content |
|---|---|
| `SPEC.md` | original specification. Where it differs, the [charter](../internal/charter.md) applies. |
| `prototype/index.html` | runnable reference prototype (vanilla JS, mock data); just open it in the browser. Serves as the visual reference for the screenshot comparison (AP4). |
| `prototype/mock-data.json` | sample data "Acme HQ" in Mumble format |
| `tokens.css` | colours, sizes and motion used by the web UI |
| `board-variants.html` | design variants of the board graphic in the room; variant B was chosen (ADR-0011) |

The prototype does not implement the rules from the charter, e.g. locked floors, the entrance and hiding linked channels. The compact header and the room widths by rank (E31) are also missing there. It remains the reference for the layout test (`web/e2e/layout.spec.ts`).
