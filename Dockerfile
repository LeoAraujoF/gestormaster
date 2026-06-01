FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install dependencies based on the preferred package manager
COPY package.json package-lock.json* ./
RUN npm install

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Environment variables must be present at build time for Next.js if they are public
# Usually, it's better to pass them in docker-compose, but we disable telemetry
ENV NEXT_TELEMETRY_DISABLED 1

# Disable Type Checking and Linting during Docker Build (we already do it locally)
ENV NEXT_PUBLIC_IGNORE_BUILD_ERRORS true
ENV NEXT_IGNORE_ESLINT true
ENV NEXT_IGNORE_TYPE_CHECK true

RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy the built app
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# We also need the source files for workers (since they run via tsx)
# In a perfect world we would compile workers too, but for simplicity we copy them
COPY --from=builder /app/src/workers ./src/workers
COPY --from=builder /app/src/lib ./src/lib
COPY --from=builder /app/package.json ./package.json
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/tsconfig.json ./tsconfig.json

USER nextjs

EXPOSE 3000
ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

# O comando padrão será iniciar o Next.js. Os workers terão o comando sobrescrito no docker-compose
CMD ["node", "server.js"]
