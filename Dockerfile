# GreenIA: servidor (API + frontend) em um contêiner.
# Build a partir da raiz do repositório:  docker build -t greenia .
# O mesmo processo atende a API, entrega o frontend e processa a fila.
# Imagens oficiais do Docker pelo espelho público da AWS (public.ecr.aws/docker/library),
# que não tem o limite de downloads anônimos do Docker Hub.
# Debian (não Alpine): OCRmyPDF, Tesseract com português, ImageMagick com HEIC e
# LibreOffice sem interface vêm prontos do apt.
ARG NODE_IMAGE=public.ecr.aws/docker/library/node:24-bookworm-slim

FROM ${NODE_IMAGE} AS deps
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

FROM ${NODE_IMAGE}
# OCR (OCRmyPDF + Tesseract por), imagens (ImageMagick + libheif para HEIC) e
# DOC/XLS/ODT/ODS (LibreOffice Writer e Calc, sem Java e sem interface).
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ocrmypdf tesseract-ocr tesseract-ocr-por \
      imagemagick libheif1 \
      libreoffice-writer-nogui libreoffice-calc-nogui \
      fonts-dejavu-core wget ca-certificates \
 && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    FRONTEND_DIR=/app/ \
    PORT=8080
WORKDIR /app
COPY --from=deps /app/server/node_modules server/node_modules
COPY server/package.json server/tsconfig.json server/
COPY server/src server/src
COPY server/migrations server/migrations
COPY server/deploy server/deploy
COPY server/catalog server/catalog
COPY lib lib
COPY ["GreenIA.dc.html", "Política GreenIA.dc.html", "Assistentes GreenIA.dc.html", "support.js", "./"]
COPY assets assets
USER node
WORKDIR /app/server
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:8080/health || exit 1
# O Node 24 roda o TypeScript direto (remoção de tipos), sem etapa de build.
CMD ["node", "src/index.ts"]
