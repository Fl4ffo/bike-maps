# Immagine unica dell'app: builda frontend (web/) e API (api/), runtime solo prod.
# Build dal root del repo:  docker build -f infra/api.Dockerfile .
FROM node:22-slim AS webbuild
WORKDIR /src/web
COPY web/package*.json ./
RUN npm ci --no-fund --no-audit
COPY web/ .
RUN npm run build

FROM node:22-slim AS apibuild
WORKDIR /src/api
COPY api/package*.json ./
RUN npm ci --no-fund --no-audit
COPY api/ .
RUN npm run build

# Dipendenze di produzione: qui c'e' il toolchain per compilare i moduli nativi
# (better-sqlite3) se manca il prebuild per l'architettura — es. arm64 su Oracle
# Ampere. Il compilatore resta in questo stage, NON nell'immagine finale.
FROM node:22-slim AS proddeps
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY api/package*.json ./
RUN npm ci --omit=dev --no-fund --no-audit

FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app
# node_modules gia' compilati (stesso base image + stessa arch = ABI compatibile)
COPY --from=proddeps /app/node_modules ./node_modules
COPY api/package*.json ./
COPY --from=apibuild /src/api/dist ./dist
COPY --from=webbuild /src/web/dist ./web-dist
ENV WEB_DIST=/app/web-dist
EXPOSE 8790
CMD ["node", "dist/server.js"]
