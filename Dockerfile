# GreenIA: servidor (API + frontend) em um contêiner.
# Build a partir da raiz do repositório:  docker build -t greenia .
# O mesmo processo atende a API, entrega o frontend e processa a fila.

FROM node:24-alpine AS deps
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

FROM node:24-alpine
ENV NODE_ENV=production \
    FRONTEND_DIR=/app/ \
    PORT=8080
WORKDIR /app
COPY --from=deps /app/server/node_modules server/node_modules
COPY server/package.json server/tsconfig.json server/
COPY server/src server/src
COPY server/migrations server/migrations
COPY server/deploy server/deploy
COPY lib lib
COPY ["GreenIA.dc.html", "Política GreenIA.dc.html", "support.js", "./"]
COPY assets assets
USER node
WORKDIR /app/server
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:8080/health || exit 1
# O Node 24 roda o TypeScript direto (remoção de tipos), sem etapa de build.
CMD ["node", "src/index.ts"]
