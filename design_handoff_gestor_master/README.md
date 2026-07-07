# Handoff: Redesign Gestor Master — direção "2a" (técnico premium, claro)

> Pacote para implementação via Claude Code no repositório Next.js do Gestor Master
> (Next App Router + Tailwind v4 + shadcn/ui + Geist).

---

## 1. Visão geral

Redesign completo do produto (SaaS + área admin + páginas públicas) na direção aprovada **2a**:
painel técnico premium estilo Linear — claro, hairlines, uma tinta quase-preta como cor primária,
cor usada **por significado** (azul = interação, verde = dinheiro, vermelho/âmbar = status de vencimento),
números em fonte mono tabular, zero gradientes decorativos.

A mudança central de UX: **o dashboard vira uma "fila de cobrança"** — responde "quem eu cobro agora?"
antes de mostrar métricas. O menu lateral cai de ~16 itens soltos para 4 grupos.

## 2. Sobre os arquivos deste pacote

Os arquivos `.dc.html` são **referências de design criadas em HTML** — protótipos que mostram
aparência e comportamento pretendidos. **Não são código de produção para copiar.**
A tarefa é **recriar estas telas no codebase existente** (Next.js + Tailwind + shadcn/ui),
usando os componentes shadcn já instalados (`Button`, `Card`, `Table`, `Dialog`, `Tabs`, `Badge`, `Sidebar`, sonner)
re-estilizados pelos tokens da seção 4.

- `Redesign Gestor Master.dc.html` — canvas com TODAS as telas (abra no navegador; `support.js` deve ficar ao lado)
- `GUIA-APLICACAO.md` — especificações por tela + mapa tela → referência no canvas (seção 6 do guia)

Como ler o canvas: cada tela tem um badge de id (ex.: `2a`, `3a`, `6b`). O guia referencia esses ids.

## 3. Fidelidade

**Alta (hifi).** Cores, tipografia, espaçamentos, copy e hierarquia são finais — recriar fielmente.
Exceção: os dados exibidos são fictícios; conecte aos dados reais existentes.
Onde uma tela real tiver um caso que o design não cobre, siga os padrões da seção 7 (não invente um estilo novo).

## 4. Design tokens — substituir em `src/app/globals.css`

Substituir os valores atuais de `:root` / `.dark` (mantendo os NOMES de var do shadcn para não tocar nos componentes):

```css
:root {
  --background: #fbfbfa;        /* fundo de página */
  --foreground: #26272b;        /* texto padrão */
  --card: #ffffff;
  --card-foreground: #26272b;
  --popover: #ffffff;
  --popover-foreground: #26272b;
  --primary: #191a1e;           /* botão primário = tinta */
  --primary-foreground: #ffffff;
  --secondary: #f1f0ee;         /* fundos sutis, trilhos, chips */
  --secondary-foreground: #55565c;
  --muted: #f7f7f5;             /* header de tabela, caixas de resumo */
  --muted-foreground: #8a8983;  /* texto secundário (#9b9a94 p/ terciário) */
  --accent: #e9e9ff;            /* item ativo da sidebar */
  --accent-foreground: #3140a8;
  --destructive: #b23c3c;
  --border: #ecebe7;            /* hairline padrão (#e7e6e2 sidebar, #e2e1dd inputs/botões) */
  --input: #e2e1dd;
  --ring: #4055c8;

  /* Tokens semânticos novos (adicionar) */
  --interactive: #4055c8;       /* links, ações textuais, foco */
  --money: #2e7d54;             /* valores positivos, dinheiro, sucesso */
  --warning: #c98a1e;           /* vence hoje / atenção */
  --danger: #b23c3c;            /* vencido / crítico / destrutivo */
  --success-bg: #e2efe6;  --success-fg: #256b45;
  --warning-bg: #f2e8d4;  --warning-border: #e8d9b5;  --warning-fg: #8a6d1f;
  --danger-bg:  #f6e4e4;  --danger-fg:  #a13636;  --danger-border: #f0d9d9;
  --interactive-bg: #eef0ff;  --interactive-fg: #3140a8;

  --sidebar: #f5f5f3;
  --sidebar-border: #e7e6e2;
  --radius: 0.5rem;             /* 8px cards · 6px botões/badges · 12px modais */
}

.dark {
  --background: #1b1c1f;
  --foreground: #d6d7d9;
  --card: #202124;
  --card-foreground: #d6d7d9;
  --primary: #e8e9ef;           /* primário invertido no escuro */
  --primary-foreground: #14161d;
  --secondary: #212226;
  --secondary-foreground: #a3a4a8;
  --muted: #242528;
  --muted-foreground: #6e6f75;
  --accent: #2b2d3a;
  --accent-foreground: #c3ccff;
  --destructive: #e57373;
  --border: #26272b;            /* #2a2b2f em cards, #34353a em inputs */
  --input: #34353a;
  --ring: #8b9cf9;

  --interactive: #8b9cf9;
  --money: #3ecf8e;
  --warning: #dfb35c;
  --danger: #e57373;
  --success-bg: #1e3328;  --success-fg: #7dd3a8;
  --warning-bg: #332b1c;  --warning-border: #4a3f28;  --warning-fg: #dfb35c;
  --danger-bg:  #3a2224;  --danger-fg:  #e57373;  --danger-border: #4a2c2e;
  --interactive-bg: #262a3d;  --interactive-fg: #aab6ff;

  --sidebar: #18191c;
  --sidebar-border: #2a2b2f;
}
```

