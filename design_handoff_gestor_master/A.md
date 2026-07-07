# Guia de implementação — Automação + Modais de Clientes

Como levar `Automacao.dc.html` e `Modais Clientes.dc.html` (direção 2a) para o app Next.js real.
Os `.dc.html` são **referências de design interativas** — recrie no codebase com shadcn/ui + Tailwind, aplicando os tokens da seção 4 do README principal.

> ⚠️ Nos protótipos os campos de texto longo usam `contenteditable` e os textareas foram evitados por uma limitação do runtime do preview. **No app real use `<Textarea>` do shadcn normalmente** — essa limitação não existe lá.

---

## PARTE 1 — Página Automação (`src/app/(dashboard)/automacao/page.tsx`)

A estrutura de dados e as ações (Supabase, Evolution API, BullMQ) **já existem e devem ser mantidas**. O trabalho é **só de UI**: trocar o visual atual (sky/emerald/glass-card/animate-pulse) pela direção 2a. Mapa de mudança:

### 1.1 Cabeçalho
- Título `text-[22px] font-semibold tracking-tight` "Automação WhatsApp" + subtítulo em `text-muted-foreground text-[12.5px]`.
- Status do WhatsApp vira **chip**: ponto 6px + texto (`--money` conectado / `--danger` sem número) — remova o texto solto atual.
- Ações à direita: "Testar disparo" (outline) + "Conectar número" (primário tinta).

### 1.2 KPIs (os 4 cards do topo)
- Remova `rounded-2xl`, os blobs decorativos (`bg-emerald-500/5 rounded-bl-full`), sombras coloridas.
- Card = `bg-card border rounded-[10px] p-4`. Ícone em quadradinho `26px` com fundo do token semântico (verde/âmbar/vermelho/azul-claro).
- Número em **Geist Mono 26px** com a cor do significado; label e sublinha em muted.
- KPIs: **Disparos com sucesso** (money), **Na fila** (warning), **Falhas recentes** (danger), **Para cobrar** (interactive).

### 1.3 Tabs (mantém as 4: Conexão · Regras · Disparo em massa · Logs)
- `TabsList`: fundo `--secondary`, radius 9px, padding 3px. Aba ativa = `bg-card` + sombra sutil + texto `--foreground`. Remova o `data-[state=active]:bg-primary/20`.
- No badge "Logs (N)" use chip mono âmbar **estático** — sem `animate-pulse`.

### 1.4 Aba Conexão
- **Fazenda de chips** (card esquerdo): ícone verde, contador "N/5" em mono, botão "Adicionar novo chip" verde `--money`.
- **Antibloqueio (anti-ban)**: dois steppers −/valor/+ (min/max) em vez dos `<Input type=number>` crus; botão "Salvar anti-ban" outline.
- **Bloqueio de chamadas**: toggle + `<Textarea>` da mensagem de recusa (aparece quando ligado).
- **Cards de instância** (direita): mantenha os 3 estados, re-estilizados:
  - **Online**: ícone ✓ em círculo verde com anel `animate-ping` (esse pode manter), telefone em mono, botões "Tornar principal" (âmbar suave) / "Desconectar" (outline vermelho).
  - **QR / conectando**: título, QR (mantém `QRCodeSVG`) em moldura, "Aguardando leitura…" com spinner âmbar, botões. **O QR fica aqui — não é modal.**
  - **Offline**: ícone ⚠, "Reconectar" (tinta) / "Excluir" (outline vermelho).
- Badge de status vira **ponto + palavra**, cores de status. Remova emojis 🟢🟡🔴.

### 1.5 Aba Regras (a "régua")
- Card com header (título + "Forçar robô" outline verde + "Nova regra" tinta) e **tabela**: TIPO / QUANDO / IMPACTO HOJE / MENSAGEM / STATUS / AÇÕES.
- Ícone do tipo = quadradinho com a cor do tipo (mapa em 1.7); "Impacto" = chip mono azul-claro; "Manual" = chip cinza.
- Status = **toggle** (verde/cinza) direto na linha, com `is_active`.
- Ações = editar (✎) / excluir (🗑) em botões-ícone outline.
- **Diálogo Nova/Editar regra**: gatilho (`Select`), Dias (stepper, só before/after_due), Horário (`Input type=time`, oculto p/ manuais), **Template** (`<Textarea>`), chips de variáveis clicáveis (inserem no textarea), toggle "Regra ativa". Rodapé Cancelar/Salvar. Remova o blur-blob do header.

### 1.6 Aba Disparo em massa
- Card central `max-w-[680px]`. Público-alvo como **botões segmentados** (ativo = tinta) no lugar do `Select` — mais rápido no mobile; mantenha o `Select` se preferir, re-estilizado.
- Banner de "Público estimado" em faixa `--interactive-bg`.
- Upload de banner: dropzone tracejada; quando anexado, mostra card com nome/tamanho + remover.
- Mensagem em `<Textarea>` + chips de variáveis. Agendamento em `Input type=datetime-local` dentro de caixa `--muted`.
- Botão de envio: verde quando conectado, cinza + "WhatsApp desconectado" quando não.

### 1.7 Mapa de cores dos tipos de alerta (use nos ícones e chips)
- `before_due` → azul `--interactive` · `on_due` → âmbar `--warning` · `after_due` → vermelho `--danger`
- `renewal` / `activation` / `quick_message` → verde `--money` · `promotion` → violeta `#7a5af8`

