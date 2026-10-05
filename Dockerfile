ARG IMAGEM_NODE=public.ecr.aws/docker/library/node:22-slim
FROM ${IMAGEM_NODE}
ENV NODE_ENV=test BANCO=/app/dados/greenia.sqlite CHROMIUM_PATH=/usr/bin/chromium
RUN apt-get update && apt-get install -y --no-install-recommends chromium fonts-dejavu-core ca-certificates \
  && rm -rf /var/lib/apt/lists/* /usr/share/doc/* /usr/share/man/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN mkdir -p /app/dados
RUN npm test && npm run test:e2e
EXPOSE 8080
CMD ["node", "--disable-warning=ExperimentalWarning", "src/iniciar.js"]
