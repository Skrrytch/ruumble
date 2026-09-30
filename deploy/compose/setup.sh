#!/bin/sh
# Prepares the combined template mumble-with-ruumble.docker-compose.yml (https://github.com/Skrrytch/ruumble):
# creates the two Ice secrets if they do not exist yet and prints the remaining steps.
# Run it in the folder of the Compose file; running it again changes nothing.
set -eu
cd "$(dirname "$0")"

# The folder is closed to other users; the files must stay readable for the containers' users
# (Docker mounts them as they are, and Ruumble runs as the unprivileged user node).
mkdir -p secrets && chmod 700 secrets
for name in ice_read ice_write; do
  if [ -s "secrets/$name" ]; then
    echo "secrets/$name exists, kept"
  else
    od -An -N24 -tx1 /dev/urandom | tr -d ' \n' > "secrets/$name"
    echo "secrets/$name created"
  fi
  chmod 644 "secrets/$name"
done
[ -f docker-compose.yml ] || [ ! -f mumble-with-ruumble.docker-compose.yml ] || cp mumble-with-ruumble.docker-compose.yml docker-compose.yml

address="$(hostname -I 2>/dev/null | awk '{print $1}')"
cat <<TEXT

Next steps:
  1. docker compose up -d
  2. In Mumble, add this line to the description of the top (root) channel:
       ruumble: http://${address:-<address of this server>}:64080
  3. Open http://${address:-<address of this server>}:64080 in the browser: it offers the plugin for Mumble.
TEXT
