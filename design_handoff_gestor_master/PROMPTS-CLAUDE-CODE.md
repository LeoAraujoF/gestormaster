# Prompts para o Claude Code — fase a fase

Antes de tudo, copie a pasta `design_handoff_gestor_master/` para a raiz do repositório.
Cole um prompt por vez; valide o resultado no navegador antes de passar ao próximo.

---

## Fase 1 — Fundação (tokens + limpeza)

```
Leia design_handoff_gestor_master/README.md por completo.

Implemente a Fase 1:
1. Substitua os tokens de :root e .dark em src/app/globals.css pelos da seção 4 do README (mantendo os nomes de var do shadcn). Adicione os tokens semânticos novos (--interactive, --money, --warning, --danger e os *-bg/*-fg).
2. Adicione Geist Mono (geist/font/mono) no layout raiz e crie uma classe utilitária para microlabels mono em caps (10px, letter-spacing .06em).
3. Faça a limpeza global da seção 4 "Remover": glass-card, gradientes decorativos em cards, sombras coloridas, animate-pulse em badges, blur-blobs, temas sky/rose por página, emojis de status (🟢🟡🔴🔥) — substitua emojis por ponto colorido 6px + palavra.

Não redesenhe nenhuma tela ainda. Ao final, liste os arquivos alterados.
```

## Fase 2 — Shell (sidebar + header)

```
Com base no README (seção 6) e no screenshot design_handoff_gestor_master/screenshots/2a-painel-claro.png:

1. Reorganize src/components/app-sidebar.tsx nos grupos: Painel (solto), OPERAÇÃO (Clientes, Financeiro, Serviços, Promoções, Revendas), COMUNICAÇÃO (Automação, Aquecimento, Leads), CONEXÕES (Integrações, Painéis IPTV), rodapé (Configurações, Suporte). Labels de grupo em Geist Mono caps. Item ativo: fundo --accent, texto --accent-foreground, sem barra colorida. Remova Afiliados, Atualizações e Desenvolvedor do menu (viram abas/cards depois).
2. Novo logo: quadrado 20px tinta com "G" mono branco + wordmark "Gestor".
3. Header do dashboard: busca "Buscar cliente…" com kbd ⌘K (command palette shadcn), status "WhatsApp conectado" (ponto verde + texto), avatar.
4. Atalhos ⌘1–⌘4 para Painel/Clientes/Financeiro/Serviços.
```

## Fase 3 — Painel

```
Recrie a página /painel seguindo screenshots/2a-painel-claro.png (e 2b para o dark) + GUIA-APLICACAO.md:

- Título "Terça, N de mês" + resumo "X vencidos · Y vencem hoje"
- Régua de KPIs em card único dividido por hairlines: ATIVOS, VENCEM EM 7D (âmbar), VENCIDOS (vermelho), LUCRO DO MÊS (verde) — valores em Geist Mono
- Fila de cobrança: filtro segmentado (Vencidos/Hoje/7 dias), linhas com ponto de status + nome/plano + prazo + valor mono + botões Cobrar (primário tinta) e Renovar (outline); link "Cobrar todos →" em --interactive
- Coluna direita "GANHO DO DIA": valor verde grande, bruto/custo, mini gráfico de barras (recharts, barras --secondary + última --money), lista RECEBIDOS HOJE
- Ações rápidas em cards dashed: Novo cliente, PIX rápido, Disparo em massa
- Use os dados/queries reais que a página atual já busca.
```

## Fase 4 — Operação (Clientes, Financeiro, Automação) + feedback

```
Seguindo os screenshots 3a-clientes, 3b-financeiro, 3c-automacao + GUIA-APLICACAO.md, recrie as páginas /clientes, /financeiro e /automacao com os mesmos padrões da Fase 3 (régua de KPIs, tabelas com header --muted e labels mono, segmented controls, pontos de status).

Depois, seguindo 5h-modais-cliente-renovar, 7a-exclusoes-pin e 7b-promocao-toasts-banner:
- Restyle todos os Dialogs (radius 12px, rodapé Cancelar outline + primário tinta)
- Modais destrutivos: vermelho só no botão confirmar, PIN em caixas mono 38×40, confirmar desabilitado até PIN completo, opção Arquivar na exclusão em massa
- Toasts sonner: card branco hairline + ponto de status + ação à direita (Desfazer · 6s)
- Banner "WhatsApp desconectado" âmbar no topo do conteúdo
```

## Fase 5 — Secundárias + públicas

```
Seguindo os screenshots 5a–5f, 11a–11e e as seções correspondentes do GUIA-APLICACAO.md, aplique o padrão nas telas: Serviços, Promoções, Aquecimento, Leads, Integrações/Painéis (mescladas como "Conexões" com card de chaves API), Revendas (lista, detalhe com margens, métricas), Minha conta (abas: Perfil, Segurança/Cofre PIN, Aparência, Afiliados, Assinatura, Atualizações), Onboarding.

Depois as públicas, seguindo 4b-landing, 4c-login, 9a-cadastro, 8a-planos-checkout, 10a-termos-privacidade: landing sem blobs/gradientes, login card único, cadastro split com painel tinta, planos com rádios de pagamento e um botão primário, template legal com sumário sticky.
```

## Fase 6 — Admin

```
Seguindo 6a–6e + seção 5b do GUIA-APLICACAO.md, refaça a área /admin:
- admin-sidebar.tsx: fundo #191a1e fixo (claro e escuro), selo ADMIN vermelho, grupos MONITORAR/OPERAR/PROTEGER, contadores de pendência nos itens, links "← Voltar ao SaaS" e "Sair da conta" no rodapé
- Visão geral: KPIs + lista "Precisa de atenção" com ação inline + card Serviços
- Usuários: saúde como ponto+palavra, ações Limitar/Desbloquear
- Instâncias + Filas, Chamados + Recursos (feature flags), Saúde + Auditoria + Secrets — tudo conforme os screenshots
```

## Dica final

Após cada fase: `npm run dev`, compare com o PNG correspondente e responda ao Claude Code com o que divergiu ("na fila, o valor deve ser Geist Mono alinhado à direita, veja 2a-painel-claro.png").
