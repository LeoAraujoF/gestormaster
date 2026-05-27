# Guia de Deploy (Home Lab / Produção)

Este documento contém as instruções necessárias para colocar o **Gestor Master** em produção no seu servidor Home Lab utilizando Docker, Nginx Proxy Manager e Cloudflare Tunnels.

## 1. Subindo o Sistema com Docker

Para iniciar ou atualizar o sistema no seu Home Lab, utilize o terminal na pasta raiz do projeto:

```bash
# 1. Atualize os arquivos (se estiver usando git)
git pull

# 2. Construa a imagem e inicie o container em background (sem derrubar o atual bruscamente)
docker compose up -d --build
```
*A aplicação estará rodando na porta `3000` (ex: `http://SEU_IP_LOCAL:3000`).*

---

## 2. Configurações Obrigatórias Pós-Deploy

Quando você expuser a aplicação para a internet (ex: `https://gestor.seudominio.com.br`) via Nginx Proxy Manager ou Cloudflare Tunnels, **você precisará ajustar os seguintes serviços externos**:

### A. Supabase (Autenticação e Banco de Dados)
O Supabase precisa saber o seu novo domínio para permitir o login seguro.
1. Acesse o painel do seu projeto no Supabase.
2. Vá em **Authentication** > **URL Configuration**.
3. Em **Site URL**, altere para o seu domínio oficial: `https://gestor.seudominio.com.br`
4. Em **Redirect URLs**, adicione a rota de callback: `https://gestor.seudominio.com.br/auth/callback`

### B. Stripe (Pagamentos e Assinaturas)
A Stripe precisa saber para onde enviar a confirmação de que um cliente pagou o plano.
1. Acesse o Dashboard da Stripe.
2. Vá em **Developers** (Desenvolvedores) > **Webhooks**.
3. Clique em **Add endpoint** (Adicionar endpoint).
4. Em **Endpoint URL**, coloque: `https://gestor.seudominio.com.br/api/stripe/webhook`
5. Selecione os eventos que deseja escutar (ex: `checkout.session.completed`, `customer.subscription.updated`).
6. Salve, copie o novo **Webhook Secret** (`whsec_...`) gerado por lá.
7. Atualize a variável `STRIPE_WEBHOOK_SECRET` no seu arquivo `.env.local` do Home Lab e reinicie o Docker.

### C. Evolution API (WhatsApp)
A Evolution precisa conseguir devolver informações (como o status do envio) para o seu sistema.
1. No seu arquivo `.env.local` de produção, verifique as URLs base para não usarem `localhost` caso o sistema precise disparar webhooks de volta (dependendo das configurações de Global Webhook que você criar na Evolution).

---

## 3. Manutenção e Logs

Se precisar ver o que está acontecendo dentro do container (erros de envio, logs do painel):
```bash
docker logs -f gestor_app
```

Se precisar parar o sistema:
```bash
docker compose down
```

### Dica de Backup
Lembre-se que, por usar o Supabase (nuvem), o banco de dados dos seus clientes já está seguro remotamente. Se a sua máquina local der problema, basta subir o Docker em outro lugar usando o mesmo arquivo `.env.local` e todo o sistema voltará exatamente como estava!
