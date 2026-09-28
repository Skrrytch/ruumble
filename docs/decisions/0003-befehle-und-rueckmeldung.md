# ADR-0003: Befehle und Rückmeldung

Status: vorgeschlagen (28.09.2026), erweitert nach Machbarkeitstest S2

## Kontext
- `requestUserMove` meldet nur „Anfrage gesendet“. Lehnt der Server ab (fehlende Rechte, voller Kanal), landet das nur im Log. Ein Rate-Limit verwirft Anfragen stillschweigend (`src/murmur/Messages.cpp:795-822`).
- API-Aufrufe aus dem Netzwerk-Thread können nach 800 ms mit einem Timeout scheitern.
- `requestLocalUserMute/Deaf` verhalten sich wie die Buttons im Mumble-Client.

## Entscheidung
1. **Vorab sperren:** Der Dienst liefert für den gekoppelten Nutzer `canEnter` je Raum (`hasPermission(session, cid, Enter)`). Die Oberfläche zeigt ein Schloss und lässt den Klick nicht zu.
2. **Kein optimistisches Umschalten.** Nach dem Klick zeigt die Oberfläche einen Übergangszustand an. Der Wechsel gilt als bestätigt, wenn das Plugin `onChannelEntered` für die eigene Session meldet. Kommt nach **3 s** keine Bestätigung, zeigt die Oberfläche: „Wechsel nicht möglich“.
3. **Befehle mit ID:** `{id, type: join|mute|deaf, ...}`. Das Plugin antwortet mit `{id, result: ok|rejected|superseded|timeout|offline}`.
4. Scheitert ein API-Aufruf am **Timeout**, versucht das Plugin es genau **einmal** erneut, danach meldet es `timeout`.
5. **Stumm/Taub:** Die Oberfläche schickt den *Zielzustand*. Das Plugin ruft die API nur auf, wenn sich der Zustand wirklich ändert, und meldet danach den tatsächlichen Stand (`isLocalUserMuted/Deafened`). Die Semantik (Taub stellt stumm, Unmute hebt Taub auf) übernimmt Ruumble von Mumble und bildet sie nicht selbst nach.
6. Passwortgeschützte Kanäle werden nicht unterstützt (`password = NULL`). Ohne Zutrittsrecht erscheinen sie mit Schloss.
7. **Reihenfolge und Rate-Limit** (S2: Mit den Standardwerten verwirft der Server 2 von 6 schnellen Wechseln still):
   - Das Plugin arbeitet Befehle **der Reihe nach** ab. Liegen mehrere `join` an, gilt **nur der letzte**. Die älteren werden mit `superseded` beantwortet, die Oberfläche zeigt dann einfach den neuen Übergangszustand.
   - Zwischen zwei Nachrichten, die den Nutzerstatus ändern (`join`, `mute`, `deaf`), liegt mindestens **1 s** Abstand.
   - Ein `join` in den aktuellen Kanal ist sofort `ok`, ohne API-Aufruf, denn Mumble würde dafür keine Bestätigung schicken.
   - Kommt bei einem Raum mit `canEnter = true` keine Bestätigung, war es vermutlich das Rate-Limit. Das Plugin versucht es nach 1 s **genau einmal** erneut und meldet erst danach `rejected`.

## Konsequenzen
- Die Oberfläche zeigt nie einen Zustand an, den der Server nicht hat.
- Es gibt keine eigene Logik für Stumm/Taub, die vom Client abweichen könnte (S2: alle Übergänge in 1.4 und 1.5 identisch).
- Schnelles Klicken führt immer in den zuletzt gewählten Raum, auch wenn das Rate-Limit des Servers greift.
