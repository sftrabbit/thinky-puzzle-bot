FROM node:16.13-alpine

WORKDIR /thinky-puzzle-bot

COPY package.json package-lock.json index.js scrapers.js ./
RUN npm install -g npm@8.4.0
RUN npm install --production

CMD ["npm", "start"]
