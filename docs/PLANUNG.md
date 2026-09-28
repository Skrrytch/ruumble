# Ruumble – Planung der Gebäude-Oberfläche

Stand: 28.09.2026 · Status: Grobplanung abgeschlossen. Die Umsetzung ist in [FEINPLANUNG.md](FEINPLANUNG.md) beschrieben, die Architektur in [decisions/](decisions/README.md), die Mumble-Aufrufe in [analyse/mumble-schnittstellen.md](analyse/mumble-schnittstellen.md).

Grundlage: `design/` (SPEC.md, Prototyp, Design-Tokens) und eine Prüfung des Mumble-Codes (`master` 7bbd2c16a vom 26.09.2026, Schnittstellen identisch mit Release v1.6.870).

---

## 1. Ziel und Leitplanken

Ruumble ist eine **alternative Oberfläche** für Mumble. Sie zeigt den Kanalbaum eines Servers als Bürogebäude: Etagen, Flure und Büros, in denen die Personen sitzen. Wer auf einen Raum klickt, wechselt in diesen Kanal.

Leitplanken (vom Auftraggeber gesetzt):

| #   | Leitplanke                                                                            | Folge für die Umsetzung                                                                                                                                |
| --- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| L1  | Die Umsetzung ist **völlig unabhängig vom Hauptprojekt**.                             | Ruumble ist ein eigenständiges Repository (ADR-0009). Aus Mumble werden nur die zwei Schnittstellendateien unverändert übernommen (`third_party/mumble/`, festgelegt auf ein Release). |
| L2  | **Mumble bleibt eigenständig.**                                                       | Server und Desktop-Client funktionieren unverändert weiter. Ruumble ist eine zusätzliche Sicht und kein Ersatz.                                        |
| L3  | Die Darstellung nutzt **nur die vorhandene Kanalstruktur**.                           | Es gibt keine eigene Gebäudekonfiguration und keine zusätzlichen Metadaten auf dem Server. Alles wird aus dem Baum und den Namen abgeleitet.          |
| L4  | Ist die Struktur **tiefer als zwei Ebenen**, steht die Etage **nicht zur Verfügung**. | Die Regel gilt je Etage (siehe 2.2). Sie ersetzt „ab 3. Ebene ignorieren“ aus SPEC.md.                                                                 |

## 2. Abbildung Kanalbaum → Gebäude

### 2.1 Grundregel

| Mumble                 | Gebäude                                                    |
| ---------------------- | ---------------------------------------------------------- |
| Root-Kanal             | Gebäude (Schild im Aufzugskern), Nutzer darin im Eingang   |
| Kanal der 1. Ebene     | Etage, Reihenfolge siehe 2.2                               |
| Etagenkanal selbst     | Flur, immer betretbar                                      |
| Kanal der 2. Ebene     | Raum/Büro der Etage (auch temporäre Kanäle)                |
| Etage ohne Unterkanäle | ein offener Raum (z. B. „Lobby“)                           |
| Name enthält „(stumm)“ | Symbol „Lautsprecher aus“, rein visuell                    |

### 2.2 Reihenfolge der Etagen

- Die **Mumble-`position`** bestimmt die Etagen: Sortiert wird nach `position` und bei Gleichstand nach Name, genau wie im Mumble-Client. Die erste Etage ist das **EG**, danach folgen 1., 2., 3. OG … Im Aufzug stehen sie von unten nach oben.
- Räume innerhalb einer Etage werden nach derselben Regel sortiert.
- Es gibt **keine Schlüsselwörter** (etwa „Lobby“ als festes EG) und keine alphabetische Sonderregel. Wer die Reihenfolge ändern will, ändert die `position` in Mumble.
- Die Etagennummer wird erst **nach** dem Ausblenden verlinkter Kanäle (2.4) vergeben.

### 2.3 Gesperrte Etagen

Eine Etage ist **gesperrt** (nicht darstellbar), wenn

1. mindestens einer ihrer Räume Unterkanäle hat (L4, Hinweis „Kanalstruktur zu tief“) **oder**
2. sie **mehr als 8 Räume** hat (Hinweis „Zu viele Räume“). Der Flur zählt dabei nicht mit.

