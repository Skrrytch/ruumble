# Third-party notices

Ruumble's own source code is under the [BSD-3-Clause license](LICENSE). The distributed artifacts also contain third-party software under the licenses below. The full license texts of the service's runtime dependencies are in the Docker image under `/app/node_modules/<package>/`.

## Docker image (service and web UI)

The service uses **Ice for JavaScript** (GPL-2.0), so the Docker image as a combined work is distributed under **GPL-2.0** (ADR-0006). The corresponding source code is this repository at the release tag. This does not change the license of the web UI or the plugin.

| Component | License | Where |
|---|---|---|
| [Ice for JavaScript](https://github.com/zeroc-ice/ice) (ZeroC) | GPL-2.0 | service |
| [Fastify](https://fastify.dev/), `@fastify/static`, `@fastify/websocket` and their dependencies | MIT, ISC, BSD-3-Clause, BlueOak-1.0.0 | service |
| [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) | MIT | service |
| [SQLite](https://sqlite.org/) (bundled with better-sqlite3) | Public domain | service |
| [Zod](https://zod.dev/) | MIT | service and web UI (bundled) |
| [Svelte](https://svelte.dev/) | MIT | web UI (bundled) |
| [markdown-it](https://github.com/markdown-it/markdown-it) | MIT | web UI (bundled) |
| [DOMPurify](https://github.com/cure53/DOMPurify) | MPL-2.0 OR Apache-2.0 | web UI (bundled) |
| [highlight.js](https://highlightjs.org/) | BSD-3-Clause | web UI (bundled) |
| [Lucide](https://lucide.dev/) (`@lucide/svelte`) | ISC | web UI (bundled) |
| [Inter](https://rsms.me/inter/) (`@fontsource-variable/inter`) | SIL Open Font License 1.1 | web UI (font files) |
| [Node.js](https://nodejs.org/) (base image `node:22-bookworm-slim`) | MIT and others | runtime |

## Mumble plugin (`ruumble-<version>.mumble_plugin`)

| Component | License | Where |
|---|---|---|
| Mumble plugin API headers (`third_party/mumble/`, © The Mumble Developers) | BSD-3-Clause | Linux and Windows |
| [nlohmann/json](https://github.com/nlohmann/json) | MIT | Linux and Windows (statically linked) |
| [IXWebSocket](https://github.com/machinezone/IXWebSocket) | BSD-3-Clause | Linux and Windows (statically linked) |
| [Mbed TLS](https://github.com/Mbed-TLS/mbedtls) | Apache-2.0 | Windows (statically linked) |
| [OpenSSL](https://www.openssl.org/) | Apache-2.0 | Linux (the system's library, linked dynamically, not distributed) |
| GCC runtime (libstdc++, libgcc) | GPL-3.0 with GCC Runtime Library Exception | Linux and Windows (statically linked) |
| MinGW-w64 winpthreads | MIT | Windows (statically linked) |

Ruumble is not affiliated with or endorsed by the Mumble project.
