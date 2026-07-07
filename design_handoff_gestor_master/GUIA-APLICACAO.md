# Guia de aplicação — direção 2a "Fusão"

Como levar o redesign aprovado (2a) para o código do Gestor. Referências: canvas `Redesign Gestor Master.dc.html`, opções 2a, 3a–3c, 4a–4c.

---

## 1. Tokens — `src/app/globals.css`

Substituir os valores atuais de `:root` / `.dark` (formato shadcn). Azul só para interação, verde só para dinheiro, vermelho/âmbar só para status.

```css
:root {
  --background: #fbfbfa;        /* fundo geral */
  --foreground: #26272b;        /* texto */
  --card: #ffffff;
  --card-foreground: #26272b;
  --primary: #191a1e;           /* botão primário = tinta, NÃO azul */
  --primary-foreground: #ffffff;
  --secondary: #f1f0ee;         /* segmentados, inputs */
  --secondary-foreground: #55565c;
  --muted: #f5f5f3;             /* sidebar */
  --muted-foreground: #8a8983;
  --accent: #e9e9ff;            /* item ativo da sidebar */
  --accent-foreground: #3140a8;
  --border: #ecebe7;            /* hairlines */
  --input: #e2e1dd;
  --ring: #4055c8;

  /* semânticos (novos) */
  --interactive: #4055c8;       /* links, "Cobrar todos →", seleção */
  --money: #2e7d54;             /* valores positivos, lucro, WhatsApp online */
  --danger: #b23c3c;            /* vencido */
  --danger-bg: #f6e4e4;
  --warning: #c98a1e;           /* vence hoje / pendente */
  --warning-bg: #f2e8d4;
  --success-bg: #e2efe6;        /* badge Ativo */
}

.dark {
  --background: #1b1c1f;
  --foreground: #d6d7d9;
  --card: #202124;
  --card-foreground: #ffffff;
  --primary: #e8e9ef;           /* botão primário claro no escuro */
  --primary-foreground: #14161d;
  --secondary: #212226;
  --secondary-foreground: #a3a4a8;
  --muted: #18191c;
  --muted-foreground: #6e6f75;
  --accent: #2b2d3a;
  --accent-foreground: #c3ccff;
  --border: #2a2b2f;
  --input: #2e2f34;
  --ring: #8b9cf9;

  --interactive: #8b9cf9;
  --money: #3ecf8e;
  --danger: #e57373;
  --danger-bg: #3a2224;
  --warning: #dfb35c;
  --warning-bg: #332b1c;
  --success-bg: #1e3328;
}
```

Remover: gradientes decorativos, sombras coloridas, qualquer `background-image` em cards.

## 2. Tipografia

- UI: Geist (já em uso). Títulos de página: 17px/600, letter-spacing -0.02em.
- **Todo número** (valores, contagens, datas curtas): Geist Mono com `font-variant-numeric: tabular-nums`.
- Micro-rótulos de card (`ATIVOS`, `LUCRO DO MÊS`): Geist Mono 9.5–10px, 500, letter-spacing 0.06em, cor `--muted-foreground`, caixa alta.

```css
.num { font-family: var(--font-geist-mono); font-variant-numeric: tabular-nums; }
.microlabel { font: 500 10px var(--font-geist-mono); letter-spacing: .06em; text-transform: uppercase; color: var(--muted-foreground); }
```

## 3. Sidebar — `src/components/app-sidebar.tsx`

Reagrupar os ~16 itens em 3 grupos + rodapé (ver 2a). Rótulos de grupo em `.microlabel`.

- **(sem rótulo)** Painel `⌘1`
- **OPERAÇÃO** Clientes `⌘2` · Financeiro `⌘3` · Serviços `⌘4` · Promoções · Revendas
- **COMUNICAÇÃO** Automação · Aquecimento · Leads
- **CONEXÕES** Integrações · Painéis IPTV
- **rodapé** Configurações (Minha conta) · Suporte

Mover para fora do menu: Afiliados e Atualizações viram seções/abas dentro de Minha conta; Desenvolvedor (chaves de API) vira card na tela Conexões (ver 5d). Item ativo: fundo `--accent`, texto `--accent-foreground`, sem barra lateral colorida.

## 4. Padrões de componente

