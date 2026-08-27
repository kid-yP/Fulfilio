FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    libssl-dev \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY api/package*.json api/
RUN cd api && npm ci

COPY api/ api/
RUN cd api && npx prisma generate && npm run build

COPY worker/package*.json worker/
RUN cd worker && npm ci

COPY worker/ worker/
RUN cd worker && npx prisma generate && npm run build

COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

ENV PORT=7860

CMD ["/app/start.sh"]