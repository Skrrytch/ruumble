# ADR-0005: Sprechanzeige nur für Gehörtes

Status: angenommen (28.09.2026)

## Kontext
`onUserTalkingStateChanged` meldet nur Nutzer, deren Audio beim eigenen Client ankommt: der eigene Kanal, verlinkte Kanäle, Kanäle, denen man zuhört, sowie Whisper und Shout. Bei eigenem „Taub“ kommt gar nichts. Der Dienst könnte die Meldungen aller Plugins zusammenführen.

## Entscheidung
Jede Oberfläche zeigt **nur die Sprechereignisse ihres eigenen Plugins**. Der Dienst reicht `talking` an die gekoppelten Oberflächen desselben Nutzers weiter. Er speichert die Ereignisse nicht und gibt sie nicht an andere Nutzer weiter.

## Konsequenzen
- Ruumble verrät nicht mehr als der Mumble-Client selbst.
- In fremden Räumen gibt es keine Sprechanzeige, sofern man dort nicht zuhört.
- Bei eigenem „Taub“ gibt es keine Sprechanzeige. Die Oberfläche blendet sie dann aus und zeigt keinen veralteten Zustand.
