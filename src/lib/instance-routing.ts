import 'server-only'

import { supabaseAdmin } from './supabase/service-role'

export type RoutableInstance = {
  id: string
  instance_name: string
  base_url: string | null
  api_key: string | null
  connection_mode: string | null
  min_delay: number | null
  max_delay: number | null
  sending_paused: boolean
  sending_pause_reason: string | null
  daily_message_limit: number | null
  message_min_interval_ms: number | null
  phone_number: string | null
  burst_message_count: number | null
  burst_pause_minutes: number | null
  is_primary: boolean | null
  allow_mass: boolean | null
  organization_id?: string
  user_id?: string
}

export const ROUTABLE_INSTANCE_SELECT =
  'id, instance_name, base_url, api_key, connection_mode, min_delay, max_delay, sending_paused, sending_pause_reason, daily_message_limit, message_min_interval_ms, phone_number, burst_message_count, burst_pause_minutes, is_primary, allow_mass, organization_id, user_id'

/**
 * Números ocupados por campanha em massa ativa, por nome de instância.
 *
 * Só `running` ocupa. Uma campanha `paused` não está entregando nada, então
 * prender o número dela seria tirar da operação um canal que está parado — e a
 * retomada acontece depois, quando o lembrete já saiu. `stopped` e `completed`
 * não ocupam por definição.
 */
export async function listMassBusyInstanceNames(
  organizationId: string | null | undefined,
  options: { ignoreRunId?: string | null } = {},
): Promise<Set<string>> {
  if (!organizationId) return new Set()
  let query = supabaseAdmin
    .from('mass_campaign_runs')
    .select('instance_names')
    .eq('organization_id', organizationId)
    .eq('status', 'running')
  // Ao buscar alternativa para um job da própria campanha, os números dela não
  // contam como ocupados: é justamente entre eles que a troca deve acontecer.
  if (options.ignoreRunId) query = query.neq('id', options.ignoreRunId)
  const { data, error } = await query

  // Falha de leitura não pode travar o envio de lembrete: sem a lista, o pior
  // caso é um lembrete sair por um número que está em massa — o que é o
  // comportamento que existia antes desta regra.
  if (error) return new Set()
  const nomes = new Set<string>()
  for (const row of data || []) {
    for (const nome of (row.instance_names as string[] | null) || []) nomes.add(nome)
  }
  return nomes
}

/**
 * Escolhe a instância que deve receber o envio agora, conforme `purpose`.
 *
 * Para lembrete/alerta, a regra na ordem: conectada, não pausada, **não ocupada
 * com campanha em massa**, e o principal (`is_primary`) na frente. Quando `excludeInstanceId` é
 * informado — a instância que acabou de se mostrar indisponível — a busca
 * procura a próxima da mesma organização: é o que dá o "o principal caiu, a
 * secundária livre assume o lembrete" sem nunca duplicar o envio, porque a troca
 * só acontece quando a originalmente escolhida está comprovadamente fora.
 *
 * Nunca retorna duas: a mensagem sai por uma só.
 */
