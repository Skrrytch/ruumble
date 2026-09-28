# Live-test tools

These grew out of the feasibility studies S1 and S2 ([docs/internal/feasibility-studies.md](../../docs/internal/feasibility-studies.md)). Used by `web/e2e-live` and `deploy/local`.

- `src/setup.cjs`: creates channels, permissions and the root channel description in the local Mumble (`deploy/local`). This is test preparation and therefore uses the write secret, which Ruumble itself never gets.
- `src/bot.cjs`: minimal Mumble client in Node (protocol via protobuf), for example for a registered user with an avatar.
- `clients/Dockerfile.<distro>`: headless Mumble clients (Ubuntu, Debian, Fedora) with Xvfb and PulseAudio. `deploy/local/run-client.sh` starts them with the Ruumble plugin (`CLIENT_LANG` sets the client's language, default `de_DE.UTF-8`).

One-time preparation:

```sh
cd tools/live-test && pnpm install && pnpm gen      # Ice stubs and Mumble.proto into gen/
for d in ubuntu debian fedora; do docker build -t ruumble-client-$d -f clients/Dockerfile.$d clients; done
```

Then, as described in `web/playwright.live.config.ts`: start the local stack, run `node src/setup.cjs`, run the live tests. See also [docs/development.md](../../docs/development.md#live-tests).
