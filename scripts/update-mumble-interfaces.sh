#!/usr/bin/env bash
# Übernimmt die Mumble-Schnittstellendateien eines Release-Tags nach third_party/mumble.
# Aufruf: scripts/update-mumble-interfaces.sh <tag>   (z. B. v1.6.870)
# Ohne Tag wird nur geprüft, ob die Dateien zu SHA256SUMS passen.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
dir="$root/third_party/mumble"
files=(plugins/MumblePlugin.h src/murmur/MumbleServer.ice LICENSE)

if [[ $# -eq 0 ]]; then
	cd "$dir"
	sha256sum --check --quiet SHA256SUMS
	echo "OK: $(cat VERSION)"
	exit 0
fi

tag="$1"
base="https://raw.githubusercontent.com/mumble-voip/mumble/$tag"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

for f in "${files[@]}"; do
	mkdir -p "$tmp/$(dirname "$f")"
	curl -fsSL "$base/$f" -o "$tmp/$f"
done

diff -ru --exclude=VERSION --exclude=SHA256SUMS --exclude=README.md "$dir" "$tmp" || true

for f in "${files[@]}"; do
	mkdir -p "$dir/$(dirname "$f")"
	cp "$tmp/$f" "$dir/$f"
done
echo "$tag" > "$dir/VERSION"
(cd "$dir" && sha256sum plugins/MumblePlugin.h src/murmur/MumbleServer.ice > SHA256SUMS)
echo "Übernommen: $tag. Bitte docs/analyse/mumble-schnittstellen.md gegen die Unterschiede prüfen."
