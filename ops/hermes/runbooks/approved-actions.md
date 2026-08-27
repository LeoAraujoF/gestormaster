# Política de ações aprovadas

O Hermes permanece em modo somente leitura por padrão. A integração atual com Portainer
usa token de leitura (`PORTAINER_READ_ONLY=1`) e não monta o socket do Docker.

Antes de habilitar ações de escrita em produção, é obrigatório:

- criar uma identidade Portainer separada, com escopo mínimo;
- usar token diferente do token de leitura e diferente das chaves DeepSeek;
- manter a ação desabilitada por padrão e exigir confirmação por ocorrência;
- registrar operador, horário, alvo, motivo, ação e validação;
- impor allowlist de containers e impedir operações em volumes, secrets e redes sem uma aprovação específica;
- definir timeout, limite de tentativas e rollback documentado;
- testar primeiro em uma janela de manutenção.

Até que essa identidade e esses limites estejam configurados, o Hermes deve apenas
diagnosticar, preparar o comando/ação e pedir a confirmação. Ele não deve reiniciar,
reimplantar, alterar variáveis, limpar filas ou reenviar mensagens automaticamente.

O executor instalado atualmente aceita somente `restart-container` e recusa a ação
quando `PORTAINER_ACTIONS_ENABLED` não está explicitamente ativo, quando o alvo está
fora de `ACTION_ALLOWED_CONTAINERS`, quando não existe `PORTAINER_ACTION_API_KEY` ou
quando a confirmação literal `CONFIRMAR` não foi apresentada. Cada tentativa é
registrada em `/opt/data/audit/actions.jsonl` com permissão restrita.
