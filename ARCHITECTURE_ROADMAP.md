# Roadmap Arquitetural e Operacional — Plataforma Gestor

Este documento define a arquitetura evolutiva do sistema Gestor. Como plataforma SaaS multi-tenant que interage intensamente com serviços assíncronos (Evolution API / WhatsApp), a premissa fundamental deste design é a **simplicidade operacional, desacoplamento, estabilidade e escalabilidade progressiva**. O objetivo é preparar o sistema para escala adotando "Boring Technology" (tecnologias estáveis e testadas), evitando *overengineering* prematuro (como Kubernetes ou proxies dinâmicos no estágio atual).

---

## FASE 1 — Estrutura Crítica e Fundação SaaS

O foco desta fase é a robustez do *core*, o isolamento de responsabilidades e a garantia de integridade nas operações críticas.

### 1.1 Multi-tenant Real e Auditoria Operacional (Audit Logs)
*   **Modelo Multi-tenant:** Criação de tabelas de isolamento lógico (`organizations` ou `workspaces`) com `organization_members` para RBAC. Políticas de RLS estritas no banco de dados.
*   **Audit Logs:** Implementação de uma tabela `audit_logs` para registrar ações críticas. Essencial para troubleshooting, suporte e segurança. Eventos a serem registrados: login, reconnect manual, criação/exclusão de instância, disparos críticos em massa, mudanças administrativas, alterações de permissão e falhas sistêmicas críticas.

### 1.2 Organização Arquitetural e Separação de Serviços
Para garantir escalabilidade e evitar degradação de throughput, a estrutura lógica prevista e particionada compreende:
*   `next-app`: UI, API Rest, Webhooks de Recepção e autenticação.
*   `scheduler-service`: Varredura de cron jobs e agendamento de mensagens nas filas (não processa envio).
*   `queue-worker`: Processamento de filas gerais e envio de mensagens via API.
*   `webhook-worker`: Fila isolada/crítica para processar os status de mensagens recebidos da Evolution API.
*   `health-monitor-worker`: Varredura periódica de saúde das instâncias e rotinas de manutenção.
*   `warmup-worker`: Processo dedicado a aquecimento heurístico de instâncias recém conectadas.
*   `evolution-nodes`: Containers standalone da Evolution API.
*   `redis`: Armazenamento em memória (BullMQ).

### 1.3 Message Idempotency, Priority Queues e Estratégias de Fila (BullMQ)
*   **Priority Queues:** Configuração de prioridade nativa (`critical`, `high`, `normal`, `low`). Rotinas vitais (como webhooks e processamento de login) não podem competir em concorrência com disparos de campanhas em massa de baixa prioridade.
*   **Idempotência:** Garantia arquitetural contra dupla execução. Uso de `deduplication_key` (hash do payload) e `external_message_id` em cache para evitar disparos e cobranças em duplicidade decorrentes de falhas e reconnects.
*   **DLQ Retention Policy (Dead Letter Queue):** Fixação de regras rígidas para mensagens falhas: tempo de expiração na DLQ (ex: 7 dias), botão de replay manual no dashboard e limite máximo de armazenamento para evitar estouro de RAM no Redis.
*   **Filas Tolerantes a Falhas:** Retries idempotentes, Graceful Retries com *exponential backoff* e locks por envio.

### 1.4 Abstração da Evolution API (Provider Pattern)
*   Uso de contratos genéricos (`IProvider`, `IMessageSender`). O resto do sistema desconhece o client interno, facilitando fallback ou futuras trocas de motor sem quebrar o core.

### 1.5 Segurança e Gestão de Segredos
*   **Segurança de Webhooks:** HMAC Signature Validation (assinatura criptográfica anti-spoofing) e Timestamp/Anti-replay protection nas rotas de recebimento.
*   **Secrets / Env Management:** Política rigorosa para roteamento e armazenamento de credenciais: tokens de provedor encriptados (*encryption at rest* no DB) e rotação programada de webhook secrets (sem derrubar sessões ativas).

---

## FASE 2 — Escala, Saúde e Resiliência

Esta fase defende a plataforma de abusos de clientes e do estrangulamento da infraestrutura externa.

### 2.1 Backpressure Protection, Throttling e Tenant Limits
*   **Tenant Isolation Limits:** Travas transacionais duras. Estabelecimento de limites de disparos simultâneos (jobs/tenant), limite de throughput de rede e limite máximo de sessões permitidas por conta, mitigando a interferência (Noisy Neighbor).
*   **Auto-Throttling:** Se o *Queue Lag* subir criticamente ou websocket count estourar, o sistema aciona proteção anti-colapso, reduzindo dinamicamente o throughput e pausando filas não-críticas.

### 2.2 Múltiplos Nodes Evolution e Session Affinity
*   **Node Registry:** Catálogo de servidores mapeado na base.
*   **Session Affinity (Sticky Routing):** Um cliente autenticado no Node "A" permanecerá roteado compulsoriamente para o Node "A" via `session_id`. Evita corrupção de websocket e reconnects danosos.

### 2.3 Reputação, Risk Score e Session Health
*   O `health-monitor-worker` atua varrendo o banco gerando o *Session Health Score*. Altas taxas de denúncias ou conexões instáveis reduzem o *risk_level*, alertando a gestão do SaaS de possível uso malicioso.

---

## FASE 3 — Enterprise (Futuro)
*   **Proxy Inteligente:** API Gateway (Traefik/Nginx) gerindo balanceamento dinâmico.
*   **Auto-scaling e Kubernetes:** Apenas acionado se limites estáticos de infraestrutura humana se tornarem um gargalo insustentável.

---

## OBSERVABILIDADE PROFUNDA, CORRELATION E CAPACITY

Sem visibilidade técnica de ponta a ponta, é impossível dar suporte a sistemas assíncronos.

### 1. Correlation Tracking (Rastreabilidade Ponta a Ponta)
É mandatório que todo evento do sistema possua correlação rastreável do início ao fim:
`Requisição HTTP → Fila Redis → Worker → Evolution API → Retorno Webhook`
Para isso, todo contexto injetará compulsoriamente no log e no payload da fila as chaves:
*   `correlation_id`
*   `request_id`
*   `tenant_id`
*   `session_id`

### 2. Logs Estruturados Universal (Structured Logging)
Todo e qualquer output (Next.js, `scheduler-service`, `webhook-worker`, `queue-worker`) **deverá** formatar a saída em JSON agregando metadados de correlação, nível, latência e action, servindo de base ideal para o Loki ou ELK Stack.

### 3. Planejamento de Capacidade (Capacity Planning)
Manter controle minucioso e estabelecer limites seguros estritos por node: Sessões por node, RAM média por instância Evolution logada, throughput máximo seguro do Redis.

### 4. Dashboards Operacionais e Retenção Histórica
*   Monitoramento via Grafana extraindo do Prometheus.
*   Acompanhamento crítico: DLQ growth rate, Webhook latency, Reconnect storms.
*   Persistência estendida das métricas de infraestrutura para facilitar diagnóstico retrospectivo (Memory Leak que cresce lento durante 10 dias, por exemplo).
