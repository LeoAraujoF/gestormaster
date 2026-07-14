FROM node:22-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install dependencies based on the preferred package manager
COPY package.json package-lock.json* ./
RUN npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Environment variables must be present at build time for Next.js if they are public
ENV NEXT_TELEMETRY_DISABLED=1

# Type-checking roda no build (controlado por next.config.ts: typescript.ignoreBuildErrors=false).
# Next 16 não executa ESLint durante o build.

ENV NODE_OPTIONS="--max-old-space-size=1536"

# ============================================================
# Variáveis PÚBLICAS (NEXT_PUBLIC_) - São "assadas" no JS final
# Devem ser injetadas como Build Args pelo GitHub Actions
# ============================================================
ARG NEXT_PUBLIC_SUPABASE_URL="https://placeholder.supabase.co"
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL

ARG NEXT_PUBLIC_SUPABASE_ANON_KEY="placeholder_anon_key"
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY

ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_placeholder"
ENV NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY

ARG NEXT_PUBLIC_STRIPE_PRICE_BASIC="price_placeholder"
ENV NEXT_PUBLIC_STRIPE_PRICE_BASIC=$NEXT_PUBLIC_STRIPE_PRICE_BASIC

ARG NEXT_PUBLIC_STRIPE_PRICE_PRO="price_1TjKpNDhR1gtdDDjGOYez8LT"
ENV NEXT_PUBLIC_STRIPE_PRICE_PRO=$NEXT_PUBLIC_STRIPE_PRICE_PRO

ARG NEXT_PUBLIC_STRIPE_PRICE_PREMIUM="price_placeholder"
ENV NEXT_PUBLIC_STRIPE_PRICE_PREMIUM=$NEXT_PUBLIC_STRIPE_PRICE_PREMIUM

# ============================================================
# Variáveis PRIVADAS - Usadas apenas no servidor em runtime
# Defaults de build para não travar a compilação estática
# Os valores REAIS são injetados pelo docker-compose em runtime
# ============================================================
ENV SUPABASE_SERVICE_ROLE_KEY="placeholder_service_key"
ENV OPENAI_API_KEY="placeholder_openai_key"

# Variáveis que o env.ts valida e que precisam existir no momento do build
# Serão sobrescritas em runtime pelo docker-compose
ENV STRIPE_SECRET_KEY="sk_placeholder"
ENV STRIPE_WEBHOOK_SECRET="whsec_placeholder"
ENV EVOLUTION_API_URL="http://placeholder:8080"
ENV EVOLUTION_API_KEY="placeholder"
ENV REDIS_URL="redis://placeholder:6379"
ENV REDIS_HOST="placeholder"
ENV JWT_SECRET="placeholder_jwt"
ENV NEXTAUTH_SECRET="placeholder_nextauth"
ENV EMAIL_SERVER="smtp://placeholder:587"
ENV EMAIL_FROM="noreply@placeholder.com"
ENV ADMIN_EMAIL="admin@placeholder.com"

# Sinalizar que estamos no Docker Build (para pular validações)
ENV DOCKER_BUILD=1

RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

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
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# O comando padrão será iniciar o Next.js. Os workers terão o comando sobrescrito no docker-compose
CMD ["node", "server.js"]
