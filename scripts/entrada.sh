#!/bin/sh
# Entrada do contêiner. Discos montados pela plataforma (Render, volumes novos)
# podem chegar como root: acerta o dono da pasta de dados e roda como "node".
set -e
if [ "$(id -u)" = "0" ]; then
  mkdir -p /app/dados
  chown -R node:node /app/dados
  exec setpriv --reuid=node --regid=node --init-groups "$@"
fi
exec "$@"
