# Atomic-UI Dockerfile
# 
# Multi-stage build for optimized production image
# 
# This Dockerfile creates a minimal, secure container for running Atomic-UI
# in production environments. It uses a multi-stage build to keep the final
# image size small while including all necessary dependencies.
#
# Build:
#   docker build -t atomic-ui .
#
# Run:
#   docker run -p 3000:3000 -v atomic-data:/app/data atomic-ui

# ==============================================================================
# Stage 1: Dependencies
# ==============================================================================
# This stage installs all npm dependencies including devDependencies needed
# for building. The node_modules are cached in this layer for faster rebuilds.

FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./
COPY prisma ./prisma/

# Install all dependencies (including dev for build)
RUN npm ci

# ==============================================================================
# Stage 2: Builder  
# ==============================================================================
# This stage builds the Next.js application and generates the Prisma client.
# The output includes the optimized production build and standalone server.

FROM node:20-alpine AS builder
WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Ensure public directory exists (required for standalone output)
RUN mkdir -p public

# Build the application
# Disable telemetry during build
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Ensure .next/static exists (may be empty but directory must exist for COPY)
RUN mkdir -p .next/static

# ==============================================================================
# Stage 3: Runner (Production)
# ==============================================================================
# This is the final production image. It only includes the necessary files
# to run the application, resulting in a smaller and more secure image.

FROM node:20-alpine AS runner
RUN apk add --no-cache openssl
WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1


# Install runtime utilities
RUN npm install -g prisma tsx

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Create data directory for SQLite database
RUN mkdir -p /app/data && chown -R nextjs:nodejs /app/data

# Copy necessary files from builder
# The standalone output includes the minimal server and dependencies
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./

# Create .next/static directory and copy contents (directory must exist first)
RUN mkdir -p .next/static
COPY --from=builder /app/.next/static/ ./.next/static/

# Copy Prisma schema and scripts for database management
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Set correct permissions
RUN chown -R nextjs:nodejs /app

# Switch to non-root user
USER nextjs

# Expose the application port
EXPOSE 3000

# Set the port environment variable
ENV PORT=3000

# Health check endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

# Start command
# First initialize the database, then start the server
CMD ["sh", "-c", "npx prisma db push && npx tsx scripts/setup.ts && node server.js"]