- **Botão primário**: tinta sólida (`--primary`), radius 6px. Nunca azul.
- **Links de ação / bulk-bar**: cor `--interactive`.
- **Status**: sempre ponto de 7px + texto colorido, ou badge (`--danger-bg`+`--danger`, `--warning-bg`+`--warning`, `--success-bg`+verde). Nunca só texto preto.
- **Badges de vencimento**: "há 2 dias"/"ontem" em `--danger`; "vence hoje" em `--warning`; "em X dias" em `--muted-foreground`.
- **Régua de métricas** (dashboard): um card único dividido por hairlines internas (não 4 cards soltos) — ver 2a.
- **Filtros rápidos**: segmentado (`--secondary` com pílula branca ativa) com contagem, substituindo botões com emoji.
- **Tabela de clientes**: header em `.microlabel` com fundo `#f7f7f5`; linha selecionada com fundo `#fafaff`; ações por linha: Cobrar (primário) + Renovar (outline) + `⋯`.
- **Barra de seleção em massa**: fundo `--accent`, aparece acima da tabela ao selecionar (ver 3a).
- **Dashboard**: fila de cobrança à esquerda + coluna "Ganho do dia" (212px) à direita; atalhos tracejados abaixo da fila (ver 2a).
- **Mobile**: tab bar com 4 destinos + FAB central "+"; linhas da fila com botões ≥44px; CTA "Cobrar todos" fixo acima da tab bar (ver 4a).

## 4b. Padrões das telas secundárias (turn 5)

- **Cabeçalho de tela**: título 15px/600 + contagem em chip mono (`--secondary`) + ação primária à direita. Descrição em 10.5px `--muted-foreground` só quando o conceito não é óbvio (ex.: Aquecimento).
- **Abas internas** (Minha conta): texto 11.5px, ativa com borda inferior 2px tinta — não usar pills nem fundo (ver 5f).
- **Card de conexão** (painéis, gateways, instâncias): ícone-monograma 30px em `--secondary`, nome + subtexto, status à direita (ponto + palavra), rodapé hairline com métricas mono e link `--interactive` (ver 5d).
- **Barra de progresso**: altura 4–5px, trilho `--secondary`; cor pelo significado — verde=saúde/aquecimento, azul=consumo/campanha, âmbar=atenção. Sempre com par rotulado "X / Y" em mono (ver 5b, 5c, 5f).
- **Alerta acionável** (solicitações pendentes): faixa `--warning-bg` + borda, texto 600, botão tinta à direita — nunca banner colorido gigante (ver 5e).
- **Segredos** (chave API, PIX copia-e-cola): campo mono truncado em `--secondary` com ações "copiar" / "revogar" inline (ver 5d, 5h).
- **Modais**: radius 12px, sombra `0 12px 32px rgba(0,0,0,.12)`, título 14px/600 + subtexto contextual, rodapé Cancelar (outline) + primário tinta flex maior; seleção de período como segmentado; QR PIX 54px + copia-e-cola (ver 5h). Remover os blur-blobs decorativos dos DialogHeaders atuais.
- **Modal destrutivo** (excluir, bloquear): vermelho SÓ no botão confirmar e nos dados que serão perdidos; resumo do que se perde em caixa `--secondary`; PIN do cofre em caixas mono 38×40px (ativa com borda `--interactive`); confirmar desabilitado (`#f0d3d3`) até o PIN completo; em massa, oferecer **Arquivar** como saída não-destrutiva e mostrar contagem + receita ativa em risco (ver 7a).
- **Toasts** (sonner): card branco hairline, sombra média, ponto de status 7px + mensagem com título bold; ação à direita em `--interactive` (Desfazer · 6s, Tentar agora); erro ganha borda `#f0d9d9`. Sem ícones coloridos gigantes, sem fundo colorido (ver 7b).
- **Banner de conexão** (topo do conteúdo): faixa `--warning-bg`, mensagem com consequência ("14 mensagens aguardando") e ação primária tinta (ver 7b).
- **Linhas arquivadas/inativas**: todo o conteúdo em `--muted-foreground`, badge cinza — sem opacity na linha inteira.

## 5. Landing / Login

- Fundo `--background`, zero gradientes/blobs. Hero: badge-pílula com ponto verde, H1 forte (-0.035em), captura do produto emoldurada como herói (ver 4b).
- Login: card único centrado, botão tinta, link "Teste 7 dias grátis" em `--interactive` (ver 4c). Cadastro reusa o mesmo layout com os campos extras.

## 5b. Área Admin (`/admin`)

Mesmos tokens; identidade de zona restrita:

