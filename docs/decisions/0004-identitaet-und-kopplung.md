# ADR-0004: Identität, Kopplung und Zugriff

Status: angenommen (28.09.2026)

## Kontext
- Das Plugin meldet seine Session-ID. Mumble bietet aber keinen sauberen Beweis, dass diese Angabe stimmt: Der Zertifikats-Hash ist öffentlich, und `User.address` ist hinter NAT oder VPN nicht eindeutig. Challenges über den Kommentar oder die Positionsdaten wären fälschungssicher, haben aber sichtbare Nebenwirkungen.
- **Der mögliche Schaden ist begrenzt:** Jeder Befehl läuft nur im Client, der das Plugin tatsächlich geladen hat. Ein Fälscher kann niemanden verschieben. Er könnte nur den Belegungsstand lesen und für seine eigene Oberfläche Sprechanzeigen vortäuschen.
- Den Belegungsstand dürfen nur Mumble-Nutzer mit laufendem Plugin sehen (Entscheidung O8).

## Entscheidung
1. **Plausibilitätsprüfung beim `hello`:** Der Dienst gleicht die Angaben des Plugins mit dem Stand in Ice ab:
   - Die Session muss existieren (`getState`).
   - Der Zertifikats-Hash muss zum SHA1 von `getCertificateList(session)[0]` passen.
   - Die Quell-IP der Plugin-Verbindung muss zu `User.address` passen. Ob diese Prüfung hinter Proxy und VPN funktioniert, klärt Machbarkeitstest S3. Klappt sie dort nicht, wird sie abgeschaltet.
   Schlägt eine Prüfung fehl, wird die Verbindung abgelehnt.
2. **Stabiler Schlüssel ist der Zertifikats-Hash**, nicht die Session-ID, denn Session-IDs werden neu vergeben.
3. **Kopplung der Oberfläche:**
   - Nach dem ersten erfolgreichen `hello` ohne vorhandene Kopplung bekommt das Plugin einen **Einmal-Link** (60 s gültig) und öffnet ihn mit `xdg-open`.
   - Die Oberfläche tauscht den Link gegen ein langlebiges **Geräte-Token** (HttpOnly-Cookie), das an den Hash gebunden ist.
   - Das Plugin merkt sich in `~/.config/ruumble/plugin.json`, dass die Kopplung erfolgt ist, und öffnet den Browser danach nicht mehr automatisch. Das lässt sich per Konfiguration ändern.
4. **Zugriff:** Eine Oberfläche bekommt nur dann Daten, wenn ihr Token gültig ist **und** gerade ein Plugin mit demselben Hash verbunden ist. Sonst zeigt sie: „Mumble ist nicht verbunden“.
5. Der Dienst ist **nur im internen Netz oder VPN** erreichbar (ADR-0008).

## Konsequenzen
- Mumble zeigt keine Nebeneffekte, und die Nutzer müssen nichts einstellen.
- **Restrisiko (akzeptiert):** Wer im internen Netz ist, dieselbe IP hat und die öffentlichen Daten einer fremden Session kennt, kann diese Session vortäuschen. Er sieht dann den Belegungsstand, den er als Mumble-Nutzer ohnehin sehen kann.
- Geräte-Tokens lassen sich widerrufen: Beim Abmelden in der Oberfläche oder durch den Admin werden sie gelöscht.
