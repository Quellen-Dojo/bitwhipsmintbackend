FROM node:16-alpine

RUN apk add --update --no-cache git

WORKDIR /usr/app

COPY . .

RUN git submodule update --init --recursive

RUN yarn && yarn build

CMD ["node", "dist/index.js"]