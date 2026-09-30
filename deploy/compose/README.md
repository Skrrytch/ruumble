# Compose templates for operation

| File | Use it for |
|---|---|
| `mumble-with-ruumble.docker-compose.yml` | **A new setup:** Mumble server and Ruumble in one file |
| `ruumble.docker-compose.yml` | Adding Ruumble to an **existing** Mumble container (joins its network `mumble-network`) |
| `mumble.docker-compose.yml` | Example of an existing Mumble container prepared for Ruumble: Ice only inside the Docker network, two secrets, a named volume |

The guide for these: [docs/operations.md](../../docs/operations.md#quick-setup).
