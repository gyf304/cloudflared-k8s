FROM curlimages/curl:7.83.0 AS downloader

RUN curl -f -L -o /tmp/cloudflared https://github.com/cloudflare/cloudflared/releases/download/2022.5.1/cloudflared-linux-$(uname -m | sed -e 's/aarch/arm/' -e 's/x86_64/amd64/')

FROM node:18-alpine

WORKDIR /app
COPY . .
RUN yarn install
RUN yarn build
COPY --from=downloader --chmod=755 /tmp/cloudflared /usr/local/bin/cloudflared

CMD ["node", "index.js"]
