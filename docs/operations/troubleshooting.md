# Troubleshooting

[← Setting up Ruumble](../operations.md)

First look: `curl http://<address>:64080/healthz` should show `"ice":"ok"`, and `docker logs ruumble` shows the service's log.

| Symptom | Cause and fix |
|---|---|
| Log: `Ice unreachable` with `ConnectionRefused` or a DNS error | Ruumble cannot reach Mumble's Ice. Are both containers in the network `mumble-network`? Is `ICE_HOST` the Mumble container's name? Is `MUMBLE_CONFIG_ICE` set, and was Mumble restarted afterwards? |
| Log: `Ice unreachable` with `InvalidSecretException` | The read secret does not match Mumble's. Both must come from the same file `secrets/ice_read`; restart both containers after changing it. |
| Container stops: `ICE_SECRET_READ_FILE … cannot be read by uid 1000` | The secret file is not readable for the container: `chmod 644 secrets/ice_read` (the `secrets` folder can stay `700`). |
| Container stops: `No MumbleServer Meta object at …` | The Mumble server is older than 1.5. Ruumble needs 1.5 or newer. |
| Users see "not paired", no pairing link opens | Is the plugin installed **and enabled** in Mumble (Settings → Plugins)? Is the `ruumble:` line in the root channel description right, and can the user's computer reach that address? The Mumble log shows what the plugin is doing. |
| The plugin says "Hover once over the top channel …" | The root channel description is too long, see below. |
| Log: `Plugin address does not match Mumble's` | The plugin and Mumble see different network addresses for the user, typically behind a reverse proxy or NAT. Set `ADDRESS_CHECK: warn` ([HTTPS](https.md)). |
| Board uploads fail with `413` | The reverse proxy limits the request size, see [HTTPS](https.md#steps), step 2. |
| Avatars of registered users show initials | A bug in Mumble server 1.6: Ice does not deliver their images. Nothing to fix on Ruumble's side. |

`/healthz` also shows the Mumble server version (`mumbleServer`) and the connected clients per Mumble and plugin version (`clients`); `/api/version` shows the service version and the plugin version it offers.

## Root channel description

There is **one** plugin for all servers. It reads Ruumble's address from a line of its own in the root channel description that ends with `ruumble: <address>`, for example:

```
A few important settings for Ruumble:

- ruumble: http://192.168.1.10:64080
```

Mumble sends the description to all clients right away only if it is **under 128 characters**, measured on the stored HTML. With a longer one, every user has to hover the mouse over the top channel once (the plugin says so in the Mumble log).

Mumble's editor adds a lot of formatting: three lines easily become 400 characters. It stays short if you set it without the editor, via Ice with the write secret, for example from a short-lived container with a Mumble Ice client.
