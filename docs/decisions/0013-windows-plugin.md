# ADR-0013: Windows plugin, cross-compiled into the same bundle

Status: proposed (2026-09-29)

## Context
The plugin existed only as `libruumble.so` for Linux. Almost all of it is portable C++17 (nlohmann/json, IXWebSocket, the Mumble plugin header already handles `dllexport`); only the config path, opening the browser, the plugin language and TLS were Linux-specific. A Mumble plugin bundle (`.mumble_plugin`) may contain one library per platform (`<plugin os="windows" arch="x64">`); Mumble installs the one for its own platform. The service offers exactly one bundle under `/download`.

Options for building the Windows library:
1. **MSVC on a Windows CI runner** and merge the DLL into the bundle afterwards: native toolchain, but the Docker image could no longer be built on its own, and OpenSSL for MSVC needs vcpkg or a prebuilt package.
2. **MinGW-w64 cross build on Linux**, as an extra stage in `deploy/Dockerfile`: one `docker build` still produces everything; the unit tests run under Wine.

Options for TLS on Windows: OpenSSL (not packaged for MinGW, would have to be built) or **Mbed TLS**, built along via FetchContent. IXWebSocket's Mbed TLS backend reads the Windows root store for `caFile = "SYSTEM"`, so internal CAs rolled out via group policy work as on Linux.

## Decision
- The Windows plugin is **cross-compiled with MinGW-w64** (posix thread model, `plugin/cmake/mingw-w64.cmake`) and linked **statically** (libstdc++, libgcc, winpthread): `ruumble.dll` imports only Windows system DLLs.
- TLS on Windows uses **Mbed TLS 3.6 (LTS)**; Linux keeps the system OpenSSL.
- **One bundle for both platforms:** the Dockerfile builds `ruumble.dll` first and passes it to the Linux build with `-DRUUMBLE_BUNDLE_EXTRA`; the manifest lists both libraries. Same plugin version on both platforms.
- Windows specifics in `config.cpp`: config in `%APPDATA%\ruumble\plugin.json` (wide-character paths), browser via `ShellExecuteW`, language from the Windows display language unless `LC_ALL`/`LC_MESSAGES`/`LANG` are set.
- CI cross-builds the Windows plugin and runs the unit tests under Wine. The live tests stay Linux-only; the Windows plugin is tested by hand in a real Mumble client.

## Consequences
- Users on Windows install the same `/download` file as Linux users.
- The bundle grows from about 1 MB to about 2.3 MB (compressed).
- There is no automated end-to-end test on Windows; changes to `plugin.cpp`, `net.cpp` or `config.cpp` need a manual check there.
- macOS would need a third library (and signing questions); not part of this decision.
