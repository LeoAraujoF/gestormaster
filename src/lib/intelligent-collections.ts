import { supabaseAdmin } from '@/lib/supabase/service-role'
import { messageQueue } from '@/lib/queue'
import { resolveProfileCode, type CollectionProfileCode } from '@/lib/collection-score'
import { createCoordinatedAlert, reserveContact } from '@/lib/contact-coordination'

type ProfileCode = CollectionProfileCode

type CollectionProfile = {
  id: string
  code: ProfileCode
  name: string
  min_score: number | null
  max_score: number | null
  is_override: boolean
  is_active: boolean
}

type CollectionStep = {
  id: string
  profile_id: string
  sequence: number
  relative_day: number
  send_time: string
  message_template: string
  is_active: boolean
}

export async function ensureIntelligentCollectionSetup(organizationId: string) {
  const { error } = await supabaseAdmin.rpc('initialize_intelligent_collections', { p_organization_id: organizationId })
  if (error) throw new Error(`Falha ao inicializar cobrança inteligente: ${error.message}`)
}

export { resolveProfileCode }

function dateInTimezone(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).reduce<Record<string, string>>((result, part) => ({ ...result, [part.type]: part.value }), {})
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  }
}

function addDays(date: string, days: number) {
  const result = new Date(`${date}T12:00:00Z`)
  result.setUTCDate(result.getUTCDate() + days)
  return result.toISOString().slice(0, 10)
}

function renderMessage(template: string, client: { name: string }, cycle: { due_date: string; amount: number }) {
  return template
    .replaceAll('{{primeiro_nome}}', client.name.trim().split(/\s+/)[0] || 'cliente')
    .replaceAll('{{vencimento}}', new Date(`${cycle.due_date}T12:00:00`).toLocaleDateString('pt-BR'))
    .replaceAll('{{valor}}', new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(cycle.amount)))
}

export async function ensureOpenBillingCycles(organizationId: string) {
  const { data: clients, error } = await supabaseAdmin
    .from('clients')
    .select('id, due_date, plan_value')
    .eq('organization_id', organizationId)
    .in('status', ['active', 'vencido'])
    .not('due_date', 'is', null)
    .gt('plan_value', 0)
  if (error) throw new Error(error.message)
  if (!clients?.length) return 0
  const { error: upsertError } = await supabaseAdmin.from('billing_cycles').upsert(clients.map((client) => ({
    organization_id: organizationId,
    client_id: client.id,
    due_date: client.due_date,
    amount: client.plan_value,
  })), { onConflict: 'client_id,due_date', ignoreDuplicates: true })
  if (upsertError) throw new Error(upsertError.message)
  await supabaseAdmin.from('billing_cycles').update({ status: 'overdue' }).eq('organization_id', organizationId).eq('status', 'open').lt('due_date', new Date().toISOString().slice(0, 10))
  return clients.length
}

export async function refreshOrganizationCollectionScores(organizationId: string) {
  const { data: clients, error } = await supabaseAdmin.from('clients')
    .select('id')
    .eq('organization_id', organizationId)
    .in('status', ['active', 'vencido'])
  if (error) throw new Error(error.message)
  for (const client of clients || []) await calculateScore(client.id)
  return clients?.length || 0
}

export async function prepareIntelligentCollectionData(organizationId: string) {
  const cycles = await ensureOpenBillingCycles(organizationId)
  const scores = await refreshOrganizationCollectionScores(organizationId)
  return { cycles, scores }
}

async function calculateScore(clientId: string) {
  const { data, error } = await supabaseAdmin.rpc('recalculate_collection_score', { p_client_id: clientId })
  if (error) throw new Error(error.message)
  return data as { score: number; confidence: string }
}

