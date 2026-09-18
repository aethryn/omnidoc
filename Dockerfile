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

# Copy source needed by the WebSocket server
COPY tsconfig.json ./
COPY websocket-server.ts ./
COPY src/lib/prisma.ts ./src/lib/prisma.ts
COPY src/lib/document-yjs.ts ./src/lib/document-yjs.ts
COPY src/lib/document-content.ts ./src/lib/document-content.ts
COPY src/lib/document-version.ts ./src/lib/document-version.ts
COPY src/lib/omnidoc-image-extension.ts ./src/lib/omnidoc-image-extension.ts
COPY src/lib/collaboration-bus.ts ./src/lib/collaboration-bus.ts
COPY src/lib/websocket-liveness.ts ./src/lib/websocket-liveness.ts

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["pnpm", "ws:start"]
