FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY pnpm-lock.yaml ./

# Install pnpm and dependencies
RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile

# Copy source code
COPY api/ ./api/
COPY tsconfig.json ./

# Build the server application (TypeScript only)
RUN pnpm run build:server

# Expose port
EXPOSE 3001

# Start the server
CMD ["node", "dist/api/server.js"]