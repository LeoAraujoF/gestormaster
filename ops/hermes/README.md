# Hermes no Home Lab

Esta pasta contém a implantação inicial do Hermes para operar a infraestrutura da
Lembrado com segurança. A stack é separada da aplicação: não usa o Redis, o banco,
as redes internas ou o socket do Docker da Lembrado.

## O que está implementado

- container oficial `nousresearch/hermes-agent` com volume persistente;
- gateway local na porta `8642` e dashboard desativado por padrão;
- bind local (`127.0.0.1`) por padrão, sem exposição direta à internet;
- allowlist de usuários do gateway;
- limite configurável de CPU e memória;
- logs com rotação;
- identidade e política operacional em `bootstrap/`;
- skills iniciais para operação do Home Lab e da Lembrado.
- monitor somente leitura a cada 5 minutos e resumo diário no Telegram;
- snapshots estáveis de Portainer, containers, liveness público e GitHub Actions;
- runbooks para aplicação, worker/fila, Evolution, deploy e ações aprovadas.

O primeiro estágio é de observação e diagnóstico. Portainer, GitHub, Supabase,
Evolution e qualquer ação de produção devem ser conectados depois com credenciais
dedicadas e escopo mínimo.

A aplicação também disponibiliza `GET https://www.lembrado.com.br/api/health`. Esse
endpoint é um liveness público e mínimo: confirma que o processo web responde, mas
não expõe saúde do banco, filas, telefones ou credenciais. O diagnóstico de dependências
continua sendo feito pelo Portainer.

## Publicação pelo Portainer

Crie uma nova Stack no Portainer usando o repositório Git da Lembrado:

- repositório: `https://github.com/LeoAraujoF/gestormaster.git`;
- branch: `main`;
- caminho do compose: `ops/hermes/docker-compose.yml`;
- habilite atualização pelo Git somente depois de testar a primeira implantação.

Cadastre as variáveis de `../.env.example` no Portainer. No mínimo, mantenha:

- `HERMES_BIND_ADDRESS=127.0.0.1`;
- `HERMES_DASHBOARD=0`;
- `GATEWAY_ALLOW_ALL_USERS=false`;
- `GATEWAY_ALLOWED_USERS` com os IDs autorizados;
- `API_SERVER_ENABLED=false`.

O limite inicial de memória está em `1G` porque este Home Lab tem 3,6 GB de RAM e já
mantém a Lembrado, Evolution, Redis, Portainer e Nginx em execução. Se o uso real do
Hermes justificar mais memória, aumente gradualmente após observar o host.

Para o modelo, use uma chave dedicada do provedor escolhido, com limite de gasto.
Não reutilize nenhuma chave da Lembrado, do Supabase, da Stripe ou da Evolution.

Com DeepSeek, use o modelo principal `deepseek-v4-flash`. Para análise de imagens,
screenshots e gráficos, configure separadamente `deepseek-v4-flash-vision-exp` como
modelo auxiliar de visão. O modelo principal é texto; a API de visão exige o modelo
com sufixo `-vision-exp` e aceita JPEG, PNG, GIF e WebP.

O volume `hermes_data` deve permanecer associado à stack. Ele guarda configuração,
memória, sessões e logs do Hermes. Não versione esse conteúdo.

## Primeiro acesso

1. Faça o deploy e aguarde o container ficar `running`.
2. Abra o console do container no Portainer e execute o assistente oficial `hermes setup`
   (se o console não carregar o PATH, use `/opt/hermes/.venv/bin/hermes setup`).
3. Configure o provedor e o canal de mensagens desejado.
4. Confirme que a allowlist bloqueia usuários não autorizados.
5. Faça um teste de consulta sem efeitos colaterais: status da stack, versão da imagem
   e saúde da aplicação.

O dashboard só deve ser ativado temporariamente para administração local ou publicado
atrás de autenticação forte, VPN/Tailscale ou proxy privado. Nunca publique a porta
`9119` diretamente na internet.

## Conectar capacidade operacional

A ordem recomendada é:

1. leitura do Portainer e health checks;
2. leitura do GitHub Actions e releases;
3. leitura de logs com mascaramento;
4. alertas por Telegram/Discord/Slack;
5. ações com confirmação: restart, redeploy, rollback e reenvio;
6. automações recorrentes apenas após validar o histórico de falsos positivos.

O agente não deve receber o Docker socket. Para ações no Portainer, use um token
dedicado, preferencialmente somente leitura no estágio inicial. Para o GitHub, use
um token fino e somente leitura até que haja uma necessidade operacional aprovada.

### Portainer MCP

O Hermes usa o pacote oficial do Portainer por meio de um processo MCP local.
O container não monta o socket Docker e a integração fica estritamente em modo
de leitura (`PORTAINER_READ_ONLY=1`), sem proxy de comandos (`PORTAINER_NO_PROXY=1`).

Depois de criar o token de acesso no Portainer, coloque-o somente no `.env` da
stack no servidor como `PORTAINER_API_KEY`. Não o versione nem o envie por chat.
Recrie o container e registre o MCP dentro do Hermes:

```bash
docker compose up -d --force-recreate hermes
docker exec -it hermes_agent /opt/hermes/.venv/bin/hermes mcp add portainer \
  --command /bin/sh --args /opt/workspace/portainer-mcp
docker exec -it hermes_agent /opt/hermes/.venv/bin/hermes mcp test portainer
```

Para fazer a autenticação sem expor a senha ou o token no terminal compartilhado,
use o assistente `bootstrap/configure-portainer.sh` no host. Ele solicita as
credenciais de forma interativa, grava o token com permissão `600`, recria o Hermes,
habilita o MCP e executa o teste.

O Portainer atual do homelab é 2.39.x; o servidor MCP oficial atualmente
publicado acompanha versões 2.41.x ou mais novas. Mantemos o pacote fixado e
limitado a `BASE,DOCKER` para reduzir o risco de incompatibilidade enquanto o
Portainer não for atualizado em uma janela própria.

### Monitoramento contínuo

O job `Home Lab - health monitor` roda a cada 5 minutos, entrega no Telegram e só
aciona o modelo quando o snapshot muda. O job `Home Lab - daily summary` roda às
08:00 no fuso `America/Sao_Paulo`. Ambos são somente leitura. O monitor cobre os
containers críticos, `/api/health`, o ambiente Portainer e o último workflow público
do GitHub Actions.

Os backups operacionais devem ser mantidos fora do repositório e com acesso restrito.
Antes de atualizar Portainer, Hermes ou qualquer serviço de produção, gere backup e
defina uma janela de manutenção.

## Critério de sucesso do MVP

O MVP estará pronto quando o Hermes conseguir responder, sem segredo exposto:

- qual commit e imagem estão em produção;
- se `gestor_app`, `gestor_worker`, `gestor_scheduler`, Redis e Evolution estão saudáveis;
- se o liveness web responde em `/api/health`;
- se houve falha recente no GitHub Actions;
- qual evidência sustenta um diagnóstico;
- qual ação requer aprovação humana.

## Ações de produção

O ambiente está pronto para diagnóstico contínuo. A camada de escrita continua
desabilitada de propósito: para ativá-la, crie uma identidade Portainer separada com
escopo mínimo e siga `runbooks/approved-actions.md`. Isso evita que um alerta, um
prompt ambíguo ou uma chave exposta possa reiniciar serviços, alterar secrets ou
reenviar mensagens sem aprovação humana.