Für gesperrte Etagen gilt:

- Sie erscheinen im Aufzug, aber ausgegraut, mit `aria-disabled` und dem Grund als Hinweis.
- Die Nummerierung bleibt stabil: Auch eine gesperrte Etage belegt ihre Nummer.
- Die Regel wird **bei jeder Änderung live** neu ausgewertet. Legt jemand einen Unterkanal an, wird die Etage sofort gesperrt. Wird er entfernt, wird sie wieder freigegeben.
- Befindet sich der eigene Nutzer auf einer **gesperrten** Etage, ist sie im Aufzug trotzdem hervorgehoben. Statt des Grundrisses erscheint der Hinweis: „Du bist in einem Bereich, der hier nicht darstellbar ist“.
- Ist **keine** Etage darstellbar, zeigt die Oberfläche eine Meldung zum „Leerstand“.

### 2.4 Weitere Regeln

- **Eingang:** Nutzer im Root-Kanal stehen im Eingang des Gebäudes. Sie werden als Information unter der Aufzug-Box angezeigt.
- **Temporäre Kanäle** der 2. Ebene sind normale Räume.
- **Verlinkte Kanäle verschwinden ganz.** Jeder Kanal, der mit einem anderen verlinkt ist (`Channel.links` nicht leer), wird nicht dargestellt. Die übrigen Räume teilen sich den frei gewordenen Platz, und ausgeblendete Räume zählen nicht zur Grenze von 8 Räumen. Weil Links in Mumble immer in beide Richtungen gelten, verschwinden beide Seiten eines Links. Randfälle siehe Fragen O2–O4.
- **Mitlauschen:** Hört ein Nutzer in einem anderen Raum mit (Channel Listener), zeigt ein Symbol neben dem Raumnamen das an (siehe Frage O5).
- **Server-Mute, Server-Deaf und Unterdrückt** bekommen ein eigenes Symbol am Avatar. Die genaue Spezifikation folgt.
- **Sprechen:** Wer gerade spricht, bekommt einen pulsierenden Ring am Avatar, in Mittelblau und nicht in Gelb.

## 3. Oberfläche (Kurzfassung, Details in SPEC.md)

- Die Kopfzeile ist kompakt: links der Etagenname, rechts die Zahl der Personen auf der Etage und „N online“ (die Etage selbst ist im Aufzug markiert).
- Der **Grundriss** besteht aus dem Aufzugskern links (Gebäudeschild, Aufzug mit einer Taste je Etage, Eingang, Benutzermenü) und der Etagenfläche rechts. Dort liegen die obere Raumreihe, der Flur und die untere Raumreihe. Die Wände entstehen aus 4 px Abstand, jede Tür hat einen Türbogen.
- Das **Gebäudeschild** zeigt nur den Servernamen. Das Label „primary“ entfällt.
- Die Raumbreiten folgen der Mumble-Reihenfolge (E31): Raum 1 und 2 sind groß, danach werden die Räume kleiner. Oben stehen ⌊n/2⌋ Räume (mindestens einer), der Rest unten; mit höchstens 8 Räumen also höchstens 4 in einer Reihe.
- Der eigene Raum hat einen hellblauen Hintergrund, der eigene Avatar einen gelben Ring. Das ist das einzige gelbe Element.
- Interaktion: Klick auf einen Raum wechselt den Kanal. Klick auf eine Etage wechselt nur die Ansicht. Außerdem gibt es Stumm, Taub und „Zu meiner Etage“.
- **Einstellungen:** vorerst ohne Funktion (siehe Frage O7).
- Barrierefreiheit: echte Buttons, `aria-current`, `aria-pressed`, Touch-Ziele ≥ 44 px.
- **Design:** Farben, Maße und Radien kommen aus `docs/design/tokens.css`. Schrift und Icons sind **frei lizenziert**. Vorschlag: Schrift **Inter** (SIL OFL) und Icons **Lucide** (ISC, Linien-Icons mit 2 px Strich, passt zu SPEC 8, als Svelte-Paket verfügbar).

## 4. Befunde aus Prototyp und Spezifikation

