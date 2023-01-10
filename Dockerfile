FROM node:16-alpine

RUN apk add --update --no-cache git

WORKDIR /usr/app

RUN git submodule update --init --recursive

COPY . .

RUN yarn && yarn build

CMD ["node", "dist/index.js"]