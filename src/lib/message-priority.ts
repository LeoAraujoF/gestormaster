import type { ContactCategory } from './contact-policy'

/**
 * Prioridade dos jobs da fila de mensagens. **Menor = processado antes.**
 *
 * Todo produtor precisa definir uma. No BullMQ v5 o `moveToActive` drena a lista
 * `wait` com `RPOPLPUSH` **antes** de olhar o ZSET `prioritized`, e um job só vai
 * para `prioritized` quando `opts.priority` é maior que zero. Ou seja: um job sem
 * prioridade não é "prioridade média", é **prioridade máxima** — ele passa na
 * frente de tudo que foi priorizado.
 *
 * Era exatamente o que acontecia aqui: disparo em massa e automações iam sem
 * prioridade e o reenvio manual do usuário (`priority: 5`) ficava atrás de todos.
 *
 * Por isso `messageQueue` define `priority: MESSAGE_PRIORITY.bulk` em
 * `defaultJobOptions`: um produtor novo que esquecer de escolher cai no fim da
 * fila em vez de atropelá-la.
 */
export const MESSAGE_PRIORITY = {
  /** Códigos de acesso e reenvio manual: alguém está parado na tela esperando. */
  interactive: 1,
  /** Resposta a uma mensagem que o cliente acabou de mandar (autoatendimento, IA). */
  conversational: 2,
  /** Transacional: pagamento confirmado, convite de portal, notificação de revenda, API. */
  transactional: 3,
  /** Cobrança automatizada. */
  billing: 4,
  /** Automações agendadas e lembretes internos. */
  automation: 6,
  /** Disparo em massa e campanhas: sempre por último. */
  bulk: 10,
} as const

export type MessagePriority = (typeof MESSAGE_PRIORITY)[keyof typeof MESSAGE_PRIORITY]

/** Traduz a categoria de um contato coordenado para a escala acima. */
export function priorityForContactCategory(category: ContactCategory): MessagePriority {
  if (category === 'promotion') return MESSAGE_PRIORITY.bulk
  if (category === 'billing') return MESSAGE_PRIORITY.billing
  // 'manual' e 'operational' nascem de uma ação direta do usuário.
  return MESSAGE_PRIORITY.transactional
}
