# 🔐 Segurança — Ações e Status (Gestor Master)

Auditoria e correções aplicadas em 2026-07-01. Este documento registra **o que já foi corrigido no código**, **o que só você pode fazer agora** (rotação de chaves) e as **próximas prioridades** para deixar o projeto pronto para produção.

---

## ✅ Parte 1 — Já corrigido no código (nesta sessão)

Estas mudanças já estão aplicadas nos arquivos do projeto:

- **Removidos arquivos com segredos / dados sensíveis do repositório:**
  `temp_insert.js` (continha a Service Role Key do Supabase em texto puro), `clientes_dump.html` e `clientes_debug.html` (dumps com possível PII de clientes reais), além de `test.js`, `test2.js`, `test-query.ts`, `check.js`, `setup-storage.js`, `scripts/analyze-dump.ts` e um arquivo `git` vazio.
- **Rota de teste removida:** `src/app/api/test-webhook` — disparava WhatsApp sem qualquer autenticação.
- **`vercel.json`:** removido o `CRON_SECRET` que estava exposto na URL (`?key=gestor_cron_secret_2026`).
- **Novo helper `src/lib/cron-auth.ts`:** valida crons por `Authorization: Bearer <CRON_SECRET>` (padrão da Vercel Cron) ou `?key=`, com comparação em tempo constante e *fail-closed*.
- **Rotas de cron protegidas** (`generate-alerts`, `process-queue`) passam a usar o helper acima.
- **`/api/clients/update-overdue`:** agora exige usuário autenticado e atualiza **apenas os clientes do próprio usuário** (antes atualizava clientes de todos os tenants sem login).
- **`/api/admin/billing/send`:** adicionado guard de Master Admin (antes qualquer pessoa podia disparar cobranças e ver a senha provisória).
- **`/api/admin/health`:** adicionado guard de Master Admin.
- **`.gitignore`:** passa a bloquear `temp_*.js`, `test*.js`, `*_dump.html`, `*_debug.html`, etc., para não voltar a versionar arquivos ad-hoc com segredos.

---

## 🔴 Parte 2 — Faça AGORA (só você pode fazer isso)

As chaves abaixo já estiveram expostas em arquivos versionados. Remover os arquivos **não basta** — elas continuam no histórico do Git e devem ser consideradas comprometidas. **Rotacione todas.**

### 1. Rotacionar a Service Role Key do Supabase (URGENTE)
A `SUPABASE_SERVICE_ROLE_KEY` dá acesso total ao banco, ignorando o RLS. Ela estava em `temp_insert.js`.

- No painel do Supabase: **Project Settings → API Keys**. As chaves legadas (`anon`/`service_role`) **não podem mais ser rotacionadas individualmente**; o caminho recomendado é criar uma **nova secret key** (`sb_secret_...`) e migrar, ou rotacionar o **JWT secret** (isso invalida as chaves antigas `anon` e `service_role` de uma vez).
- Depois de gerar a nova chave, atualize-a em **todos** os lugares: `.env.local`, variáveis de ambiente na **Vercel**, e no **docker-compose** do servidor (app + worker).

### 2. Trocar o CRON_SECRET
O valor antigo (`gestor_cron_secret_2026`) estava público no `vercel.json`. Qualquer pessoa podia disparar envios em massa de WhatsApp.

- Gere um valor forte e aleatório (ex.: `openssl rand -hex 32`).
- Defina como variável de ambiente **`CRON_SECRET`** na Vercel. Com o `vercel.json` já ajustado, a Vercel injeta esse segredo automaticamente como `Authorization: Bearer ...` nas chamadas de cron — não precisa mais colocá-lo na URL.
- Se você dispara os crons por outro agendador, envie o header `Authorization: Bearer <CRON_SECRET>`.

### 3. Confirmar a ENCRYPTION_KEY em produção
`src/lib/encryption.ts` usa `ENCRYPTION_KEY` (mín. 32 caracteres) para criptografar as API keys dos clientes no banco. Garanta que ela esteja definida, forte e **estável** em produção — se ela mudar, as credenciais já salvas ficam ilegíveis.

### 4. (Recomendado) Limpar o histórico do Git
Mesmo após remover os arquivos, os segredos continuam em commits antigos. Rotacionar as chaves (passos 1–2) já neutraliza o risco prático. Para remoção completa do histórico, use `git filter-repo` ou o BFG Repo-Cleaner e force-push (combine com o time antes).

---

## 🟠 Parte 3 — Próximas prioridades (fase "importantes")

### 1. Isolamento de tenant / paywall furável (CRÍTICO de arquitetura) — ✅ CÓDIGO + BANCO FEITOS (falta deploy)
Antes, o `middleware` confiava em `user_metadata` para decidir `has_active_subscription`/`payment_status`, e 4 rotas de admin confiavam em `user_metadata.is_admin`. Como o próprio usuário edita `user_metadata` pelo navegador (`supabase.auth.updateUser`), dava para liberar acesso pago sem pagar **e se auto-promover a admin**.
**O que foi feito (sessão 2026-07-02):**
- `has_active_subscription` e `payment_status` migrados para **`app_metadata`** (só o servidor grava via service role).
- Backfill de `app_metadata` já aplicado no banco para os usuários existentes (migration `backfill_app_metadata_paywall_fields`).
- Leitura do paywall no `src/lib/supabase/middleware.ts` agora usa `app_metadata`.
- Escritas atualizadas: webhooks Stripe/PIXGO, `afiliados/converter`, `admin/users/create|update`.
- Checagem forjável `user_metadata.is_admin` **removida** das 4 rotas de admin (agora só e-mail `ADMIN_EMAIL`).
- ⚠️ **Deploy coordenado:** as mudanças de código só valem após build+deploy. Como o backfill foi feito antes, ninguém é deslogado. **Se houver pagamento entre o backfill e o deploy**, rode o backfill de novo após o deploy.