- **Sidebar em tinta escura** (`#191a1e`, item ativo `#2e2f36`) + selo `ADMIN` vermelho no header — é o único lugar do produto com sidebar escura. Remover o tema rose-500 atual e as barras laterais coloridas por item.
- Menu reagrupado (9 itens → 3 grupos): **MONITORAR** Instâncias · Filas · Saúde / **OPERAR** Usuários · Chamados · Recursos / **PROTEGER** Auditoria · Secrets. Contadores de pendência no próprio item (vermelho/âmbar).
- **Visão geral** = régua de KPIs (MRR, usuários, instâncias, msgs, chamados) + lista "Precisa de atenção" com ação inline + card Serviços (ver 6a).
- **Saúde sem emoji**: 🟢🟡🔴 viram ponto 6px + palavra (Normal/Alto/Crítico) nas cores de status; remover `animate-pulse` (ver 6b).
- **Filas**: card por fila com badge de estado mono (AGUARDANDO/EM DIA), barra de profundidade e ações "Repetir falhas"/"Forçar cron" (ver 6c).
- **Prioridade de chamado**: badge mono URGENTE/ALTA/NORMAL nas cores de status (ver 6d).
- **Feature flags**: linha com toggle; flags em beta ganham badge azul BETA; aviso de impacto em faixa `--warning-bg` (ver 6d).
- **Auditoria**: linha = hora mono + frase com atores em bold + categoria em badge mono; secrets mascarados com idade e ação Rotacionar (ver 6e).

## 6. Mapa tela → referência no canvas

Painel 2a · Clientes 3a · Financeiro 3b · Automação 3c · Mobile 4a · Landing 4b · Login 4c · Serviços+Promoções 5a · Aquecimento 5b · Leads 5c · Conexões (Integrações+Painéis+API) 5d · Revendas 5e · Minha conta 5f · Afiliados 5g · Modais novo cliente/renovar 5h · Admin: visão geral 6a · usuários 6b · instâncias+filas 6c · chamados+recursos 6d · saúde+auditoria+secrets 6e · Exclusões com PIN 7a · Promoção+toasts+banner 7b · Planos/checkout 8a · Cadastro 9a · Termos/Privacidade 10a · Onboarding 11a · Atualizações 11b · Revenda detalhe 11c · Revendas métricas 11d · Cofre+Aparência 11e

**Planos (`/planos`)**: card resumo (preço mono grande, linhas de recurso hairline) + card "Forma de pagamento" com rádios (PIX, cartão, saldo de afiliado quando ≥ valor) e UM botão primário tinta — substitui os 3 botões coloridos; urgência = badge âmbar OFERTA LIMITADA (sem 🔥, sem blur); banner de fim de trial acima do pagamento (ver 8a).

**Cadastro (`/cadastro`)**: split — painel esquerdo tinta sólida com pitch + 3 provas (checks verdes) + prova social no rodapé; formulário nome/e-mail/senha/termos, botão único tinta, microcopy "7 dias grátis · sem cartão" sob o botão; link Entrar no rodapé (ver 9a). Sem gradiente zinc/sky, sem ícones dentro dos inputs.

**Termos/Privacidade (`/termos`, `/privacidade`)**: template legal único — breadcrumb com volta, sumário sticky à esquerda (item ativo em `--accent`), título + data de atualização em microlabel mono, prosa max-width ~60ch com h2 14.5px/600, avisos críticos (banimento) em faixa `--warning-bg`, cross-link entre as duas páginas no fim do sumário (ver 10a).

**Onboarding (`/onboarding`)**: stepper 1-2-3 no topo (Conectar WhatsApp → Primeiro cliente → Pronto), card único centrado com QR + status "aguardando leitura" (ponto âmbar), saída "Fazer depois" sempre visível, Continuar desabilitado até conectar (ver 11a).

**Atualizações (`/atualizacoes`)**: timeline com versão+data em coluna mono à esquerda, cards por entrada com badge de tipo NOVO/MELHORIA/CORREÇÃO (verde/azul/cinza), aba Alertas com contador âmbar estático — sem animate-pulse (ver 11b).

**Revendas detalhe (`revendas/[id]`)**: breadcrumb + card Dados do Parceiro (métricas mono) + tabela de margens: CUSTO BASE (muted) → SUA MARGEM (chip verde editável) → REVENDEDOR PAGA (bold) + toggle de acesso; serviço sem acesso fica muted com margem zerada; zona de perigo discreta abaixo do card (ver 11c).

**Revendas métricas (`revendas/metricas`)**: régua de 4 KPIs (lucros em verde, aguardando âmbar) + período segmentado + tabela de movimentações com status Pago/Aguardando/Recusado e ação Aprovar inline na linha pendente — sem glass-card/gradiente (ver 11d).

**Minha conta — Segurança e Aparência**: Cofre PIN como card com badge Ativo, alterar PIN (atual/novo/confirmar), "Esqueci meu PIN" em `--interactive`, toggle de bloqueio após 3 erros; Aparência com 3 mini-previews radio (Claro/Escuro/Sistema, seleção = borda tinta 1.5px) + toggle de fonte tabular (ver 11e).
