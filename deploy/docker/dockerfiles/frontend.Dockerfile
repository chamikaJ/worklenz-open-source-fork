# ============================================
# Stage 1: Dependencies
# ============================================
FROM node:22-alpine AS dependencies

WORKDIR /app

# Copy package files
COPY worklenz-frontend/package*.json ./

# Install dependencies
RUN npm ci

# ============================================
# Stage 2: Builder
# ============================================
FROM node:22-alpine AS builder

WORKDIR /app

# Copy dependencies from previous stage
COPY --from=dependencies /app/node_modules ./node_modules

# Copy source code
COPY worklenz-frontend/ ./

# Build the application
RUN npm run build

# ============================================
# Stage 3: Production
# ============================================
FROM node:22-alpine AS production

# Create non-root user
RUN addgroup -g 1001 -S worklenz && \
    adduser -S worklenz -u 1001

WORKDIR /app

# Install serve globally
RUN npm install -g serve

# Copy built application from builder
COPY --from=builder --chown=worklenz:worklenz /app/build ./build

# Create runtime environment config script
RUN echo '#!/bin/sh' > /app/env-config.sh && \
    echo 'cat > /app/build/env-config.js << EOL' >> /app/env-config.sh && \
    echo 'window.VITE_API_URL="${VITE_API_URL}";' >> /app/env-config.sh && \
    echo 'window.VITE_SOCKET_URL="${VITE_SOCKET_URL}";' >> /app/env-config.sh && \
    echo 'EOL' >> /app/env-config.sh && \
    chmod +x /app/env-config.sh && \
    chown worklenz:worklenz /app/env-config.sh

# Create startup script
RUN echo '#!/bin/sh' > /app/start.sh && \
    echo '# Generate runtime environment configuration' >> /app/start.sh && \
    echo '/app/env-config.sh' >> /app/start.sh && \
    echo '# Start the server' >> /app/start.sh && \
    echo 'exec serve -s build -l 5000' >> /app/start.sh && \
    chmod +x /app/start.sh && \
    chown worklenz:worklenz /app/start.sh

# Switch to non-root user
USER worklenz

# Set default environment variables (can be overridden)
ENV VITE_API_URL=http://localhost:3000 \
    VITE_SOCKET_URL=ws://localhost:3000

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:5000 || exit 1

# Start the application
CMD ["/app/start.sh"]
