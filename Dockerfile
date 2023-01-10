FROM --platform=linux/amd64 node:16-alpine AS builder
RUN apk update && \
  apk upgrade && \
  apk add \
  git \
  python3

WORKDIR /usr/app

COPY . .

# RUN git submodule update --init --recursive

RUN yarn && yarn build

CMD ["node", "dist/index.js"]