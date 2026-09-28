#!/usr/bin/env bash
# Startet Xvfb, PulseAudio (Null-Sink) und Mumble. Argumente werden an mumble durchgereicht.
set -u
export DISPLAY=:99 XDG_RUNTIME_DIR=/tmp/xdg; mkdir -p $XDG_RUNTIME_DIR && chmod 700 $XDG_RUNTIME_DIR
Xvfb :99 -screen 0 1280x800x24 -nolisten tcp >/tmp/xvfb.log 2>&1 &
pulseaudio --start --exit-idle-time=-1 --log-target=file:/tmp/pulse.log 2>/dev/null
pactl load-module module-null-sink sink_name=null >/dev/null 2>&1 || true
sleep 1
exec mumble "$@"