**Was gut ist und so übernommen werden kann:**

- Die Ableitung ist bereits als reine Funktionen umgesetzt (`buildBuilding`, `floorPopulation`, `floorOfChannel`, `roomGrow`, `countText`). Sie lassen sich direkt übernehmen und testen, müssen aber an 2.2 und 2.3 angepasst werden.
- Die Schnittstelle zu Mumble ist schon vorgesehen: `snapshot`, `onChange`, `joinChannel`, `setSelfMute`, `setSelfDeaf`.

**Was der Prototyp noch nicht abdeckt:**

1. Nutzer im Root-Kanal (Eingang) werden nicht dargestellt, aber bei „N online“ mitgezählt.
2. `joinChannel` ändert den Zustand optimistisch und ohne Rückweg, falls der Server ablehnt.
3. Die Ansicht ist fest auf 1440 × 900 px ausgelegt und passt sich nicht an andere Fenstergrößen an.
4. `name.slice(0, 2)` für die Initialen zerlegt Emojis und zusammengesetzte Zeichen.
5. Die Sprechanzeige fehlt (neu gefordert, siehe 2.4).
6. Folgendes fehlt ebenfalls: Ausblenden verlinkter Kanäle, gesperrte Etagen, Eingang, Mitlauschen und Server-Mute.
7. SPEC.md ist in mehreren Punkten überholt (tiefere Ebenen, Sortierung, Label „primary“, Schrift und Icons) und muss angepasst werden.

## 5. Anbindung an Mumble

### 5.1 Was die Schnittstellen hergeben

| Benötigt                             | Client-Plugin-API v1.2 (`plugins/MumblePlugin.h`)                                         | Server-Ice (`src/murmur/MumbleServer.ice`)                                  |
| ------------------------------------ | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Kanäle, Namen                        | ✅ `getAllChannels`, `getChannelName`                                                      | ✅ `getChannels`                                                             |
| **Elternkanal**                      | ❌ fehlt                                                                                   | ✅ `Channel.parent`                                                          |
| **Position**                         | ❌ fehlt                                                                                   | ✅ `Channel.position`                                                        |
| Temporärer Kanal, Links              | ❌                                                                                         | ✅ `Channel.temporary`, `Channel.links`                                      |
| Nutzer und ihr Kanal                 | ✅ `getAllUsers`, `getChannelOfUser`                                                       | ✅ `getUsers`                                                                |
| Mute/Deaf **anderer** Nutzer         | ❌ nur eigener Status (`isLocalUserMuted/Deafened`)                                        | ✅ `User.selfMute/selfDeaf/mute/deaf/suppress`                               |
| **Mitlauschen**                      | ❌                                                                                         | ✅ `getListeningUsers`, `getListeningChannels` (nur Abfrage, kein Ereignis)  |
| Eigene Identität                     | ✅ `getLocalUserID` (= Session-ID)                                                         | ❌ muss zugeordnet werden                                                    |
| Sich selbst verschieben              | ✅ `requestUserMove`, **mit Prüfung der Rechte (ACL)**                                     | ⚠️ `setState` als Admin, **ohne Prüfung der Rechte (ACL)**                   |
| Zutrittsrechte anzeigen              | ❌                                                                                         | ✅ `hasPermission`                                                           |
| **Self-Mute/Deaf setzen**            | ✅ `requestLocalUserMute/Deaf`                                                             | ❌ nur Server-Mute                                                           |
| **Sprechen**                         | ✅ `onUserTalkingStateChanged`                                                             | ❌                                                                           |
| Live-Ereignisse zur Struktur         | ✅ Nutzer betritt/verlässt Kanal, Nutzer hinzu/weg, Kanal hinzu/weg/umbenannt              | ✅ `userStateChanged`, `channelStateChanged` …                               |
| Kanal verschoben (neuer Elternkanal) | ❌                                                                                         | ✅                                                                           |
| Server-Version                       | ❌                                                                                         | ✅ `getVersion`                                                              |
| Audio                                | ✅ bleibt im Desktop-Client                                                                | ❌ reine Fernsteuerung                                                       |

### 5.2 Folge aus den Entscheidungen

