# ADR-0001: Anbindung und Topologie – Plugin und Dienst als Drehscheibe

Status: angenommen (28.09.2026)

## Kontext
Die Oberfläche braucht vier Dinge: den vollständigen Kanalbaum (Elternkanal, Position, Links), den Status aller Nutzer, die eigene Identität, und sie muss den eigenen Nutzer steuern können (Kanalwechsel, Stumm, Taub). Leitplanke L1 verbietet Änderungen am Mumble-Code, ein PR an Mumble ist ausgeschlossen. Die Plugin-API allein kennt weder Elternkanal noch Position noch den Status anderer Nutzer. Ice allein kann nicht selbst stumm schalten und kennt die Identität nicht (siehe `analyse/mumble-schnittstellen.md`).

## Betrachtete Optionen
1. **Dienst als zentrale Drehscheibe:** Der Dienst liest per Ice, das Plugin verbindet sich ausgehend, die Oberfläche kommt vom Dienst.
2. Plugin als lokales Gateway (`127.0.0.1`), die Oberfläche verbindet sich zusätzlich mit dem Dienst
3. Eigenes Desktop-Fenster (Tauri)
4. Eigener Mumble-Fork mit erweiterter Plugin-API (verletzt L1 und L2)

## Entscheidung
Option 1:
```
Browser/PWA ──wss──▶ Ruumble-Dienst ──Ice (nur lesen)──▶ Mumble-Server
                         ▲
                         │ wss (ausgehend)
                    Ruumble-Plugin ──Plugin-API──▶ Mumble-Client (Audio unverändert)
```
- **Mumble-Server über Ice** ist die Quelle für die Struktur: Baum, Nutzer, Mute-Status, Mitlauschen, Rechte, Version.
- **Plugin** ist die Quelle für die Identität (Session, Zertifikats-Hash) und das Sprechen. Es führt außerdem die Befehle aus.
- **Dienst** führt beides zusammen, liefert die Oberfläche aus und leitet Befehle von der Oberfläche an das Plugin des jeweiligen Nutzers weiter.

## Konsequenzen
- Es gibt keinen Patch an Mumble. Das Plugin läuft im Mumble-Client der Distribution.
- Das Plugin bleibt klein: ein ausgehender WebSocket, es öffnet keinen lokalen Port.
- Ohne laufendes Plugin gibt es keine Oberfläche (ADR-0004).
- Der Dienst ist eine zusätzliche Server-Komponente, die betrieben werden muss (ADR-0008).
