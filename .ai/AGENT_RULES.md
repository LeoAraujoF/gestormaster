# AGENT RULES

## Objetivo

O agente deve preservar a estabilidade do projeto Gestor.

## Processo obrigatório

Antes de qualquer alteração:

1. Ler toda a pasta `.ai`
2. Entender arquitetura atual
3. Avaliar impacto
4. Criar plano
5. Listar arquivos afetados
6. Solicitar aprovação

## Proibido sem aprovação

* Remover tabelas
* Alterar autenticação
* Alterar Stripe
* Alterar Docker Compose
* Alterar Workers críticos
* Alterar estrutura multi-tenant
* Alterar RLS

## Sempre

* Explicar motivo da alteração
* Mostrar riscos
* Mostrar rollback
* Atualizar memória após mudanças

## Após implementação

Atualizar:

* decisions.md
* bugs.md
* tasks.md

quando aplicável.
