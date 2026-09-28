# ADR-0002: Ice nur lesend per Polling

Status: vorgeschlagen (28.09.2026)

## Kontext
Ice-Callbacks (`Server.addCallback`) brauchen das Write-Secret. Der Server schickt dieses Secret außerdem bei jedem Callback an den Empfänger (`MumbleServerIce.cpp:1017-1033, 313-316`). Wer Callbacks nutzt, hat also Schreibrechte, und „nur lesen“ ist dann nur noch eine Frage der Disziplin im Code. Für das Mitlauschen gibt es ohnehin kein Ereignis. Ice for JavaScript kann keine Callbacks empfangen.

## Optionen
1. **Polling mit Read-Secret**
2. Callbacks mit Write-Secret und Polling als Sicherheitsnetz

## Entscheidung
Option 1. Der Dienst bekommt **nur** `icesecretread`. `icesecretwrite` wird auf einen anderen Zufallswert gesetzt und dem Dienst nicht mitgeteilt. Takt:

| Daten | Takt |
|---|---|
| `getChannels`, `getUsers`, `getUptime` | 1 s |
| `getListeningUsers` je Kanal | 3 s |
| `hasPermission` für gekoppelte Nutzer | bei Strukturänderung und alle 10 s |
| `registername` | 60 s |

Der Dienst bildet die Differenz zum vorigen Stand. Nur bei einer Änderung schickt er einen neuen Stand an die Oberflächen.

## Konsequenzen
- Schreiben ist technisch unmöglich: Der Dienst kann den Server nicht verändern, auch nicht durch einen Fehler.
- Änderungen erscheinen mit bis zu 1 s Verzögerung, beim Mitlauschen mit bis zu 3 s. Eigene Aktionen (Stumm, Taub, Wechsel) meldet das Plugin sofort (ADR-0003), sodass die eigene Rückmeldung ohne Verzögerung kommt.
- Der Server hat eine kleine Grundlast (etwa 20 Aufrufe/s bei 50 Kanälen). Sie wird im Machbarkeitstest S1 gemessen.
