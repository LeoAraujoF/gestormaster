# Worker parado ou fila acumulando

## Sinais

- `gestor_worker` parado, reiniciando ou `unhealthy`;
- `redis_queue` indisponível;
- mensagens permanecem em `pending`/`processing` sem avanço;
- reenvios retornam sucesso HTTP, mas nenhum job chega ao worker.

## Diagnóstico somente leitura

1. Registrar o identificador da mensagem ou alerta sem expor o conteúdo.
2. Confirmar o estado do worker, Redis e scheduler, incluindo reinícios.
3. Correlacionar horário do erro com logs do app, worker e Evolution.
4. Confirmar se a mensagem está `failed`, `pending`, `processing` ou `sent`.
5. Verificar se existe job duplicado ou lock ativo antes de sugerir novo envio.

## Reenvio seguro

O reenvio deve ser uma operação idempotente: reservar novamente somente uma mensagem
falha, gerar uma nova tentativa auditável e liberar o lock anterior de forma segura.
Nunca forçar reenvio de `sent` sem uma confirmação adicional e sem uma regra explícita
de prevenção de duplicidade. A confirmação operacional exige observar o job no worker
e o status final, não apenas o HTTP 200 da rota.

Restart do worker, limpeza de fila, alteração de lock ou chamada de retry exigem
confirmação explícita. Depois, validar que há exatamente uma tentativa ativa.
