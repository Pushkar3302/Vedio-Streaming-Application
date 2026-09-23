FROM node:24-bookworm-slim AS build
WORKDIR /app
ENV MONGOMS_DISABLE_POSTINSTALL=1
COPY package.json package-lock.json ./
COPY client/package.json ./client/package.json
COPY server/package.json ./server/package.json
RUN npm ci
COPY client ./client
COPY server ./server
RUN npm run build && npm prune --omit=dev

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=5000 STORAGE_DIR=/var/data/streamx
COPY --from=build --chown=node:node /app /app
RUN mkdir -p /var/data/streamx && chown -R node:node /var/data
USER node
EXPOSE 5000
CMD ["node", "server/index.js"]
