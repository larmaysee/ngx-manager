FROM node:18-alpine

WORKDIR /app

# Install curl for health checks
RUN apk add --no-cache curl

# Copy package files
COPY package*.json ./
COPY pnpm-lock.yaml ./

# Install pnpm and dependencies
RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile

# Copy source code
COPY api/ ./api/
COPY tsconfig.json ./
COPY tsconfig.server.json ./

# Build the server application (TypeScript only)
RUN pnpm run build:server

# Expose port
EXPOSE 5500

# Start the server
CMD ["node", "--es-module-specifier-resolution=node", "dist/api/server.js"]