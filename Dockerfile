FROM node:22-slim

WORKDIR /app

# Install OpenSSL for Prisma
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Copy dependency manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma ./prisma/

# Install pnpm and dependencies
RUN corepack enable && corepack prepare pnpm@11.24.0 --activate
RUN pnpm install --frozen-lockfile --ignore-scripts

# Generate Prisma client
RUN npx prisma generate

# Copy source needed by the WebSocket server. Keeping the library tree together
# prevents a new transitive import from being omitted from the container image.
COPY tsconfig.json ./
COPY websocket-server.ts ./
COPY src/lib ./src/lib

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["pnpm", "ws:start"]
