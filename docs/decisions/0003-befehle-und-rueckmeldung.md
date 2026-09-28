# ADR-0003: Befehle und Rückmeldung

Status: vorgeschlagen (28.09.2026)

## Kontext
- `requestUserMove` meldet nur „Anfrage gesendet“. Lehnt der Server ab (fehlende Rechte, voller Kanal), landet das nur im Log. Ein Rate-Limit verwirft Anfragen stillschweigend (`src/murmur/Messages.cpp:795-822`).
- API-Aufrufe aus dem Netzwerk-Thread können nach 800 ms mit einem Timeout scheitern.
- `requestLocalUserMute/Deaf` verhalten sich wie die Buttons im Mumble-Client.

## Entscheidung
1. **Vorab sperren:** Der Dienst liefert für den gekoppelten Nutzer `canEnter` je Raum (`hasPermission(session, cid, Enter)`). Die Oberfläche zeigt ein Schloss und lässt den Klick nicht zu.
2. **Kein optimistisches Umschalten.** Nach dem Klick zeigt die Oberfläche einen Übergangszustand an. Der Wechsel gilt als bestätigt, wenn das Plugin `onChannelEntered` für die eigene Session meldet. Kommt nach **3 s** keine Bestätigung, zeigt die Oberfläche: „Wechsel nicht möglich“.
3. **Befehle mit ID:** `{id, type: join|mute|deaf, ...}`. Das Plugin antwortet mit `{id, result: ok|rejected|timeout|offline}`.
4. Scheitert ein API-Aufruf am **Timeout**, versucht das Plugin es genau **einmal** erneut, danach meldet es `timeout`.
5. **Stumm/Taub:** Die Oberfläche schickt den *Zielzustand*. Das Plugin ruft die API nur auf, wenn sich der Zustand wirklich ändert, und meldet danach den tatsächlichen Stand (`isLocalUserMuted/Deafened`). Die Semantik (Taub stellt stumm, Unmute hebt Taub auf) übernimmt Ruumble von Mumble und bildet sie nicht selbst nach.
6. Passwortgeschützte Kanäle werden nicht unterstützt (`password = NULL`). Ohne Zutrittsrecht erscheinen sie mit Schloss.

## Konsequenzen
- Die Oberfläche zeigt nie einen Zustand an, den der Server nicht hat.
- Es gibt keine eigene Logik für Stumm/Taub, die vom Client abweichen könnte.
