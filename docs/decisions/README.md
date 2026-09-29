# Architecture decision records (ADR)

Format: short MADR. Status: **accepted** = decided by the project owner. **proposed** = decided and justified by Claude; it applies as long as nobody objects.

| No. | Title | Status |
|---|---|---|
| [0001](0001-connection-and-topology.md) | Connection and topology: plugin and service as the hub | accepted |
| [0002](0002-read-only-ice-polling.md) | Read-only Ice access by polling | proposed |
| [0003](0003-commands-and-feedback.md) | Commands and feedback | proposed |
| [0004](0004-identity-and-pairing.md) | Identity, pairing and access | accepted |
| [0005](0005-talking-indicator-local-only.md) | Talking indicator only for what you can hear | accepted |
| [0006](0006-tech-stack.md) | Tech stack | accepted (Svelte, Node) / proposed (rest) |
| [0007](0007-protocol-and-derivation.md) | Protocol and where the building is derived | proposed |
| [0008](0008-operations.md) | Operations | accepted (Docker) / proposed (rest) |
| [0009](0009-standalone-repository.md) | Standalone repository instead of a Mumble fork | accepted |
| [0010](0010-address-from-root-description.md) | Service address from the root channel description | accepted |
| [0011](0011-own-storage-for-the-board.md) | Own storage for the board | accepted |
| [0012](0012-pairing-with-a-code.md) | Pairing further browsers with a code from the Mumble log | accepted (approach) / proposed (details) |
| [0013](0013-windows-plugin.md) | Windows plugin, cross-compiled into the same bundle | proposed |

ADRs record a decision as it was made. Where the code has moved on since, the ADR has a short "Current state" note instead of a silent rewrite.
