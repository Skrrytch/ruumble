# check=skip=FromPlatformFlagConstDisallowed
# Ruumble service with web UI (ADR-0008). Build context: repository root.
#   docker build -f deploy/Dockerfile -t ruumble .
#   docker buildx build -f deploy/Dockerfile --target plugin-bundle -o dist .   # only the plugin bundle
#
# Multi-arch (linux/amd64, linux/arm64; .github/workflows/release.yml): the plugin is always x86_64 and
# the web UI and service bundles are plain JS, so those stages run on the build platform. Only the
# runtime dependencies (better-sqlite3 is native) and the final image are built for the target platform.
#
# Licence: the service uses Ice for JavaScript (GPL-2.0). The image as a combined work is GPL-2.0 (ADR-0006);
# the Ruumble source code itself is under BSD-3-Clause.

# Plugin for Windows: cross-compiled with MinGW-w64 (ruumble.dll, TLS via Mbed TLS)
FROM --platform=linux/amd64 debian:bookworm-slim AS plugin-windows
RUN apt-get update && apt-get install -y --no-install-recommends cmake make g++-mingw-w64-x86-64-posix git ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /src
COPY third_party third_party
COPY plugin plugin
RUN cmake -S plugin -B plugin/build-win -DCMAKE_TOOLCHAIN_FILE=cmake/mingw-w64.cmake -DCMAKE_BUILD_TYPE=Release -DRUUMBLE_TESTS=OFF \
    && cmake --build plugin/build-win -j"$(nproc)" --target ruumble

# Plugin for Linux: built on Debian 12 (glibc 2.36) so that it also runs on older distributions.
# The bundle carries both libraries; Mumble installs the one for its platform.
FROM --platform=linux/amd64 debian:bookworm-slim AS plugin
RUN apt-get update && apt-get install -y --no-install-recommends cmake g++ make libssl-dev git ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /src
COPY third_party third_party
COPY plugin plugin
COPY --from=plugin-windows /src/plugin/build-win/ruumble.dll /windows/ruumble.dll
RUN cmake -S plugin -B plugin/build -DCMAKE_BUILD_TYPE=Release -DRUUMBLE_TESTS=OFF -DRUUMBLE_BUNDLE_EXTRA=/windows/ruumble.dll \
    && cmake --build plugin/build -j"$(nproc)" \
    && mkdir -p /out && cp plugin/build/*.mumble_plugin /out/

FROM --platform=$BUILDPLATFORM node:22-bookworm-slim AS build
WORKDIR /src
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY protocol/package.json protocol/
COPY web/package.json web/
COPY bridge/package.json bridge/
RUN pnpm install --frozen-lockfile
COPY third_party third_party
COPY protocol protocol
COPY web web
COPY bridge bridge
RUN pnpm -F @ruumble/web build && pnpm -F @ruumble/bridge build

# only the runtime dependencies of the service (fastify, ice, better-sqlite3), for the target platform
FROM node:22-bookworm-slim AS deps
WORKDIR /src
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY protocol protocol
COPY bridge/package.json bridge/
RUN pnpm install --frozen-lockfile --prod --filter @ruumble/bridge... \
    && pnpm -F @ruumble/bridge deploy --prod --legacy /out

FROM scratch AS plugin-bundle
COPY --from=plugin /out /

FROM node:22-bookworm-slim
LABEL org.opencontainers.image.title="Ruumble" \
      org.opencontainers.image.description="Mumble server as an office building" \
      org.opencontainers.image.source="https://github.com/Skrrytch/ruumble" \
      org.opencontainers.image.licenses="GPL-2.0-only AND BSD-3-Clause"
ENV NODE_ENV=production WEB_DIST=/app/web DATA_DIR=/data PORT=64080 PLUGIN_BUNDLE_DIR=/app/plugin
WORKDIR /app
COPY --from=deps /out/node_modules node_modules
COPY --from=build /src/bridge/dist dist
COPY --from=build /src/bridge/gen gen
COPY --from=build /src/web/dist web
COPY --from=plugin /out plugin
COPY LICENSE THIRD_PARTY_NOTICES.md ./
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 64080
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:64080/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.mjs"]