**Remover do CSS/JSX atual:** `glass-card`, gradientes decorativos (`bg-gradient-to-*` em cards),
sombras coloridas, `animate-pulse` em badges, blur-blobs de fundo, o tema sky/rose por página,
emojis como ícone de status (🔥 🟢 🟡 🔴), barras laterais coloridas em itens de menu.

## 5. Tipografia

- **Geist Sans** (já no projeto): UI e prosa. Títulos de página 15px/600 tracking -0.02em; títulos de modal 14px/600; corpo 12–13px.
- **Geist Mono** (adicionar via `geist/font/mono`): microlabels em caps (10px, letter-spacing 0.06em, cor muted) — ex.: `LUCRO DO MÊS`; KPIs numéricos (19–26px/600, tracking -0.02em); valores em tabelas (11–12px/500); datas/horas/ids; badges tipo `VENC. 2D`.
- Em qualquer coluna numérica com Geist Sans: `font-variant-numeric: tabular-nums`.
- Preços/valores **nunca quebram linha**: `white-space: nowrap` em células de valor.

## 6. Sidebar — reorganização (`src/components/app-sidebar.tsx`)

Estrutura nova (rotas existentes, só reagrupadas):

| Grupo (label mono 9.5px caps) | Itens |
|---|---|
| *(sem label)* | Painel `⌘1` |
| OPERAÇÃO | Clientes `⌘2` · Financeiro `⌘3` · Serviços `⌘4` · Promoções · Revendas |
| COMUNICAÇÃO | Automação · Aquecimento · Leads |
| CONEXÕES | Integrações · Painéis IPTV |
| *rodapé (hairline acima)* | Configurações · Suporte |

- **Afiliados** e **Atualizações** saem do menu → viram abas de Configurações/Minha conta (ver 5f/11b no canvas).
- **Desenvolvedor** (chaves API) → card dentro de Conexões/Integrações (ver 5d).
- Item ativo: fundo `--accent`, texto `--accent-foreground`, peso 600 — **sem** barra lateral colorida, sem ícone colorido.
- Logo: quadrado 20px tinta, "G" em Geist Mono 700 branco + wordmark "Gestor" 12.5px/600.
- Admin (`admin-sidebar.tsx`): mesmo componente com fundo `#191a1e` fixo (claro E escuro), selo `ADMIN` vermelho, grupos MONITORAR / OPERAR / PROTEGER, contadores de pendência à direita do item (ver 6a).

## 7. Componentes base (specs)

- **Botão primário**: fundo `--primary`, texto `--primary-foreground`, radius 6px, 500–600, padding 4–10px vert × 10–16px horiz conforme densidade. Um por vista.
- **Botão outline**: borda 1px `--input`, texto `--secondary-foreground`, fundo transparente.
- **Ação textual**: cor `--interactive`, peso 500, sem sublinhado (sublinha no hover).
- **Segmented control** (filtros): trilho `--secondary` radius 6px padding 2px; ativo = fundo card + sombra `0 1px 2px rgba(0,0,0,.06)` + 600.
- **Tabela**: header `--muted` com labels mono 9px caps; linhas com hairline `--border`; hover de linha `--muted`; célula de valor mono à direita.
- **Ponto de status**: círculo 6–7px + palavra (nunca só cor): `--danger` vencido, `--warning` vence hoje, cinza `#c9c8c2` futuro, `--money` ok/online.
- **Badge de status**: fundo `--*-bg`, texto `--*-fg`, radius 4px, 10px/600. Variante mono caps p/ códigos (`VENC. 2D`, `HOJE`).
- **Toggle**: 22×12px, ligado `--money`, desligado `#dcdbd5`.
- **Modal**: radius 12px, sombra `0 12px 32px rgba(0,0,0,.12)`, rodapé Cancelar (outline) + primário (flex maior). Destrutivo: vermelho SÓ no confirmar; PIN em caixas mono 38×40px; confirmar desabilitado até PIN completo.
- **Toast (sonner)**: card `--card` + hairline, ponto de status + título bold + ação `--interactive` à direita ("Desfazer · 6s"). Erro: borda `--danger-border`.
- **Banner**: faixa `--warning-bg`/borda, consequência explícita + botão primário tinta.