Entschieden ist: **Variante A (Client-Plugin), B (Ice) als Option, kein PR an Mumble.**

**Konflikt:** Ohne die API-Erweiterung fehlen dem Plugin allein der **Elternkanal**, das **Mitlauschen** und der **Mute-Status anderer Nutzer**. Damit lässt sich das Gebäude nicht aufbauen. Wird die Erweiterung nicht bei Mumble eingereicht, bleiben nur zwei Wege:

| Weg | Beschreibung | Bewertung |
|---|---|---|
| **A mit eigenem Mumble-Fork** | Die Plugin-API wird in einem Fork erweitert (`plugins/MumblePlugin.h`, `src/mumble/API*.cpp`). | Verletzt **L1** dauerhaft, und bei jedem Mumble-Update drohen Konflikte. Außerdem müssen alle Nutzer einen **selbst gebauten Mumble-Client** verwenden, statt Mumble aus ihrer Linux-Distribution (widerspricht L2). **Nicht empfohlen.** |
| **A + B kombiniert (empfohlen)** | Das **Plugin** liefert die eigene Session-ID, Stumm/Taub, die Sprechanzeige und den Kanalwechsel. Ein **Ice-Dienst** auf dem Server liefert Baum, Positionen, Nutzerstatus, Mitlauschen, Links, Rechte und Version. | **Kein Patch an Mumble.** L1 und L2 sind vollständig erfüllt, und das Plugin läuft mit dem normalen Mumble-Client. Da der Serverbetrieb in eigener Hand liegt, ist Ice verfügbar. |

Details zur empfohlenen Kombination:

- **Identität ohne Login:** `getLocalUserID` im Plugin liefert die Session-ID, und Ice verwendet dieselbe Session-ID. Die Zuordnung ist damit direkt gegeben.
- **Kanalwechsel über das Plugin** (`requestUserMove`) statt über Ice-`setState`. So gelten die Zutrittsrechte (ACL) des Servers weiter, und Ruumble kann niemanden in Räume bringen, die er nicht betreten darf.
- **Der Ice-Dienst ist nur lesend.** Er schreibt nie in Mumble. Dadurch bleibt das Risiko gering, falls der Dienst von außen erreichbar ist.
- **Mitlauschen:** Ice meldet Änderungen dazu nicht als Ereignis. Der Dienst muss sie in kurzen Abständen abfragen (z. B. alle 2 s) oder bei `userStateChanged` neu lesen.
- **Ice-Dienst auf Linux:** z. B. in Python mit `zeroc-ice` oder in Node.js. Er läuft neben dem Mumble-Server, aktiviert werden `ice` und `icesecretread` in `mumble-server.ini`.

### 5.3 Entscheidung

**A + B kombiniert, mit dem Dienst als zentraler Drehscheibe.** Details stehen in ADR-0001 bis ADR-0005. Jeder einzelne Aufruf ist in `analyse/mumble-schnittstellen.md` mit Beleg im Code geprüft. Wichtigste Folgen:

- **Ice nur lesend per Polling.** Callbacks bräuchten das Write-Secret (ADR-0002).
- **Befehle nur im eigenen Client**, mit Bestätigung durch `onChannelEntered`, weil `requestUserMove` eine Ablehnung nicht meldet (ADR-0003).
- **Identität per Plausibilitätsprüfung.** Der Zertifikats-Hash dient als stabiler Schlüssel (ADR-0004).

## 6. Eigene Vorschläge

