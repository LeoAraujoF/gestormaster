# Aplicação indisponível ou degradada

## Sinais

- `/api/health` retorna algo diferente de HTTP 200;
- `gestor_app` não está `running` ou está `unhealthy`;
- o proxy responde 502/504;
- o commit publicado diverge do último deploy aprovado.

## Diagnóstico somente leitura

1. Registrar horário, URL, status HTTP e correlation ID, se houver.
2. Consultar estado, health check, imagem e reinícios de `gestor_app` e `nginx-npm-1`.
3. Consultar os últimos logs necessários, mascarando tokens, cookies, telefones e payloads.
4. Comparar o commit da branch `main` com o último workflow do GitHub Actions.
5. Verificar se Redis, banco e Evolution continuam saudáveis antes de atribuir a causa à aplicação.

## Ações controladas

Se o processo estiver parado, sugerir restart do container. Se a imagem estiver
incorreta ou o workflow tiver falhado, sugerir redeploy/rollback. Ambas as ações
exigem confirmação explícita e devem ser validadas repetindo `/api/health`, o estado
do container e um fluxo sintético sem dados reais.
