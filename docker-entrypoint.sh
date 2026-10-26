#!/bin/sh
# Démarrage du conteneur : le dossier de données monté (./data) est souvent créé
# par Docker au nom de root sur l'hôte. On le rend à l'utilisateur « node »,
# puis l'application tourne sans privilèges (setpriv, fourni par util-linux).
set -e
if [ "$(id -u)" = "0" ]; then
  mkdir -p "${JOBSCOUT_DATA_DIR:-/data}"
  chown -R node:node "${JOBSCOUT_DATA_DIR:-/data}"
  exec setpriv --reuid=node --regid=node --init-groups -- "$@"
fi
exec "$@"
