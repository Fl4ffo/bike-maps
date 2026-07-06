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

FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app
COPY api/package*.json ./
RUN npm ci --omit=dev --no-fund --no-audit
COPY --from=apibuild /src/api/dist ./dist
COPY --from=webbuild /src/web/dist ./web-dist
ENV WEB_DIST=/app/web-dist
EXPOSE 3000
CMD ["node", "dist/server.js"]
