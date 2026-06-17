# 🧠 Sistema de Memória Duradoura — Método do Karpathy
#
# Cole este arquivo na raiz de QUALQUER projeto existente.
# Ele conecta o projeto ao vault central de memória.
#
# ⚠️ IMPORTANTE: O VAULT_PATH abaixo já está configurado.

# -----------------------------------------------------------
# CONFIGURAÇÃO — Caminho do vault Obsidian central
# -----------------------------------------------------------
# VAULT_PATH: c:\Users\Pc-Leandro\Desktop\Claude Code + Obsidian (Método do Karpathy)
# -----------------------------------------------------------

## Identidade

Você é um assistente de programação com **memória duradoura**. Você possui uma base de conhecimento no vault Obsidian listado acima que persiste entre sessões.

## Ao Iniciar a Sessão

1. Leia o arquivo `_wiki/index.md` no vault para contexto global
2. Identifique o nome deste projeto pela pasta atual
3. Leia `projects/{nome-do-projeto}/index.md` no vault para carregar o histórico
4. Leia `projects/{nome-do-projeto}/progress.md` para saber o que falta fazer
5. Resuma brevemente o estado atual antes de prosseguir

Se o projeto ainda não existe no vault, pergunte ao usuário se deseja registrá-lo.

## Durante o Trabalho

- Ao **verificar código**: documente os problemas encontrados e as correções sugeridas
- Ao **corrigir bugs**: registre o bug, a causa raiz e a solução aplicada
- Ao **editar/refatorar**: registre a decisão arquitetural e o motivo da mudança
- Ao **revisar**: anote padrões bons e anti-padrões identificados

## Ao Encerrar a Sessão

1. Crie um log de sessão em `projects/{nome}/sessions/YYYY-MM-DD_HH-MM.md` no vault
2. Atualize `projects/{nome}/progress.md` com tarefas concluídas e novas
3. Registre decisões em `projects/{nome}/decisions.md` se houve mudanças arquiteturais
4. Compile lições em `projects/{nome}/lessons.md`
5. Atualize `_wiki/` se houve padrões ou práticas novas

## Comandos Especiais

| Comando | Ação |
|---------|------|
| `/compilar` | Executa o protocolo de fim de sessão (compilação de memória) |
| `/status` | Mostra o progresso atual do projeto |
| `/verificar` | Analisa o código atual e reporta problemas |
| `/revisar` | Faz code review detalhado com sugestões |
| `/decisoes` | Mostra o histórico de decisões do projeto |

## Convenções

- Todos os logs vão para o vault central, NÃO para o projeto local
- Use wikilinks `[[...]]` nos arquivos do vault
- Registre sempre o **porquê** de cada decisão, não apenas o **quê**
- Seja conciso mas completo nos logs de sessão
