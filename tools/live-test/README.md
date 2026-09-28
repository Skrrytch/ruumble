# Werkzeuge für die Live-Tests

Hervorgegangen aus den Machbarkeitstests S1 und S2 (`docs/analyse/spike-s1.md`, `spike-s2.md`). Genutzt von `web/e2e-live` und `deploy/local`.

- `src/setup.cjs`: legt im lokalen Mumble (`deploy/local`) Kanäle, Rechte und die Root-Beschreibung an. Das ist Testvorbereitung und nutzt deshalb das Write-Secret, das Ruumble selbst nie bekommt.
- `src/bot.cjs`: minimaler Mumble-Client in Node (Protokoll per protobuf), z. B. für einen registrierten Nutzer mit Avatar.
- `clients/Dockerfile.<distro>`: headless Mumble-Clients (Ubuntu, Debian, Fedora) mit Xvfb und PulseAudio. `deploy/local/run-client.sh` startet sie mit dem Ruumble-Plugin.

Einmalig vorbereiten:

```sh
cd tools/live-test && pnpm install && pnpm gen      # Ice-Stubs und Mumble.proto nach gen/
for d in ubuntu debian fedora; do docker build -t ruumble-client-$d -f clients/Dockerfile.$d clients; done
```

Dann wie in `web/playwright.live.config.ts` beschrieben: lokalen Stack starten, `node src/setup.cjs`, Live-Tests laufen lassen.
