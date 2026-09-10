FROM node:20-bookworm-slim

WORKDIR /app

COPY whatsapp-bridge/package.json whatsapp-bridge/package-lock.json ./
RUN npm ci --omit=dev

COPY whatsapp-bridge/server.js whatsapp-bridge/history-patch.mjs ./
RUN node history-patch.mjs && rm history-patch.mjs

ENV NODE_ENV=production
ENV PORT=3000
ENV AUTH_DIR=/data/auth
ENV MESSAGE_CACHE_FILE=/data/message-cache.json
ENV SESSION_LOCK_FILE=/data/bridge.lock

RUN mkdir -p /data/auth

EXPOSE 3000

CMD ["npm", "start"]
