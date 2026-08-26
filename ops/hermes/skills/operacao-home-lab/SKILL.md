---
name: operacao-home-lab
description: Monitorar o Home Lab e diagnosticar serviços da Lembrado com foco em leitura, evidências, segurança e aprovação antes de mudanças.
---

# Operação do Home Lab

Use esta skill quando o usuário perguntar se a Lembrado está saudável, quando houver
alerta de disponibilidade, erro de container, falha de deploy ou suspeita de falta de
recursos.

## Procedimento

1. Confirme o ambiente e o horário da consulta.
2. Colete primeiro estado da stack, containers, health checks, uso de CPU/memória,
   reinícios recentes e versão da imagem.
3. Compare com o último deploy no GitHub Actions e com o commit atualmente publicado.
4. Consulte somente os logs necessários e redija credenciais, cookies, tokens,
   telefones e conteúdo de mensagens.
5. Classifique o incidente: aplicação, worker, scheduler, Redis, Evolution, banco,
   proxy/túnel ou host.
6. Entregue: impacto, evidências, hipótese, ação reversível sugerida e validação.

## Ações que exigem aprovação

Restart, redeploy, rollback, scale, limpeza de fila, mudança de variável, alteração
de rede/volume, instalação de pacote e exposição de porta exigem confirmação explícita.

## Formato do diagnóstico

```text
Status: saudável | degradado | indisponível | inconclusivo
Impacto: ...
Evidências: ...
Hipótese: ...
Próximo passo sugerido: ...
Confirmação necessária: sim | não
```
