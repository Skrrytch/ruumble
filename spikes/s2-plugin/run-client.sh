#!/usr/bin/env bash
# Startet einen Test-Client-Container: run-client.sh <distro> <username>
set -eu
cd "$(dirname "$0")"
distro=$1 user=$2 name="s2-$1-$2"
digest=$(echo | openssl s_client -connect 127.0.0.1:64738 2>/dev/null | openssl x509 -noout -fingerprint -sha1 | cut -d= -f2 | tr -d ':' | tr 'A-F' 'a-f')
out="$PWD/out/$distro-$user"; rm -rf "$out"; mkdir -p "$out"; chmod 777 "$out"
docker rm -f "$name" >/dev/null 2>&1 || true
docker run -d --name "$name" --network s1-ice_default \
  -e SERVER_HOST=mumble -e SERVER_PORT=64738 -e SERVER_DIGEST="$digest" -e USERNAME="$user" -e RUUMBLE_SPIKE_DIR=/spike \
  -v "$PWD/build:/plugin:ro" -v "$PWD/docker/client-entrypoint.sh:/entrypoint.sh:ro" -v "$out:/spike" \
  "ruumble-s2-$distro" /entrypoint.sh >/dev/null
echo "$name → $out"
