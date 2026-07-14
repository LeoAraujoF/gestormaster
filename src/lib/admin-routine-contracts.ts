export const ADMIN_OPERATIONAL_ROUTINES = [
  {
    id: 'reconcile-pix',
    name: 'Reconciliar cobranças PIX',
    description: 'Consulta cobranças pendentes no gateway e finaliza pagamentos confirmados.',
  },
  {
    id: 'schedule-intelligent-collections',
    name: 'Agendar Cobrança Inteligente',
    description: 'Cria somente despachos elegíveis, coordenados e idempotentes para o horário atual.',
  },
  {
    id: 'release-deferred-contacts',
    name: 'Liberar contatos adiados',
    description: 'Reavalia promoções e contatos adiados sem ultrapassar a prioridade financeira.',
  },
  {
    id: 'recover-intelligence',
    name: 'Recuperar Intelligence',
    description: 'Agenda relatórios devidos e recupera execuções pendentes ou abandonadas.',
  },
  {
    id: 'capture-analytics',
    name: 'Capturar Analytics',
    description: 'Persiste snapshots e projeções devidas sem reconstruir histórico artificial.',
  },
] as const

export type AdminOperationalRoutineId = (typeof ADMIN_OPERATIONAL_ROUTINES)[number]['id']

export type AdminOperationalRoutineResult = {
  id: AdminOperationalRoutineId
  ok: boolean
  httpStatus: null
  durationMs: number
  summary: string | null
}

export function isAdminOperationalRoutineId(value: unknown): value is AdminOperationalRoutineId {
  return ADMIN_OPERATIONAL_ROUTINES.some((routine) => routine.id === value)
}

export async function executeRoutineSafely(
  id: AdminOperationalRoutineId,
  runner: () => Promise<string>,
): Promise<AdminOperationalRoutineResult> {
  const startedAt = Date.now()
  try {
    const summary = await runner()
    return {
      id,
      ok: true,
      httpStatus: null,
      durationMs: Date.now() - startedAt,
      summary: summary.slice(0, 300),
    }
  } catch {
    return {
      id,
      ok: false,
      httpStatus: null,
      durationMs: Date.now() - startedAt,
      summary: null,
    }
  }
}
