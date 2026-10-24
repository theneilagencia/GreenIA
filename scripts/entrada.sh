#!/bin/sh
# Entrada do contêiner. Discos montados pela plataforma (Render, volumes novos)
# podem chegar como root: acerta o dono da pasta de dados e roda como "node".
set -e
backup_publicacao() {
  case "$*" in
    *src/iniciar.js*) node --disable-warning=ExperimentalWarning /app/scripts/backup-pre-publicacao.mjs ;;
  esac
}
if [ "$(id -u)" = "0" ]; then
  mkdir -p /app/dados
  chown -R node:node /app/dados
  case "$*" in
    *src/iniciar.js*) setpriv --reuid=node --regid=node --init-groups node --disable-warning=ExperimentalWarning /app/scripts/backup-pre-publicacao.mjs ;;
  esac
  exec setpriv --reuid=node --regid=node --init-groups "$@"
fi
backup_publicacao "$@"
exec "$@"
