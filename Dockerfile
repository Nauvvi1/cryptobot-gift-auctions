FROM node:20-alpine

WORKDIR /app
COPY package.json tsconfig.json ./
RUN npm install

COPY src ./src
COPY public ./public
COPY README.md ./

RUN npm run build

ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "dist/main.js"]