export async function scheduleIntelligentCollections(now = new Date()) {
  const { data: settings, error } = await supabaseAdmin.from('collection_settings').select('*').eq('enabled', true)
  if (error) throw new Error(error.message)
  let queued = 0

  for (const setting of settings || []) {
    const local = dateInTimezone(now, setting.timezone)
    const [{ data: profiles }, { data: steps }] = await Promise.all([
      supabaseAdmin.from('collection_profiles').select('*').eq('organization_id', setting.organization_id).eq('is_active', true),
      supabaseAdmin.from('collection_profile_steps').select('*').eq('is_active', true),
    ])
    const profileList = (profiles || []) as CollectionProfile[]
    const stepList = (steps || []) as CollectionStep[]

    for (const step of stepList) {
      const profile = profileList.find((item) => item.id === step.profile_id)
      if (!profile) continue
      const [hour, minute] = step.send_time.slice(0, 5).split(':').map(Number)
      const stepMinute = hour * 60 + minute
      const [windowStartHour, windowStartMinute] = setting.send_window_start.slice(0, 5).split(':').map(Number)
      const [windowEndHour, windowEndMinute] = setting.send_window_end.slice(0, 5).split(':').map(Number)
      if (stepMinute < windowStartHour * 60 + windowStartMinute || stepMinute > windowEndHour * 60 + windowEndMinute) continue
      if (local.minutes < stepMinute || local.minutes >= stepMinute + 5) continue

      const dueDate = addDays(local.date, -step.relative_day)
      const { data: cycles } = await supabaseAdmin
        .from('billing_cycles')
        .select('id, client_id, due_date, amount, status')
        .eq('organization_id', setting.organization_id)
        .eq('due_date', dueDate)
        .in('status', ['open', 'overdue'])

      for (const cycle of cycles || []) {
        const { data: client } = await supabaseAdmin.from('clients')
          .select('id, name, phone_e164, phone, user_id, status')
          .eq('id', cycle.client_id).eq('organization_id', setting.organization_id).maybeSingle()
        if (!client || !['active', 'vencido'].includes(client.status) || !(client.phone_e164 || client.phone)) continue
        const score = await calculateScore(client.id)
        const { data: assignments } = await supabaseAdmin.from('client_tag_assignments')
          .select('client_tags(code)')
          .eq('client_id', client.id)
        const tags = (assignments || []).map((assignment: any) => assignment.client_tags?.code).filter(Boolean)
        const selectedCode = resolveProfileCode(score.score, score.confidence, tags)
        if (selectedCode !== profile.code) continue

        const { data: recent } = await supabaseAdmin.from('collection_dispatches')
          .select('id, created_at')
          .eq('client_id', client.id)
          .gte('created_at', new Date(now.getTime() - 36 * 60 * 60 * 1000).toISOString())
        const localTodayCount = (recent || []).filter((item) => dateInTimezone(new Date(item.created_at), setting.timezone).date === local.date).length
        if (localTodayCount >= setting.daily_message_limit) continue
        const { count: cycleCount } = await supabaseAdmin.from('collection_dispatches').select('*', { count: 'exact', head: true }).eq('cycle_id', cycle.id).neq('status', 'cancelled')
        if ((cycleCount || 0) >= setting.cycle_message_limit) continue

        const message = renderMessage(step.message_template, client, cycle)
        const { data: dispatch, error: dispatchError } = await supabaseAdmin.from('collection_dispatches').insert({
          organization_id: setting.organization_id, client_id: client.id, cycle_id: cycle.id,
          profile_id: profile.id, step_id: step.id, message_content: message, scheduled_for: now.toISOString(),
        }).select('id').maybeSingle()
        if (dispatchError?.code === '23505') continue
        if (dispatchError || !dispatch) throw new Error(dispatchError?.message || 'Falha ao criar despacho de cobrança')

        const reservation = await reserveContact({
          organizationId: setting.organization_id,
          clientId: client.id,
          contactDate: local.date,
          timezone: setting.timezone,
          category: 'billing',
          source: 'intelligent_collection',
          sourceId: dispatch.id,
          requestedBy: client.user_id,
          messageContent: message,
        })
        if (!reservation.reservationId || !['reserved', 'idempotent'].includes(reservation.decision)) {
          await supabaseAdmin.from('collection_dispatches').update({ status: 'cancelled', error_message: reservation.reason }).eq('id', dispatch.id)
          continue
        }
        let historyId: string
        try {
          historyId = await createCoordinatedAlert({
            reservationId: reservation.reservationId,
            organizationId: setting.organization_id,
            userId: client.user_id,
            clientId: client.id,
            collectionDispatchId: dispatch.id,
            messageContent: message,
            origin: 'intelligent_collection',
            category: 'billing',
            decision: reservation.decision,
            reason: reservation.reason,
            scheduledAt: now.toISOString(),
          })
        } catch (historyError: any) {
          await supabaseAdmin.from('collection_dispatches').update({ status: 'failed', error_message: historyError.message }).eq('id', dispatch.id)
          throw historyError
        }
        await supabaseAdmin.from('collection_dispatches').update({ alert_history_id: historyId }).eq('id', dispatch.id)
        await messageQueue.add('send-intelligent-collection', {
          collectionDispatchId: dispatch.id,
          contactReservationId: reservation.reservationId,
        }, { jobId: `collection-${dispatch.id}` })
        queued++
      }
    }
  }
  return queued
}

export async function refreshCollectionScoreAfterPayment(clientId: string | null) {
  if (!clientId) return
  await calculateScore(clientId)
}

export async function recordApprovedCollectionPayment(input: {
  organizationId: string
  clientId: string | null
  dueDate: string | null
  amount: number
  pixChargeId: string
  paymentId: string | null
  paidAt?: string
}) {
  if (!input.clientId || !input.dueDate) return
  const paidAt = input.paidAt || new Date().toISOString()
  const { data: cycle, error: createError } = await supabaseAdmin.from('billing_cycles').upsert({
    organization_id: input.organizationId,
    client_id: input.clientId,
    due_date: input.dueDate,
    amount: input.amount,
    status: 'paid',
    pix_charge_id: input.pixChargeId,
    payment_id: input.paymentId,
    paid_at: paidAt,
  }, { onConflict: 'client_id,due_date' }).select('id').single()
  if (createError || !cycle) throw new Error(createError?.message || 'Falha ao vincular ciclo financeiro')
  if (input.paymentId) {
    const { error: paymentError } = await supabaseAdmin.from('payments').update({
      billing_cycle_id: cycle.id,
      payment_method: 'pix',
      provider: 'mercadopago',
      paid_at: paidAt,
    }).eq('id', input.paymentId).eq('organization_id', input.organizationId)
    if (paymentError) throw new Error(paymentError.message)
  }
  await refreshCollectionScoreAfterPayment(input.clientId)
}