export async function pickUsableInstance(input: {
  organizationId?: string | null
  userId?: string | null
  excludeInstanceId?: string | null
  /**
   * Para que serve o envio. `alerts` (padrão) é lembrete, cobrança e aviso —
   * evita números em campanha. `mass` é disparo em massa, e **nunca** pode cair
   * no principal: em 10/09/2026 foi exatamente isso que aconteceu. A campanha
   * rodava num número secundário, ele começou a devolver HTTP 500 e foi pausado,
   * e o fallback — que então não distinguia propósito — levou 43 mensagens da
   * campanha para o número principal. Isso consumiu a cota diária dele (80/dia),
   * e os lembretes das 18h05 e as boas-vindas bateram em
   * INSTANCE_DAILY_LIMIT_REACHED sem sair.
   */
  purpose?: 'alerts' | 'mass'
  /** Execução em massa do job, para os números dela não contarem como ocupados. */
  massRunId?: string | null
}): Promise<RoutableInstance | null> {
  if (!input.organizationId && !input.userId) return null
  const purpose = input.purpose ?? 'alerts'

  let query = supabaseAdmin
    .from('evolution_instances')
    .select(ROUTABLE_INSTANCE_SELECT)
    .eq('status', 'connected')
    .eq('sending_paused', false)
    .order('is_primary', { ascending: false })
    .limit(20)
  query = input.organizationId ? query.eq('organization_id', input.organizationId) : query.eq('user_id', input.userId!)
  if (input.excludeInstanceId) query = query.neq('id', input.excludeInstanceId)

  const { data } = await query
  const candidatas = (data as RoutableInstance[] | null) || []
  if (candidatas.length === 0) return null

  const organizationId = input.organizationId || candidatas[0]?.organization_id
  // A filtragem por ocupação acontece aqui, e não no SQL, porque a lista de
  // ocupados vem de outra tabela e são poucas instâncias por organização.
  const ocupadas = await listMassBusyInstanceNames(organizationId, { ignoreRunId: input.massRunId })

  if (purpose === 'mass') {
    // Massa só troca por número liberado para massa e que não seja o principal.
    // Sem candidato, devolve null de propósito: quem chama reagenda a mensagem
    // em vez de invadir o canal de lembretes.
    return candidatas.find((instancia) =>
      instancia.allow_mass === true
      && instancia.is_primary !== true
      && !ocupadas.has(instancia.instance_name),
    ) ?? null
  }

  const livres = candidatas.filter((instancia) => !ocupadas.has(instancia.instance_name))

  // Se todas estiverem em massa, o lembrete sai pela melhor disponível em vez de
  // não sair: atrasar cobrança indefinidamente é pior que dividir o número. A
  // preferência pelo principal continua valendo.
  return (livres[0] ?? candidatas[0]) ?? null
}

export type MassInstanceDecision = {
  permitidas: RoutableInstance[]
  recusadas: Array<{ instance_name: string; motivo: 'NOT_FOUND' | 'PRIMARY_RESERVED' | 'MASS_NOT_ALLOWED' | 'BUSY_WITH_MASS' }>
}

/**
 * Valida os números escolhidos para um disparo **em massa**.
 *
 * Duas recusas possíveis por política: o número é o principal (reservado a
 * lembretes) ou não está liberado para massa (`allow_mass`). Há ainda a recusa
 * por ocupação: o número já está em outra campanha ativa.
 *
 * Exceção deliberada para operação de um número só: se a organização não tem
 * nenhuma outra instância liberada para massa, o principal é aceito. Bloquear
 * aqui deixaria quem só tem um número sem disparo em massa nenhum, o que seria
 * uma regressão maior que a regra que se quer proteger.
 */
export async function resolveMassInstances(input: {
  organizationId: string
  instanceNames: string[]
}): Promise<MassInstanceDecision> {
  const { data } = await supabaseAdmin
    .from('evolution_instances')
    .select(ROUTABLE_INSTANCE_SELECT)
    .eq('organization_id', input.organizationId)

  const todas = (data as RoutableInstance[] | null) || []
  const porNome = new Map(todas.map((instancia) => [instancia.instance_name, instancia]))
  const ocupadas = await listMassBusyInstanceNames(input.organizationId)

  const existeAlternativaParaMassa = todas.some(
    (instancia) => instancia.allow_mass === true && instancia.is_primary !== true,
  )

  const permitidas: RoutableInstance[] = []
  const recusadas: MassInstanceDecision['recusadas'] = []

  for (const nome of input.instanceNames) {
    const instancia = porNome.get(nome)
    if (!instancia) {
      recusadas.push({ instance_name: nome, motivo: 'NOT_FOUND' })
      continue
    }
    if (ocupadas.has(nome)) {
      recusadas.push({ instance_name: nome, motivo: 'BUSY_WITH_MASS' })
      continue
    }
    if (instancia.is_primary === true && existeAlternativaParaMassa) {
      recusadas.push({ instance_name: nome, motivo: 'PRIMARY_RESERVED' })
      continue
    }
    if (instancia.allow_mass !== true && instancia.is_primary !== true) {
      recusadas.push({ instance_name: nome, motivo: 'MASS_NOT_ALLOWED' })
      continue
    }
    permitidas.push(instancia)
  }

  return { permitidas, recusadas }
}
