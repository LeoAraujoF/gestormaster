FROM node:22-alpine AS base

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

ENV NODE_OPTIONS="--max-old-space-size=1536"

# Variáveis necessárias para compilar as páginas estáticas no Next.js App Router
ENV NEXT_PUBLIC_SUPABASE_URL="https://rkxfwwooivqjukjhbhgg.supabase.co"
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJreGZ3d29vaXZxanVramhiaGdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0MDA5MzksImV4cCI6MjA5NDk3NjkzOX0.DaVpNzIeS9gpzC9m8Xw71STxFUUhM0Lf8QSSczJ0o-I"
ENV SUPABASE_SERVICE_ROLE_KEY="dummy_key_to_bypass_build_error_will_be_overridden"
ENV NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_live_51TaLSKDhR1gtdDDjweocrTNrPdt0LXbpOA5VOEVIzdt5Bvdr4zkBpRAYrTMNX4AzDKXDQjSR88lheLdcuj3olDgb009ukgQtzE"
ENV NEXT_PUBLIC_STRIPE_PRICE_BASIC="price_1TccW4DhR1gtdDDjzVSriErd"
ENV NEXT_PUBLIC_STRIPE_PRICE_PRO="price_1TccWbDhR1gtdDDjrrmye5nH"
ENV NEXT_PUBLIC_STRIPE_PRICE_PREMIUM="price_1TccWlDhR1gtdDDjXdQnfKm4"
ENV OPENAI_API_KEY="dummy_key_to_bypass_build"

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
COPY --from=builder /app/src/providers ./src/providers
COPY --from=builder /app/package.json ./package.json
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/tsconfig.json ./tsconfig.json

USER nextjs

EXPOSE 3000
ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

# O comando padrão será iniciar o Next.js. Os workers terão o comando sobrescrito no docker-compose
CMD ["node", "server.js"]
