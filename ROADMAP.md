# 🗺️ Roadmap e Atualizações Futuras (Gestor Master)

Este documento guarda as ideias, melhorias arquiteturais e funcionalidades estratégicas que foram mapeadas para serem implementadas no futuro, visando elevar a plataforma a um nível SaaS Enterprise.

---

## 🔒 1. Segurança Avançada (MFA / 2FA)
- **O que é:** Autenticação de Dois Fatores (Google Authenticator / Authy).
- **Por que:** Atualmente o sistema usa Senha + PIN do Cofre. O 2FA na tela de Login impede invasões mesmo se a senha do usuário vazar, atraindo clientes maiores (B2B) que exigem compliance de segurança.
- **Como:** Utilizar as APIs nativas do Supabase Auth para habilitar o fluxo de MFA.

## 🎨 2. Personalização e Branding (Upload de Logo)
- **O que é:** Permitir o upload do Logotipo da Empresa na página `Minha Conta`.
- **Por que:** O sistema hoje só armazena o nome da empresa em texto. Ter o logotipo permite que o painel seja "White-label" e abre portas para gerar PDFs (como Notas e Relatórios) com a marca visual do usuário.
- **Como:** Usar o Supabase Storage para criar um bucket público (`avatars` ou `company_logos`) e adicionar um componente de drag-and-drop.

## 💳 3. Aprimoramento do Webhook da Stripe (Cancelamentos)
- **O que é:** Lidar automaticamente com o evento `customer.subscription.deleted` no webhook da Stripe.
- **Por que:** Hoje, se o cliente cancela o plano no Portal da Stripe, o webhook apenas gera um aviso no log do servidor. O usuário continuaria ativo no sistema até a data limite, mas o ideal é que o banco de dados registre o cancelamento.
- **Como:** 
  1. Salvar o `stripe_customer_id` na tabela de usuários ou metadata no momento do primeiro checkout.
  2. Ao receber o evento de `deleted`, buscar o usuário pelo `stripe_customer_id` e mudar o status ou remover a tag `has_active_subscription`.

## ⚙️ 4. Configurações do Portal da Stripe
- **O que é:** Ajustes finos no Stripe Dashboard.
- **Por que:** Evitar dores de cabeça com estornos e confusões financeiras.
- **Ação manual pendente:** O Administrador deve acessar o painel oficial da Stripe (Customer Portal Settings) e definir a regra de cancelamento para **"Cancel at period end"** (Cancelar apenas no fim do ciclo de cobrança vigente), impedindo que o acesso corte no meio do mês de forma abrupta caso não haja estorno.

## 🔔 5. Central de Notificações Ativa (Push / WhatsApp)
- **O que é:** Uma aba de configurações onde o usuário decide receber alertas ativos.
- **Por que:** Hoje o usuário precisa entrar no sistema e ir até a aba "Alertas" para ver que tem um cliente vencido ou que a instância desconectou.
- **Como:** Criar switches do tipo:
  - `[x] Receber alerta no meu WhatsApp se a instância cair.`
  - `[x] Receber no WhatsApp um resumo financeiro de MRR todo dia 01.`
  - `[x] Me avisar de clientes Vencidos no dia do vencimento.`
  - O próprio Worker do sistema enviaria essas mensagens para o número Master (telefone de suporte cadastrado).

## 💬 6. Integração de Live Chat (Opção Secundária de Suporte)
- **O que é:** Integração com um chat profissional gratuito (como o Crisp ou Tawk.to).
- **Como funciona:** O cliente abre chamados na bolinha do canto da tela. O atendente (Admin) atende pelo aplicativo do próprio celular (do Crisp/Tawk.to), podendo mandar áudios e ver em qual página o cliente está navegando em tempo real.
- **Status Atual:** Optamos por construir um Helpdesk Nativo (Tickets) primeiro, deixando esta integração como uma alternativa futura super premium.

---
*Este arquivo serve como um backlog. Quando for iniciar uma nova fase de desenvolvimento, basta apontar para cá e solicitar a execução do item desejado!*
