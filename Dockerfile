FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY server ./server
COPY public ./public
COPY aura-lan.apk ./aura-lan.apk

ENV PORT=8088
EXPOSE 8088

CMD ["node", "server/index.js"]
