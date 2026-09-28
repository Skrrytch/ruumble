#!/usr/bin/env bash
# Startet einen headless Mumble-Client mit Ruumble-Plugin im Netz von ruumble-local.
#   deploy/local/run-client.sh <ubuntu|debian|fedora> <Name>
#   BRIDGE_URL= deploy/local/run-client.sh …   → ohne feste Adresse (Erkennung über die Root-Beschreibung)
# Voraussetzung: Images aus spikes/s2-plugin (docker build -t ruumble-s2-<distro> …) und plugin/build.
set -eu
cd "$(dirname "$0")"
distro=$1 user=$2 name="ruumble-client-$2"
root="$(cd ../.. && pwd)"
digest=$(echo | openssl s_client -connect 127.0.0.1:64738 2>/dev/null | openssl x509 -noout -fingerprint -sha1 | cut -d= -f2 | tr -d ':' | tr 'A-F' 'a-f')
out="$root/deploy/local/out/$user"; rm -rf "$out"; mkdir -p "$out"; chmod 777 "$out"
docker rm -f "$name" >/dev/null 2>&1 || true
docker run -d --name "$name" --network ruumble-local_default \
  -e SERVER_HOST=mumble -e SERVER_PORT=64738 -e SERVER_DIGEST="$digest" -e USERNAME="$user" \
  -e BRIDGE_URL="${BRIDGE_URL-http://ruumble:8080}" -e OUT=/out \
  -v "$root/plugin/build:/plugin:ro" -v "$root/deploy/local/client-entrypoint.sh:/entrypoint.sh:ro" -v "$out:/out" \
  "ruumble-s2-$distro" /entrypoint.sh >/dev/null
echo "$name → $out"