## 8. Padrões que o canvas não mostra (criar seguindo o sistema)

Liberdade criativa aprovada pelo cliente — aplicar estes padrões onde faltar:

- **Empty states**: sem ilustração SVG. Centro do card: microlabel mono caps muted (ex.: `SEM VENCIDOS HOJE`) + 1 frase 12px `--muted-foreground` + no máx. 1 ação. Para fila de cobrança vazia: `TUDO EM DIA ✓` com check em `--money`.
- **Loading**: skeleton shimmer (base `--secondary`, highlight `--muted`) na forma real do conteúdo (linhas de tabela, KPIs). Nunca spinner de página inteira; spinner 14px só dentro de botão em ação.
- **Foco (a11y)**: `outline: 2px solid var(--ring); outline-offset: 2px` em tudo focável.
- **Hover**: linhas/cards `--muted`; botões primários escurecem ~8% (`filter: brightness(.92)`); transições `150ms ease-out` só em background/border/opacity — sem scale/bounce.
- **Atalhos**: `⌘K` busca global (command palette shadcn); `⌘1–4` navegação; na fila: `c` cobrar, `r` renovar item focado. Mostrar kbd hints em tooltips.
- **Scrollbar**: fina (8px), thumb `#d5d4ce` radius 4px (escuro: `#34353a`).
- **Gráficos (recharts)**: barras/linhas em `--money` p/ dinheiro, `--secondary` p/ contexto; grid hairline; tooltip = card hairline com valores mono; sem gradiente de área, sem sombra.
- **Favicon/logo**: quadrado tinta radius 22%, "G" Geist Mono 700 branco.
- **Mobile (≤768px)**: tab bar 4 destinos + FAB "+" central (ver 4a); alvos ≥44px; CTA "Cobrar todos" fixo acima da tab bar; sidebar vira drawer.
- **Números negativos/custos**: sempre com sinal e cor (`−R$ 46` em `--danger` ou muted conforme contexto); nunca vermelho para número neutro.

## 9. Ordem de implementação sugerida

1. **Fundação**: `globals.css` (tokens §4) + Geist Mono + limpeza (§4 "remover") → o app inteiro já muda de cara.
2. **Shell**: `app-sidebar.tsx` reagrupada + header com busca ⌘K + status WhatsApp.
3. **Painel** (`/painel`): régua de KPIs + fila de cobrança + coluna Ganho do Dia (ref 2a).
4. **Clientes / Financeiro / Automação** (refs 3a–3c) + modais e toasts (5h, 7a, 7b).
5. **Telas secundárias** (5a–5f, 11a–11e) + páginas públicas (4b, 4c, 8a, 9a, 10a).
6. **Admin** (6a–6e) — último, reusa tudo.

Cada fase é shippável por si.

## 10. Interações & estados críticos

- Fila de cobrança: filtro segmentado Vencidos/Hoje/7 dias; "Cobrar" dispara template WhatsApp e vira toast com Desfazer; "Cobrar todos" pede confirmação simples (não-destrutiva).
- WhatsApp desconectado: banner âmbar no topo do conteúdo (não bloqueia navegação) + status no header vira ponto âmbar/vermelho.
- Exclusões: modal com PIN do cofre (7a); em massa oferece **Arquivar** como alternativa.
- Dark mode: toggle em Minha conta → Aparência (11e); persistir em `localStorage` + classe `.dark` no `<html>` (padrão next-themes já presente).

## 11. Arquivos

| Arquivo | Conteúdo |
|---|---|
| `Redesign Gestor Master.dc.html` | Canvas com todas as telas (2a…11e) |
| `support.js` | Runtime do canvas (manter ao lado do .dc.html) |
| `GUIA-APLICACAO.md` | Especificação tela a tela + mapa de referências |
| `screenshots/*.png` | 31 PNGs, um por tela, nomeados pelo id do canvas (ex.: `2a-painel-claro.png`) |
| `README.md` | Este arquivo |
