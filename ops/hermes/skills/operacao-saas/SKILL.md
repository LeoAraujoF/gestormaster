---
name: operacao-saas
description: Acompanhar a Lembrado, seus deploys, filas de WhatsApp e falhas de reenvio sem expor dados ou executar ações sem aprovação.
---

# Operação da Lembrado

Use esta skill para investigar deploys, erros da aplicação, falhas de envio e o fluxo
de reenvio manual.

## Fontes prioritárias

- aplicação: `https://www.lembrado.com.br`;
- repositório: `https://github.com/LeoAraujoF/gestormaster`;
- workflow de publicação da imagem: GitHub Actions;
- observabilidade de runtime: Portainer e logs do `gestor_app`, `gestor_worker`,
  `gestor_scheduler`, `redis_queue` e `evolution_api`.

## Diagnóstico de falha de envio

1. Capturar horário, rota, status HTTP, correlation ID, `alert_history_id` quando
   disponível, commit e container responsável.
2. Confirmar se a falha ocorreu na API, na reserva da mensagem, na fila Redis, no
   worker ou na Evolution.
3. Verificar se a mensagem está `failed`, `pending`, `processing` ou `sent` antes de
   sugerir qualquer reenvio.
4. Explicar o risco de duplicidade e pedir confirmação para a ação de reenvio.
5. Após autorização, validar a entrada na fila e o processamento pelo worker.

Um retorno HTTP 200 da rota de retry apenas confirma aceitação da solicitação. A
confirmação operacional é a observação do job no worker e do status final da mensagem.

## Ações proibidas sem confirmação

Não chamar `/api/evolution/retry`, não disparar automações, não alterar banco, não
modificar secrets e não fazer redeploy por iniciativa própria.
