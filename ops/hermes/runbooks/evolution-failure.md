# Evolution/API de mensagens com falha

## Sinais

- `evolution_api` parado ou `unhealthy`;
- timeout/5xx no envio;
- sessão desconectada;
- o app registra erro, mas o worker conclui sem confirmação de entrega.

## Diagnóstico somente leitura

1. Confirmar o estado de `evolution_api`, `evolution_db` e `redis_queue`.
2. Registrar status HTTP, correlation ID e horário; nunca registrar token ou número completo.
3. Verificar logs mínimos do worker e da Evolution no mesmo intervalo.
4. Separar erro transitório, sessão desconectada, limite do provedor e erro de payload.
5. Confirmar o estado da mensagem antes de qualquer retry.

## Ações controladas

Reconectar sessão, reiniciar serviço ou reenviar mensagem são ações mutáveis e exigem
confirmação. Se o erro puder causar duplicidade, a opção padrão é não reenviar até
confirmar que a Evolution não aceitou a tentativa anterior. Validar depois com o
status da mensagem, worker e retorno sanitizado da Evolution.
