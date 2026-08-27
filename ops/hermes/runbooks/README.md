# Runbooks operacionais

Os runbooks são a referência de diagnóstico do Hermes. A ordem padrão é:

1. coletar evidências somente leitura;
2. classificar impacto e escopo;
3. registrar hipótese e ação reversível;
4. solicitar confirmação antes de qualquer mutação;
5. executar uma mudança por vez;
6. validar o resultado e registrar o desfecho.

Nenhum runbook autoriza por si só restart, redeploy, rollback, alteração de secret,
limpeza de fila, mudança de rede/volume ou reenvio de mensagem. Essas ações exigem
confirmação explícita no contexto da ocorrência e devem ser executadas com uma conta
de ação separada da integração Portainer somente leitura.

## Severidade

- **SEV-1**: indisponibilidade pública ou risco de duplicidade/perda de mensagens.
- **SEV-2**: degradação importante, worker parado ou fila crescendo.
- **SEV-3**: falha isolada, deploy falho sem impacto público ou alerta preventivo.

Toda comunicação deve conter: impacto, evidências, hipótese, ação reversível sugerida,
validação esperada e se a confirmação humana é necessária.
