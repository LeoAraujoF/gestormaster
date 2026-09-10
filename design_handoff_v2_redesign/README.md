# Handoff: Redesign Gestor Master v2

## Overview
Redesign completo do dashboard "Lembrado" (Gestor Master), cobrindo Painel, Clientes, Financeiro, Catálogo (Serviços/Promoções), Automação, Aquecimento, Leads, Analytics, Integrações (Gateways e API), Configurações, Suporte, Notificações e Afiliados. Todas as telas foram construídas como protótipos clicáveis em HTML/React (Design Components) com estado real via useState — não é código de produção.

## About the Design Files
Os arquivos `.dc.html` desta pasta são **referências de design** — protótipos de alta fidelidade mostrando aparência e comportamento pretendidos, não código para copiar literalmente. A tarefa é **recriar** estas telas dentro do ambiente já existente do projeto (Next.js 15 + React + Tailwind v4 + shadcn/ui + base-ui, ver `package.json`/`src/components/ui`), reaproveitando os componentes, tokens de tema (`globals.css`) e padrões de estado (`use client`, hooks, providers) já estabelecidos no repositório — em vez de introduzir HTML/CSS inline novo.

## Fidelity
**Alta fidelidade (hifi).** Cores, tipografia, espaçamentos, ícones e cópia de texto devem ser recriados fielmente, usando os tokens/variáveis CSS já existentes em `src/app/globals.css` (`--background`, `--foreground`, `--card`, `--primary`, `--money`, `--warning-*`, `--danger-*`, `--interactive-*`, `--sidebar-*`, etc.) em vez dos valores hexadecimais fixos usados nos protótipos (que foram copiados a partir desses mesmos tokens claros).

## Design tokens (extraídos do tema claro do app)
- Fundo: `#fbfbfa` · Texto: `#26272b` · Card: `#ffffff` · Borda: `#ecebe7`
- Primário (botões escuros): `#191a1e` / texto `#ffffff`
- Interativo/links: `#4055c8` (bg suave `#eef0ff`)
- Dinheiro/sucesso: `#2e7d54` (bg suave `#e2efe6`)
- Aviso: `#8a5f0e` (bg suave `#f2e8d4`)
- Perigo: `#b23c3c` (bg suave `#f6e4e4`)
- Sidebar: fundo `#f5f5f3`, borda `#e7e6e2`, item ativo bg `#e9e9ff` / texto `#3140a8`
- Tipografia: Geist (UI) + Geist Mono (números, labels uppercase, timestamps)
- Border-radius: 8px (botões/inputs), 14-16px (cards), 22-24px (seções grandes), 9999px (pills/avatares)
- Sombra padrão de card: `0 1px 2px rgba(0,0,0,.04)`

## Screens / Views
Ver `screens/` para uma nota por tela com propósito, estrutura de layout e interações principais. Resumo:

| Arquivo | Tela | Rota sugerida |
|---|---|---|
| `Painel v2.dc.html` | Dashboard (KPIs, fila de ação, mapa de vencimentos, filtros de período) | `/painel` |
| `Clientes.dc.html` | Lista de clientes, filtros, Ficha 360, modal Novo/Editar cliente (2 telas: Dados/Plano) | `/clientes` |
| `Financeiro.dc.html` | Relatórios financeiros, meta mensal, gráficos, movimentações | `/financeiro` |
| `Servicos.dc.html` / `Promocoes.dc.html` | Catálogo: serviços e promoções | `/servicos`, `/promocoes` |
| `Automacao.dc.html` | Central de automação: régua financeira, mensagens automáticas, disparo em massa, logs | `/automacao` |
| `Aquecimento.dc.html` | Aquecimento de chips: pool, curva de volume, conversas simuladas | `/automacao/aquecimento` |
| `Leads.dc.html` | Funil kanban de leads, disparo em massa para leads selecionados | `/leads` |
| `Analytics.dc.html` | Métricas avançadas (plano Pro/Master) | `/analytics` |
| `Gateways e API.dc.html` | Integrações de pagamento e API | `/conexoes/gateways` |
| `Configuracoes.dc.html` | Perfil, negócio, operação, notificações, segurança, equipe, dados | `/configuracoes` |
| `Suporte.dc.html` | Central de ajuda, FAQ, chamados | `/suporte` |
| `Notificacoes.dc.html` | Central de notificações (aberta pelo sininho do header) | `/notificacoes` |
| `Afiliados.dc.html` | Programa de indicação/comissão | `/afiliados` |

## Interactions & Behavior
Cada tela é interativa no protótipo (React state local): abrir/fechar modais, filtros com contagem ao vivo, toasts de confirmação, toggles com persistência de estado em memória, listas paginadas/filtráveis, seleção múltipla com ações em lote. O dev deve portar esses comportamentos para os hooks/providers reais do app (ex.: dados vindo de API em vez de arrays mockados no componente).

## State Management
Os protótipos usam `useState`/classes de lógica local só para simular a experiência. Na integração real, ligar a:
- dados de clientes/cobranças/serviços já existentes no backend do Gestor
- providers já presentes no repo (`src/components/providers`)
- padrões de fetch/mutation já usados no restante do app

## Assets
Ícones: todos são SVG inline (stroke, 24x24 viewBox, estilo outline ~2px) — mesma linguagem visual do resto do produto (não são lucide-react diretamente, mas seguem o mesmo estilo; substituir por `lucide-react` equivalentes já usados no projeto quando possível). Logo "lembrado." reconstruído em SVG inline no canto superior da sidebar.

## Files
Todos os `.dc.html` desta pasta são as referências completas de cada tela (HTML com estilos inline + lógica React embutida). Abra cada arquivo para ver a estrutura completa de markup, estados e cópia de texto exata.
