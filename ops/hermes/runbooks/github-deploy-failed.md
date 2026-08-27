# Deploy ou workflow do GitHub com falha

## Diagnóstico

1. Identificar o commit da branch `main` e o último workflow.
2. Separar workflow em execução, cancelado, falho e concluído com sucesso.
3. Comparar a imagem publicada com o commit esperado, sem assumir que `main` já está em produção.
4. Verificar saúde da aplicação depois do deploy, pois workflow verde não substitui health check.

## Ações controladas

Não fazer redeploy automático a partir de um workflow falho. O Hermes deve informar
o link/identificador do workflow, a hipótese e a ação reversível sugerida. Redeploy,
rollback ou alteração de secrets exigem confirmação explícita e uma janela definida.
