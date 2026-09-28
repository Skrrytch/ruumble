#!/usr/bin/env bash
# Headless Mumble-Client mit Ruumble-Plugin für Live-Tests (Grundlage: spikes/s2-plugin).
# Umgebung: SERVER_HOST, SERVER_PORT, SERVER_DIGEST, USERNAME, BRIDGE_URL, OUT (Verzeichnis für Protokolle)
set -eu
export DISPLAY=:99 XDG_RUNTIME_DIR=/tmp/xdg
mkdir -p "$XDG_RUNTIME_DIR" "$OUT" && chmod 700 "$XDG_RUNTIME_DIR"

data=~/.local/share/Mumble/Mumble; conf=~/.config/Mumble/Mumble
mkdir -p "$data/Plugins" "$conf" ~/.config/ruumble ~/Documents ~/bin
plugin="$data/Plugins/libruumble.so"
cp /plugin/libruumble.so "$plugin"
hash=$(printf '%s' "$plugin" | sha1sum | cut -d' ' -f1)

# Plugin-Konfiguration (ohne BRIDGE_URL: Adresse aus der Root-Beschreibung) und ein xdg-open,
# das den Kopplungslink nur festhält (kein Browser im Container)
if [ -n "${BRIDGE_URL:-}" ]; then
  printf '{ "bridgeUrl": "%s", "autoOpen": true }\n' "$BRIDGE_URL" > ~/.config/ruumble/plugin.json
else
  printf '{ "autoOpen": true }\n' > ~/.config/ruumble/plugin.json
fi
printf '#!/bin/sh\necho "$1" > "%s/pair-url.txt"\n' "$OUT" > ~/bin/xdg-open && chmod +x ~/bin/xdg-open
export PATH=~/bin:$PATH

openssl req -x509 -newkey rsa:2048 -nodes -keyout /tmp/c.key -out /tmp/c.crt -days 30 -subj "/CN=$USERNAME" 2>/dev/null
openssl pkcs12 -export -inkey /tmp/c.key -in /tmp/c.crt -passout pass: -out ~/Documents/MumbleAutomaticCertificateBackup.p12
openssl x509 -in /tmp/c.crt -noout -fingerprint -sha1 | cut -d= -f2 | tr -d ':' | tr 'A-F' 'a-f' > "$OUT/cert-sha1.txt"

version=$( (dpkg-query -W -f='${Version}' mumble 2>/dev/null || rpm -q --qf '%{VERSION}' mumble) | grep -oE '^[0-9]+\.[0-9]+\.[0-9]+')
echo "$version" > "$OUT/mumble-version.txt"
case "$version" in
  1.4.*)
    cat > ~/.config/Mumble/Mumble.conf <<INI
[General]
lastupdate=3
[audio]
input=PulseAudio
output=PulseAudio
transmit=0
[plugins]
$hash\\path=$plugin
$hash\\enabled=true
$hash\\positionalDataEnabled=false
$hash\\allowKeyboardMonitoring=false
INI
    ;;
  *)
    cat > "$conf/mumble_settings.json" <<JSON
{
  "settings_version": 1,
  "misc": { "audio_wizard_has_been_shown": true },
  "audio": { "input_system": "PulseAudio", "output_system": "PulseAudio", "transmit_mode": "Continuous", "mute_cue_popup_shown": true },
  "update": { "check_for_updates": false, "check_for_plugin_updates": false },
  "plugins": { "$hash": { "path": "$plugin", "enabled": true, "positional_data_enabled": false, "keyboard_monitoring_allowed": false } }
}
JSON
    ;;
esac
sqlite3 "$data/mumble.sqlite" "CREATE TABLE IF NOT EXISTS cert (id INTEGER PRIMARY KEY AUTOINCREMENT, hostname TEXT, port INTEGER, digest TEXT);
  INSERT INTO cert (hostname, port, digest) VALUES ('$SERVER_HOST', $SERVER_PORT, '$SERVER_DIGEST');"

Xvfb :99 -screen 0 1280x800x24 -nolisten tcp >/tmp/xvfb.log 2>&1 &
pulseaudio --start --exit-idle-time=-1 --log-target=file:/tmp/pulse.log 2>/dev/null
pactl load-module module-null-sink sink_name=null >/dev/null
pactl load-module module-sine-source source_name=mic frequency=440 >/dev/null
pactl set-default-sink null && pactl set-default-source mic
sleep 1
exec mumble "mumble://$USERNAME@$SERVER_HOST:$SERVER_PORT/" > "$OUT/mumble.log" 2>&1