1. **Schnittstelle zuerst:** ein `MumbleAdapter`-Interface mit Mock-Adapter (Mock-Daten plus simulierte Ereignisse, auch Sprechen). So wird die UI komplett ohne Mumble entwickelt und getestet. Die echten Adapter folgen später.
2. **Ableitungslogik als eigenes, framework-freies Modul** (`building-model`) mit Unit-Tests für alle Regeln aus Abschnitt 2 (Sortierung, Ausblenden verlinkter Kanäle, Sperrgründe, Eingang).
3. **Wechsel nur nach Server-Bestätigung**, bis dahin ein kurzer Übergangszustand und bei Ablehnung eine Meldung.
4. **Schloss-Symbol** an Räumen, die der Nutzer nicht betreten darf (über Ice-`hasPermission`). Das ist dank der Kombination aus A und B ohne Mehraufwand an der Schnittstelle möglich.
5. **Namenskonventionen zentral** im Modul `building-model` definieren, bisher nur „(stumm)“. Weitere nur bei erkennbarem Mehrwert einführen.
6. **Responsives Verhalten:** Durch die Grenze von 8 Räumen ist die Breite beherrschbar. Die Mindestgröße sollte trotzdem früh festgelegt werden (Vorschlag: 1280 × 720).
7. **Mumble-Releases beobachten:** Ein wöchentlicher GitHub-Workflow meldet ein neues Mumble-Release als Issue. Die Schnittstellen werden dann per Skript übernommen und geprüft (ADR-0009).

## 7. Struktur des Repositorys

```
ruumble/
  README.md, LICENSE (BSD-3)
  docs/
    PLANUNG.md                     diese Datei
    FEINPLANUNG.md                 Arbeitspakete
    analyse/                       Mumble-Schnittstellen, Ergebnisse der Machbarkeitstests
    decisions/                     ADRs
    design/                        Designübergabe (neutralisiert): SPEC, Prototyp, Tokens
  third_party/mumble/              MumblePlugin.h + MumbleServer.ice (unverändert, v1.6.870)
  scripts/                         update-mumble-interfaces.sh
  protocol/                        gemeinsame Nachrichtentypen (TS + JSON-Schema)
  web/                             Oberfläche (Svelte + TypeScript + Vite, Vitest)
    src/lib/model/                 building-model: reine Ableitungsfunktionen
    src/lib/adapter/               MumbleAdapter-Interface, mock/, live/
    src/lib/ui/                    Svelte-Komponenten
  bridge/                          Ruumble-Dienst (Node.js, Ice nur lesend)
  plugin/                          Mumble-Plugin „Ruumble“ (C++, eigenes CMake, Linux .so)
  deploy/                          Docker Compose (mumble, ruumble, proxy)
```

Die Verzeichnisse `protocol/` bis `deploy/` entstehen in den Arbeitspaketen der Feinplanung.

## 8. Entscheidungen

| # | Thema | Entscheidung |
|---|---|---|
| E1 | Anbindung | Variante A (Client-Plugin), B (Ice) als Option. Der Serverbetrieb liegt in eigener Hand. |
| E2 | PR an Mumble | Vorerst nicht, daher Kombination aus A und B (siehe 5.2) |
| E3 | Plattform | Linux, Windows als spätere Option |
| E4 | Gesperrte Etagen | im Aufzug sichtbar, aber gesperrt (2.3) |
| E5 | Viele Räume | Mehr als 8 Räume sperren die Etage (2.3). |
| E6 | Root-Kanal | Eingang unter der Aufzug-Box (2.4) |
| E7 | Etagenreihenfolge | Mumble-`position`, dann Name. Erste Etage = EG, keine Schlüsselwörter (2.2) |
| E14 | Verlinkte Kanäle | verschwinden ganz, die übrigen Räume nutzen den Platz (2.4) |
| E8 | Sprechanzeige | ja, sofern technisch möglich. Mit dem Plugin ist sie möglich. |
| E9 | Gebäudeschild | Label „primary“ entfällt |
| E10 | Einstellungen | vorerst ohne Funktion |
| E11 | Mehrere Server | nein, nur ein Server |
| E12 | Frontend | Svelte |
| E13 | Schrift/Icons | frei lizenziert: Inter + Lucide (ADR-0006) |
| E15 | Topologie (O1) | Dienst als zentrale Drehscheibe, Oberfläche als Browser-Seite/PWA (ADR-0001) |
| E16 | Zugriff (O8) | nur Mumble-Nutzer mit gekoppeltem Plugin (ADR-0004) |
| E17 | Server-Betrieb | Docker, der Dienst als weiterer Container (ADR-0008) |
| E18 | Identität | Plausibilitätsprüfung, Restrisiko akzeptiert (ADR-0004) |
| E19 | Sprechanzeige | nur, was der eigene Client hört (ADR-0005) |
| E20 | Sprache des Dienstes | TypeScript/Node.js, Fallback Python (ADR-0006) |
| E21 | Oberfläche öffnen | beim ersten Verbinden automatisch per Kopplungslink (ADR-0004) |
| E22 | Repository | eigenständig als `Skrrytch/ruumble` statt Fork, Name des Plugins „Ruumble“ (ADR-0009) |
| E23 | Lizenz | BSD-3-Clause |
| E24 | Veröffentlichung | öffentliches Repo, Designübergabe neutralisiert (ohne Firmen-Tokens, interne Namen und Personen) |
| E27 | Mitlauschen (O5) | Ohr-Symbol am Raum, Tooltip „N Personen hören mit“, keine Namen |
| E28 | Server-Mute (O6) | dunkles Abzeichen mit Mikrofon-aus. Self-Mute hell mit Mikrofon-aus, Self-Deaf hell mit Kopfhörer-aus. Jedes Abzeichen hat einen Tooltip. |
| E29 | Einstellungen (O7) | Knopf sichtbar, aber deaktiviert („noch ohne Funktion“) |
| E30 | Schwellen Anwesenheit (O14) | still = 15 Min. ohne Sprechen, abwesend = selbst taub + 5 Min. still (AP10) |
| E31 | Raumgrößen und Reihen | Reihenfolge weiter über das Feld **Position** in Mumble (keine eigene Markierung). Raum 1 und 2 sind groß, danach kleiner; oben ⌊n/2⌋ Räume, bei 1–2 Räumen wird die offene Pinnwand breiter |
| E26 | GPL durch Ice (O13) | akzeptiert: Der Code bleibt BSD-3, ein veröffentlichtes Image des Dienstes wird als GPL-2.0-Gesamtwerk gekennzeichnet (ADR-0006). |
| E25 | Deployment | Homeserver des Auftraggebers (bestehendes Docker-Setup mit Mumble), Tests lokal (ADR-0008) |

