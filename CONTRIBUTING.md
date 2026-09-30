# Contributing to Ruumble

Thanks for your interest! Bug reports, ideas and pull requests are all welcome.

- **Questions and ideas:** start a [discussion](https://github.com/Skrrytch/ruumble/discussions).
- **Bugs:** open an [issue](https://github.com/Skrrytch/ruumble/issues/new/choose) with the versions it asks for. Most problems depend on the Mumble server and client version.
- **Security problems:** privately, see [SECURITY.md](SECURITY.md).

## Pull requests

For anything bigger than a small fix, please open an issue or discussion first, so we can agree on the approach before you invest time.

1. Set up the workspace as described in [docs/development.md](docs/development.md) (Node 22, pnpm via `corepack enable`; CMake and a C++17 compiler for the plugin).
2. Before pushing, run `pnpm lint && pnpm test && pnpm build`, plus `pnpm -F @ruumble/web e2e` when you touch the web UI, and the plugin tests when you touch `plugin/`. CI runs the same checks on every pull request.
3. Keep the change focused and add tests for new behaviour.

## Conventions

- **English everywhere**: code, comments, commit messages, docs. German only appears as the German translation of UI, plugin and notice texts.
- **UI texts in both languages**: `web/src/lib/i18n/de.ts` defines the messages, `en.ts` must match it; plugin texts are in `plugin/src/messages.cpp`.
- **Mumble stays unchanged**: Ruumble only uses the official Ice and plugin interfaces. Files in `third_party/mumble/` are never edited by hand.
- **Decisions with wider impact** get a short ADR in [docs/decisions/](docs/decisions/README.md).
- The building is derived only in `web/src/lib/model/building.ts`, as pure functions; the service sends raw Mumble data.

More background for working in the code: [CLAUDE.md](CLAUDE.md) (commands, architecture, gotchas) and the [architecture decisions](docs/decisions/README.md).

By contributing you agree that your contribution is licensed under the [BSD-3-Clause license](LICENSE).
