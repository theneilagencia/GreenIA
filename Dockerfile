# GreenIA Lite: um processo Node, banco SQLite no volume /app/dados.
# Mesma imagem oficial do Docker Hub, pelo espelho da AWS (sem limite de downloads anônimos).
ARG IMAGEM_NODE=public.ecr.aws/docker/library/node:22-slim
FROM ${IMAGEM_NODE}
ENV NODE_ENV=production BANCO=/app/dados/greenia.sqlite CHROMIUM_PATH=/usr/bin/chromium
# Chromium sem interface: compõe as peças desenhadas pela IA (JavaScript da página desligado e rede bloqueada).
# Fontes da peça vêm empacotadas no código; o pacote de fontes do sistema é só o mínimo do navegador.
RUN apt-get update && apt-get install -y --no-install-recommends chromium fonts-dejavu-core ca-certificates \
  && rm -rf /var/lib/apt/lists/* /usr/share/doc/* /usr/share/man/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY src ./src
COPY test ./test
COPY public ./public
COPY scripts/backup.js scripts/restaurar.js scripts/verificar.js scripts/entrada.sh ./scripts/
COPY modelos-quick-win.json ./
COPY deploy/admins-plataforma.txt ./deploy/
RUN npm test
RUN mkdir -p /app/dados && chown node:node /app/dados && chmod +x scripts/entrada.sh
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORTA || process.env.PORT || 8080) + '/api/saude').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
ENTRYPOINT ["scripts/entrada.sh"]
CMD ["node", "--disable-warning=ExperimentalWarning", "src/iniciar.js"]
