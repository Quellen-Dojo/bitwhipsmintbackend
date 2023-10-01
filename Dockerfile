FROM node:16-alpine

WORKDIR /usr/app

COPY . .

RUN yarn install --frozen-lockfile
RUN yarn build

CMD ["node", "dist/index.js"]