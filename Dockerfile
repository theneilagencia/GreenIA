# GreenIA Lite: um processo Node, banco SQLite no volume /app/dados.
# Mesma imagem oficial do Docker Hub, pelo espelho da AWS (sem limite de downloads anônimos).
ARG IMAGEM_NODE=public.ecr.aws/docker/library/node:22-slim
FROM ${IMAGEM_NODE}
ENV NODE_ENV=production BANCO=/app/dados/greenia.sqlite PORTA=8080
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY src ./src
COPY public ./public
COPY scripts/backup.js scripts/restaurar.js ./scripts/
COPY modelos-quick-win.json ./
RUN mkdir -p /app/dados && chown node:node /app/dados
USER node
VOLUME /app/dados
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/api/saude').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "--disable-warning=ExperimentalWarning", "src/iniciar.js"]
