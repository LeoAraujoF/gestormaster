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

## Monitor automático

O monitor `home-lab-health.py` produz um snapshot JSON estável a cada 5 minutos.
Ele consulta somente o Portainer, o liveness público da Lembrado e a API pública do
GitHub. O job deve permanecer em modo monitor: o agente só é chamado quando o
snapshot muda, e uma situação saudável sem alertas não gera mensagem.

Alertas importantes incluem ambiente Portainer indisponível, container ausente,
container parado ou `unhealthy`, liveness HTTP fora de 200 e workflow mais recente
concluído sem sucesso. O monitor não deve interpretar uma mudança de imagem ou
reinício como autorização para modificar o ambiente.

Use os runbooks em `ops/hermes/runbooks/` para classificar o incidente. Em especial,
preserve a separação entre evidência observada e hipótese; não invente causa quando
o snapshot não permitir concluir.

## Ações que exigem aprovação

Restart, redeploy, rollback, scale, limpeza de fila, mudança de variável, alteração
de rede/volume, instalação de pacote e exposição de porta exigem confirmação explícita.
O token atual do Portainer é somente leitura. A ausência de ferramenta de escrita é
intencional e não deve ser contornada pelo Docker socket ou por comandos improvisados.

## Formato do diagnóstico

```text
Status: saudável | degradado | indisponível | inconclusivo
Impacto: ...
Evidências: ...
Hipótese: ...
Próximo passo sugerido: ...
Confirmação necessária: sim | não
```
