FROM node:20-bookworm-slim

WORKDIR /app

COPY whatsapp-bridge/package.json whatsapp-bridge/package-lock.json ./
RUN npm ci --omit=dev

COPY whatsapp-bridge/server.js ./

ENV NODE_ENV=production
ENV PORT=3000
ENV AUTH_DIR=/data/auth
ENV MESSAGE_CACHE_FILE=/data/message-cache.json

RUN mkdir -p /data/auth

VOLUME ["/data"]
EXPOSE 3000

CMD ["npm", "start"]
