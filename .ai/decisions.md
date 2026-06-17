# Decisões Técnicas

## Filosofia

Utilizar tecnologias maduras e estáveis.

Evitar Kubernetes e soluções complexas prematuramente.

## Filas

BullMQ + Redis.

## Banco

Supabase.

## Escalabilidade

Escala progressiva baseada em desacoplamento de serviços.

## Integração WhatsApp

Provider Pattern para desacoplar Evolution API do restante do sistema.

## Observabilidade

Correlation ID obrigatório para rastreamento ponta a ponta.