### 2. Reativar a verificação de tipos no build — ✅ FEITO
Antes: `next.config.ts` tinha `typescript: { ignoreBuildErrors: true }` e o `Dockerfile` fingia desativar type-check (as ENV `NEXT_IGNORE_TYPE_CHECK`/`NEXT_IGNORE_ESLINT` eram **no-op** — não existem no Next). A "~200" era contagem de usos de `any`; **erros reais de compilação eram 38**.
**O que foi feito (sessão 2026-07-02):**
- Corrigidos os **38 erros** de TypeScript. Incluíam bugs de runtime reais: `createClient()` sem `await` em `updates/read` (endpoint sempre dava 500) e **10 chamadas de `logAuditClient(...)`** com 3 args posicionais em vez de 1 objeto (auditoria client-side enviava `undefined`). O resto: mismatches da lib de UI `@base-ui/react` (`onValueChange` recebe `string | null`, `showCloseButton`), nullability e `apiVersion` do Stripe.
- `next.config.ts`: `typescript.ignoreBuildErrors: false` (type-check **obrigatório** no build). Dockerfile: removidas as ENV no-op enganosas.
- Descoberto que é **Next.js 16** (a chave `eslint` do config foi removida; ESLint não roda mais no build).
- **Validado:** `npx tsc --noEmit` = 0 erros e `npm run build` = exit 0 com type-check ativo.

### 3. Unificar o modelo de RLS — ✅ FEITO
As tabelas transacionais tinham **dois conjuntos de policies sobrepostos** (o antigo `user_id = auth.uid()` e o novo `organization_id IN user_orgs()`), que por serem permissivas eram combinadas com OR — modelo duplicado e frágil.
**O que foi feito (migration `unify_rls_on_organization_model`):**
- Removidas as policies redundantes por `user_id` de: `clients`, `services`, `promotions`, `automations`, `alert_history`, `payments`, `evolution_instances`, `client_services`.
- Cada uma dessas tabelas ficou com **uma única** policy `tenant_isolation_*` (org-based) com `USING` + `WITH CHECK` explícitos. `integrations` já estava assim.
- **Validado antes de aplicar:** 0 linhas com `organization_id` nulo; 0 linhas com `organization_id` divergente do dono; trigger `set_default_organization_id` presente em todas (preenche o org_id no INSERT).
- **Validado depois (impersonando usuário via RLS):** SELECT isola por tenant (leandro vê 173 de 175 clientes) e INSERT preenche o org_id e passa no WITH CHECK.
- `organization_members` ganhou policy de self-select; tabelas financeiras tiveram RLS ativado (itens anteriores).
- Tabelas fora do núcleo multi-tenant (leads, campaigns, resellers, tickets, iptv_accounts, fixed_costs etc.) permanecem no modelo por `user_id` — cada uma já tem **um único** modelo consistente (não tinham a duplicação).
- Restam em deny-all (INFO, seguro — acesso só via service role): `audit_logs`, `security_settings`, `credit_transfers`.
- Aviso remanescente aceito por design: 4 funções `SECURITY DEFINER` (`get_dashboard_metrics`, `get_monthly_growth`, `get_clients_by_service`, `user_orgs`) executáveis por usuário logado — filtram por `auth.uid()`/org internamente; `user_orgs` é obrigatória para as próprias policies.

### Hardening de banco aplicado nesta sessão (migrations no Supabase)
- `search_path` fixado em 8 funções (anti-hijack).
- `SECURITY DEFINER` bloqueadas para `anon` (triggers e RPCs).
- Policies "Admins can do anything" (tickets/ticket_messages) que eram `USING(true)` para todos → agora exigem role `owner`/`admin`.
- **Storage**: bucket público `mass_media` tinha policy "Public Access" (SELECT) que permitia **listar todos os arquivos**. Removida (migration `restrict_mass_media_bucket_listing`). O acesso por URL pública e os uploads continuam funcionando; só a enumeração foi bloqueada.

### Pendências de banco que exigem VOCÊ (painel Supabase)
- **Leaked Password Protection** (HaveIBeenPwned) está desativado → Authentication → Policies, ativar.

### 4. Itens menores — ✅ FEITO
- **Rate limiting** adicionado nas rotas públicas via `src/lib/rate-limit.ts` (janela fixa no Redis, *fail-open*): `/api/revendas/checkout` (10/min por IP) e `/api/revendas/public` (60/min por IP).
- **Bull Board**: comparação de credenciais do Basic Auth agora é em tempo constante (`crypto.timingSafeEqual`). Continua acessível só via rewrite `/admin/queues` (guard de admin no middleware) ou rede interna.
- **README** substituído por documentação real (stack, processos, env, build, deploy Portainer/GHCR).
- **console.log**: auditados — nenhum imprime valores de segredos (apenas mencionam nomes ou logam `err.message`). Sem vazamento.

---

## 🧪 Validação recomendada
Rode um build local na sua máquina como porta final antes do deploy:

```bash
npm run build
```

(O ambiente de auditoria não permitiu um type-check confiável; o build local é o teste definitivo.)
