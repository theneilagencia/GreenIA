#!/bin/sh
# Inicialização exclusiva do serviço novo de QA. Não altera a entrada de produção.
set -eu
: "${RENDER_EXTERNAL_HOSTNAME:?Hostname do serviço de QA ausente}"
: "${RENDER_EXTERNAL_URL:?URL do serviço de QA ausente}"
case "$RENDER_EXTERNAL_HOSTNAME" in
  greenia-qa-release.onrender.com|greenia-qa-release-*.onrender.com) ;;
  *) echo 'Recusada inicialização de QA fora do serviço greenia-qa-release.' >&2; exit 1 ;;
esac
[ "${NODE_ENV:-}" = production ] || { echo 'QA exige modo production, sem simulação automática.' >&2; exit 1; }
[ "${MULTIEMPRESA:-}" = 1 ] || { echo 'QA exige isolamento multiempresa.' >&2; exit 1; }
[ "${BANCO_PLATAFORMA:-}" = /app/dados/qa/plataforma.sqlite ] || { echo 'Banco de QA não configurado.' >&2; exit 1; }
[ "${PASTA_EMPRESAS:-}" = /app/dados/qa/empresas ] || { echo 'Pasta de QA não configurada.' >&2; exit 1; }
[ "${ENSAIO_ISOLADO:-0}" != 1 ] || { echo 'Ensaio simulado não permitido neste serviço.' >&2; exit 1; }
export PLATAFORMA_HOST="$RENDER_EXTERNAL_HOSTNAME"
export PLATAFORMA_URL="$RENDER_EXTERNAL_URL"
export URL_PUBLICA="$RENDER_EXTERNAL_URL"
mkdir -p /app/dados/qa/empresas
exec node src/iniciar.js
