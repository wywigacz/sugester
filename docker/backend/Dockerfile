# Production Dockerfile for Sugester Backend
# Multi-stage build: build frontend, then production image

# Stage 1: Build frontend assets (needs esbuild devDependency)
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files for workspace setup
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
COPY scripts/package.json ./scripts/

# Install ALL dependencies (including devDeps for esbuild)
RUN npm install

# Copy frontend source and build
COPY frontend/ ./frontend/
RUN cd frontend && node build.js

# Stage 2: Production image
FROM node:20-alpine AS production

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY scripts/package.json ./scripts/
# Need frontend package.json for workspace resolution
COPY frontend/package.json ./frontend/

# Install production dependencies only
RUN npm install --omit=dev

# Copy application code
COPY backend/ ./backend/
COPY scripts/ ./scripts/
COPY elasticsearch/ ./elasticsearch/

# Copy merchandising config only (feed files are fetched at runtime via --cyfrowe)
COPY data/merchandising/ ./data/merchandising/

# Copy built frontend from builder stage (includes dist/)
COPY --from=builder /app/frontend/ ./frontend/

# Copy production env as .env
COPY .env.production ./.env

# Expose port
EXPOSE 3000

# Healthcheck
HEALTHCHECK --interval=15s --timeout=5s --retries=3 --start-period=10s \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Start backend
CMD ["node", "backend/src/server.js"]
