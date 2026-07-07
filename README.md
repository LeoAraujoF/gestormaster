# Gestor Master

SaaS de gestão de clientes IPTV/assinaturas com automação de cobranças via WhatsApp
(Evolution API), pagamentos (Stripe, PIX/Mercado Pago/PIXGO), sistema de revendas e
afiliados. Multi-tenant com isolamento por organização no Supabase.

## Stack

- **Next.js 16** (App Router, output `standalone`) + React + TypeScript + Tailwind
- **Supabase** (Postgres + Auth + RLS) — banco e autenticação
- **BullMQ + Redis** — filas de mensagens, webhooks, health-check e aquecimento
- **Evolution API** — motor de WhatsApp
- **Stripe / Mercado Pago / PIXGO** — pagamentos

## Arquitetura de processos

O deploy roda vários processos a partir da **mesma imagem** (ver `docker-compose.yml`):

| Serviço            | Comando                   | Função                                        |
|--------------------|---------------------------|-----------------------------------------------|
| `gestor-app`       | `node server.js`          | App Next.js (UI + API routes)                 |
| `gestor-worker`    | `npm run worker:start`    | Workers BullMQ (mensagens, webhooks, IA, etc.)|
| `gestor-scheduler` | `npm run scheduler:start` | Cron interno (`node-cron`): varreduras e automações |
| `redis-queue`      | —                         | Redis das filas                               |
| `evolution-api`    | —                         | WhatsApp (Evolution) + Postgres próprio       |

O **Bull Board** (painel das filas) sobe dentro do worker em `:3001` e é exposto via
rewrite `/admin/queues` (protegido por Basic Auth + guard de admin no middleware).

## Desenvolvimento local

Pré-requisitos: Node 22+, um Redis local (ou aponte para o do servidor) e as variáveis
de ambiente em `.env.local`.

```bash
npm install
npm run dev          # app em http://localhost:3000
npm run worker:start # opcional: workers de fila
```

## Variáveis de ambiente

Definidas em `.env.local` (dev) e injetadas em runtime pelo Portainer/docker-compose (prod).
Principais:

| Variável | Descrição |
|----------|-----------|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Cliente Supabase (público) |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave `sb_secret_...` (server-only, ignora RLS) |
| `CRON_SECRET` | Autoriza as rotas de cron (`Authorization: Bearer` ou `?key=`) |
| `ENCRYPTION_KEY` | AES-256-GCM p/ credenciais no banco (mín. 32 chars, **estável**) |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Stripe |
| `PIXGO_API_KEY` / `PIXGO_WEBHOOK_SECRET` | Gateway PIX |
| `EVOLUTION_API_URL` / `EVOLUTION_API_KEY` | WhatsApp |
| `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` | Redis das filas |
| `ADMIN_EMAIL` | E-mail do Master Admin (define o acesso `/admin`) |
| `BULL_BOARD_PASSWORD` | Basic Auth do painel de filas |

> ⚠️ Campos de autorização (`has_active_subscription`, `payment_status`) vivem em
> `app_metadata` (gravado só pelo servidor), **nunca** em `user_metadata` (editável pelo usuário).

## Build

```bash
npm run build
```

O type-check é **obrigatório** no build (`next.config.ts` → `typescript.ignoreBuildErrors: false`).

## Deploy

Push em `main` → **GitHub Actions** (`.github/workflows/docker-publish.yml`) builda a imagem
e publica no GHCR. No servidor (home lab), o **Portainer** puxa a imagem nova e recria a stack.
Variáveis privadas são injetadas pelo Portainer em runtime (não vão na imagem).

Após atualizar segredos, recrie os containers (não basta reiniciar):

```bash
docker compose up -d --force-recreate gestor-app gestor-worker gestor-scheduler
```

## Segurança

Ver [`SEGURANCA_ACOES.md`](./SEGURANCA_ACOES.md) para o histórico de auditoria, o modelo de
RLS (isolamento por `organization_id`) e as pendências operacionais.
