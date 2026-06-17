# Relatório de Análise do Projeto

## Estatísticas

- Rotas: 29
- APIs: 35
- Workers: 6
- Integrações: 7

## Integrações

- BullMQ
- Next.js
- OpenAI
- React
- Redis
- Stripe
- Supabase

## Workers

- bull-board
- health-worker
- queue-worker
- scheduler-service
- warmup-worker
- webhook-worker

## Rotas

- /(dashboard)
- /(dashboard)/admin/tickets
- /(dashboard)/admin/tickets/[id]
- /(dashboard)/aquecimento
- /(dashboard)/atualizacoes
- /(dashboard)/automacao
- /(dashboard)/clientes
- /(dashboard)/configuracoes
- /(dashboard)/fila
- /(dashboard)/financeiro
- /(dashboard)/leads
- /(dashboard)/master
- /(dashboard)/minha-conta
- /(dashboard)/promocoes
- /(dashboard)/revendas
- /(dashboard)/revendas/[id]
- /(dashboard)/revendas/configuracoes
- /(dashboard)/revendas/metricas
- /(dashboard)/servicos
- /(dashboard)/suporte
- /(dashboard)/suporte/ticket/[id]
- /cadastro
- /forgot-password
- /login
- /onboarding
- /planos
- /privacidade
- /reset-password
- /revendedor/[id]

## APIs

- /api/admin/check
- /api/admin/force-cron
- /api/admin/health
- /api/admin/instances
- /api/admin/metrics
- /api/admin/queues-redirect
- /api/admin/users
- /api/admin/users/block
- /api/ai/generate
- /api/clients/metrics
- /api/clients/update-overdue
- /api/cron/generate-alerts
- /api/cron/process-queue
- /api/evolution/connect
- /api/evolution/delete
- /api/evolution/logout
- /api/evolution/send-instant
- /api/evolution/send-mass
- /api/evolution/send-single
- /api/evolution/set-primary
- /api/evolution/settings
- /api/evolution/status
- /api/evolution/test-connection
- /api/evolution/webhook
- /api/instances/warmup
- /api/pixgo/checkout
- /api/pixgo/webhook
- /api/queues/status
- /api/revendas/checkout
- /api/revendas/notify
- /api/revendas/public
- /api/stripe/checkout
- /api/stripe/portal
- /api/stripe/webhook
- /auth/callback

## Arquivos Grandes

- 2155 linhas → src\app\(dashboard)\leads\page.tsx
- 1643 linhas → src\app\(dashboard)\automacao\page.tsx
- 934 linhas → src\app\(dashboard)\financeiro\page.tsx
- 932 linhas → src\app\(dashboard)\master\page.tsx
- 727 linhas → src\app\(dashboard)\page.tsx
- 723 linhas → src\components\ui\sidebar.tsx
- 723 linhas → src\app\(dashboard)\minha-conta\page.tsx
- 714 linhas → src\app\(dashboard)\clientes\page.tsx

## Maiores Páginas

- 2155 linhas → (dashboard)\leads\page.tsx
- 1643 linhas → (dashboard)\automacao\page.tsx
- 934 linhas → (dashboard)\financeiro\page.tsx
- 932 linhas → (dashboard)\master\page.tsx
- 727 linhas → (dashboard)\page.tsx
- 723 linhas → (dashboard)\minha-conta\page.tsx
- 714 linhas → (dashboard)\clientes\page.tsx
- 441 linhas → (dashboard)\suporte\page.tsx
- 390 linhas → (dashboard)\configuracoes\page.tsx
- 370 linhas → (dashboard)\atualizacoes\page.tsx

## Recomendações

- Existem 8 arquivos com mais de 500 linhas. Avaliar refatoração.
- Projeto possui vários workers. Revisar responsabilidades e isolamento.
- Projeto possui muitas rotas. Considerar documentação automática.