## 9. Offene Fragen

*O2–O4: Die Vorschläge gelten als Annahme (siehe FEINPLANUNG).*

- **O2 Verlinkter Etagenkanal:** Ist ein Kanal der 1. Ebene verlinkt, verschwindet dann die **ganze Etage** samt ihren Räumen? (Vorschlag: ja, weil ohne Etagenkanal der Flur fehlt.)
- **O3 Unterkanäle ausgeblendeter Räume:** Hat ein verlinkter (also ausgeblendeter) Raum Unterkanäle, sperrt das die Etage trotzdem (L4)? (Vorschlag: nein. Was verschwunden ist, zählt nicht mehr.)
- **O4 Nutzer in ausgeblendeten Kanälen:** Werden sie bei „N online“ mitgezählt? Und was sieht der eigene Nutzer, wenn er selbst in einem verlinkten Kanal ist? (Vorschlag: mitzählen, damit die Gesamtzahl stimmt, und für den eigenen Nutzer denselben Hinweis zeigen wie bei gesperrten Etagen: „Du bist in einem Bereich, der hier nicht darstellbar ist“.)
- **O15 Pinnwand (Idee A):** Entscheidungen zum eigenen Speicher (Aufbewahrung, Grenzen, Sichtbarkeit), siehe [ideen.md](ideen.md) → ADR-0011. Richtung: **SQLite** (Auftraggeber, 28.09.2026). Umsetzung noch nicht geplant.
- **O16 Fehler in Mumble melden:** `getTexture`/`setTexture` per Ice sind ab 1.6 für registrierte Nutzer unbrauchbar (vertauschte Bedingung, AP9). Soll ein Issue bei mumble-voip/mumble eröffnet werden? Das ist kein PR, nur eine Fehlermeldung mit Codestelle.
- **O10 Domain und Zertifikat** für den Dienst im internen Netz: interne CA oder Let's Encrypt über DNS-Challenge?


## 10. Nächste Schritte

Siehe [FEINPLANUNG.md](FEINPLANUNG.md). Der Einstieg ist AP0 (Repo-Grundlage), danach folgen parallel AP1 (Machbarkeitstests) und AP2–AP4 (Oberfläche gegen Mock).
