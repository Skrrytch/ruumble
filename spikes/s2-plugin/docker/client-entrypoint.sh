#!/usr/bin/env bash
# Test-Client für S2: Einstellungen vorbelegen (kein Assistent, Plugin aktiv, Server-Zertifikat vertraut),
# dann Mumble headless starten und zum Server verbinden.
# Umgebung: SERVER_HOST, SERVER_PORT, SERVER_DIGEST (SHA1 hex), USERNAME, RUUMBLE_SPIKE_DIR
set -eu
export DISPLAY=:99 XDG_RUNTIME_DIR=/tmp/xdg
mkdir -p "$XDG_RUNTIME_DIR" && chmod 700 "$XDG_RUNTIME_DIR" && mkdir -p "$RUUMBLE_SPIKE_DIR"

data=~/.local/share/Mumble/Mumble; conf=~/.config/Mumble/Mumble
mkdir -p "$data/Plugins" "$conf"
plugin="$data/Plugins/libruumble_spike.so"
cp /plugin/libruumble_spike.so "$plugin"
hash=$(printf '%s' "$plugin" | sha1sum | cut -d' ' -f1)

# Client-Zertifikat (statt Zertifikats-Assistent). Der SHA1 des Zertifikats ist der Hash, den Server und Plugin melden.
openssl req -x509 -newkey rsa:2048 -nodes -keyout /tmp/client.key -out /tmp/client.crt -days 30 -subj "/CN=$USERNAME" 2>/dev/null
openssl pkcs12 -export -inkey /tmp/client.key -in /tmp/client.crt -passout pass: -out /tmp/client.p12
cert_b64=$(base64 -w0 /tmp/client.p12)
# Sicherungsdatei im Dokumente-Ordner: Mumble liest sie beim Start, falls kein Zertifikat gesetzt ist (nötig für 1.4).
mkdir -p ~/Documents && cp /tmp/client.p12 ~/Documents/MumbleAutomaticCertificateBackup.p12
cert_sha1=$(openssl x509 -in /tmp/client.crt -noout -fingerprint -sha1 | cut -d= -f2 | tr -d ':' | tr 'A-F' 'a-f')
echo "{\"ev\":\"clientCert\",\"sha1\":\"$cert_sha1\"}" >> "$RUUMBLE_SPIKE_DIR/events.jsonl"

Xvfb :99 -screen 0 1280x800x24 -nolisten tcp >/tmp/xvfb.log 2>&1 &
sleep 1
# Version aus dem Paketmanager (mumble --version öffnet unter 1.4 ein Fenster und bleibt stehen)
version=$( (dpkg-query -W -f='${Version}' mumble 2>/dev/null || rpm -q --qf '%{VERSION}' mumble) | grep -oE '^[0-9]+\.[0-9]+\.[0-9]+')
echo "{\"ev\":\"client\",\"mumble\":\"$version\"}" >> "$RUUMBLE_SPIKE_DIR/events.jsonl"
case "$version" in
  1.4.*)
    # Mumble 1.4: QSettings (INI)
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
    # Mumble ≥ 1.5: JSON
    cat > "$conf/mumble_settings.json" <<JSON
{
  "settings_version": 1,
  "certificate": "$cert_b64",
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

pulseaudio --start --exit-idle-time=-1 --log-target=file:/tmp/pulse.log 2>/dev/null
pactl load-module module-null-sink sink_name=null >/dev/null
pactl load-module module-sine-source source_name=mic frequency=440 >/dev/null  # "Mikrofon" für Sprechereignisse
pactl set-default-sink null && pactl set-default-source mic
sleep 1
exec mumble "mumble://$USERNAME@$SERVER_HOST:$SERVER_PORT/"
