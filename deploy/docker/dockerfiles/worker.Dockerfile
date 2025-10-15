# ============================================
# Stage 1: Dependencies
# ============================================
FROM node:20-alpine AS dependencies

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy package files
COPY worklenz-backend/package*.json ./

# Install all dependencies (including dev dependencies for build)
RUN npm ci

# ============================================
# Stage 2: Builder
# ============================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependencies from previous stage
COPY --from=dependencies /app/node_modules ./node_modules

# Copy source code
COPY worklenz-backend/ ./

# Build the application
RUN npm run build

# ============================================
# Stage 3: Production
# ============================================
FROM node:20-alpine AS production

# Create non-root user
RUN addgroup -g 1001 -S worklenz && \
    adduser -S worklenz -u 1001

WORKDIR /app

# Install production dependencies only
COPY worklenz-backend/package*.json ./
RUN npm ci --only=production && \
    npm cache clean --force

# Copy built application from builder
COPY --from=builder --chown=worklenz:worklenz /app/build ./build

# Copy database files (if worker needs migrations)
COPY --chown=worklenz:worklenz worklenz-backend/database ./database

# Set environment variables
ENV NODE_ENV=production \
    WORKER_MODE=true

# Switch to non-root user
USER worklenz

# Health check (worker specific - checks if process is running)
HEALTHCHECK --interval=60s --timeout=10s --start-period=40s --retries=3 \
    CMD ps aux | grep -v grep | grep -q node || exit 1

# Start the worker
# Note: This will need a worker entry point to be created in backend
# For now, it uses the same entry but WORKER_MODE env var can be used to run only workers
CMD ["node", "build/bin/www.js"]
