# Ruumble service with web UI (ADR-0008). Build context: repository root.
#   docker build -f deploy/Dockerfile -t ruumble .
#
# Licence: the service uses Ice for JavaScript (GPL-2.0). The image as a combined work is GPL-2.0 (E26);
# the Ruumble source code itself is under BSD-3-Clause.

# Plugin: built on Debian 12 (glibc 2.36) so that it also runs on older distributions
FROM debian:bookworm-slim AS plugin
RUN apt-get update && apt-get install -y --no-install-recommends cmake g++ make libssl-dev git ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /src
COPY third_party third_party
COPY plugin plugin
RUN cmake -S plugin -B plugin/build -DCMAKE_BUILD_TYPE=Release -DRUUMBLE_TESTS=OFF \
    && cmake --build plugin/build -j"$(nproc)" \
    && mkdir -p /out && cp plugin/build/*.mumble_plugin /out/

FROM node:22-bookworm-slim AS build
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
# only the runtime dependencies of the service (fastify, ice)
RUN pnpm -F @ruumble/bridge deploy --prod --legacy /out

FROM node:22-bookworm-slim
LABEL org.opencontainers.image.title="Ruumble" \
      org.opencontainers.image.description="Mumble-Server als Bürogebäude" \
      org.opencontainers.image.source="https://github.com/Skrrytch/ruumble" \
      org.opencontainers.image.licenses="GPL-2.0-only AND BSD-3-Clause"
ENV NODE_ENV=production WEB_DIST=/app/web DATA_DIR=/data PORT=8080 PLUGIN_BUNDLE_DIR=/app/plugin
WORKDIR /app
COPY --from=build /out/node_modules node_modules
COPY --from=build /src/bridge/dist dist
COPY --from=build /src/bridge/gen gen
COPY --from=build /src/web/dist web
COPY --from=plugin /out plugin
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:8080/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.mjs"]