### 1.8 Aba Logs
- Filtros (Em andamento/Sucesso/Erro/Todos) como segmentado; ação em lote muda por filtro (Limpar / Reenviar todos / Cancelar todos) com a cor do tom.
- Nota da fila (anti-ban) em faixa `--warning-bg` só no filtro "Em andamento".
- Tabela: status como chip (Na fila/Enviado/Falhou), erro em vermelho abaixo do nome; ações reenviar/cancelar/excluir por linha.

Referência visual: veja o arquivo `Automacao.dc.html` (todas as abas e o diálogo) e os screenshots correspondentes.

---

## PARTE 2 — Modais de Clientes

### 2.1 Novo cliente / Ficha (`src/components/client-form-dialog.tsx`) — MUDANÇA DE ESCOPO
O pedido novo: **usuário e senha por serviço** (não um único login global).

**Schema (Zod)** — troque o `username` único por credenciais por serviço:
```ts
const serviceAccessSchema = z.object({
  service_id: z.string(),
  username: z.string().optional(),
  password: z.string().optional(),
})
const clientSchema = z.object({
  name: z.string().min(2, "Nome é obrigatório"),
  phone: z.string().optional(),
  selected_services: z.array(z.string()).min(1, "Selecione ao menos um serviço"),
  service_access: z.array(serviceAccessSchema).default([]), // ← NOVO
  plan_value: z.number().min(0),
  screens: z.number().min(1).max(10),
  due_date: z.string().min(1),
  due_time: z.string().optional(),
  status: z.enum(['active','pending','vencido','inactive']),
  observation: z.string().optional(),   // ← "Observação" (mantido)
})
```
- **Persistência**: adicione colunas `username` / `password` na tabela `client_services` (ou uma tabela `client_service_access`). Ao salvar, para cada `service_id` em `selected_services`, grave o par usuário/senha correspondente. Ao editar, pré-carregue de `client.client_services`.
- **UI**: cada card de serviço, quando **selecionado**, expande dois inputs (Usuário / Senha) — usuário em fonte mono, senha com botão mostrar/ocultar (`type` password↔text). Ambos **opcionais**. Marque isso com o texto "usuário e senha são opcionais".
- **Observação**: mantenha um `<Textarea>` "Observação" (o campo `observation` já existe). Pode manter também "Descrição (visível ao cliente)" se ainda usar.
- Header/seções na direção 2a: labels de seção em Geist Mono caps (DADOS PESSOAIS / SERVIÇOS E ACESSOS / COBRANÇA E PLANO / OBSERVAÇÃO); remova `glass-card` e o blur.
- Status inicial vira **segmentado** com ponto colorido (sem emojis 🟢🟡🔴⚫).

### 2.2 Renovar (`client-action-dialogs.tsx`)
- Período em grade 2×2 (1/3/6/12 meses) — selecionado com borda tinta; recalcula **novo vencimento** e **total** (ambos em mono, total em verde).
- Forma de pagamento como rádios (PIX / Dinheiro / Cartão). PIX revela QR + **copia-e-cola** com "Copiar código".
- Toggle "Avisar o cliente no WhatsApp". Rodapé Cancelar / Confirmar renovação.

### 2.3 Aplicar promoção
- Lista de promoções (rádio), cada uma com "+Nd". Mostra **dias extras** e **novo vencimento** em mono. Toggle de aviso. Confirmar tinta.

### 2.4 Excluir (destrutivo)
- Vermelho **só** no botão confirmar e na palavra "irreversível". Resumo do que se perde em caixa `--muted`.
- **PIN do cofre**: 4 caixas mono + teclado numérico (ou input mono); confirmar **desabilitado** (rosa) até 4 dígitos, aí vira vermelho sólido. PIN errado → toast de erro. Em exclusão em massa, ofereça **Arquivar** como alternativa (ver 7a do canvas).

### 2.5 Padrões comuns dos modais (todos)
- `DialogContent`: radius 12–13px, sombra `0 24px 56px rgba(0,0,0,.24)`, sem glass/blur.
- Header: ícone 34px em quadradinho + título 15px/600 + subtítulo contextual + ✕.
- Rodapé sticky: Cancelar (outline) + primário (tinta, ou vermelho se destrutivo).
- Toasts (sonner): card branco + ponto de status + ação à direita; erro com borda vermelha.

Referência visual: `Modais Clientes.dc.html` + screenshots.

---

## PARTE 3 — Ordem sugerida
1. Aplicar tokens 2a no `globals.css` (README principal) — muda tudo de cara.
2. Refatorar `client-form-dialog.tsx` (schema + acessos por serviço + migração da tabela).
3. Re-estilizar os diálogos de ação (renovar/promoção/excluir).
4. Re-estilizar a página `automacao/page.tsx` aba por aba (mantendo toda a lógica).

## PARTE 4 — Prompt pronto para o Claude Code
```
Leia design_handoff_gestor_master/GUIA-AUTOMACAO-E-MODAIS.md e os arquivos
Automacao.dc.html e "Modais Clientes.dc.html" como referência visual.

Implemente a PARTE 2.1 primeiro: refatore src/components/client-form-dialog.tsx
para ter usuário e senha OPCIONAIS por serviço selecionado (com mostrar/ocultar
senha) e o campo Observação, seguindo o schema do guia. Crie a migração de banco
para armazenar username/password em client_services. Mantenha toda a lógica de
pagamento/automação existente. Depois me mostre antes de seguir para os outros modais.
```
