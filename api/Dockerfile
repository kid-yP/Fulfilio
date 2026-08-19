FROM node:20-bookworm-slim

WORKDIR /app

# Prisma engine + native modules need these on Debian
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    libssl-dev \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY . .
RUN npx prisma generate
RUN npm run build

EXPOSE 4000

CMD ["npm", "start"]