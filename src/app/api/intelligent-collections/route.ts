import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/service-role'
import { getOrganizationMembership } from '@/lib/access-control'
import { ensureIntelligentCollectionSetup, prepareIntelligentCollectionData, resolveProfileCode } from '@/lib/intelligent-collections'
import { organizationHasCapability } from '@/lib/plan-catalog'
import { getCollectionIneligibilityReasons, summarizeCollectionEligibility } from '@/lib/collection-orchestration'

async function getManager() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const membership = await getOrganizationMembership(supabase, user.id)
  if (!membership || !['owner', 'admin'].includes(membership.role)) return null
  if (!(await organizationHasCapability(membership.organizationId, 'intelligent_collections'))) return null
  return { user, organizationId: membership.organizationId }
}

export async function GET() {
  const manager = await getManager()
  if (!manager) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
  try {
    const [settingsResult, profilesResult, stepsResult, tagsResult, scoresResult, cyclesResult, clientsResult] = await Promise.all([
      supabaseAdmin.from('collection_settings').select('*').eq('organization_id', manager.organizationId).maybeSingle(),
      supabaseAdmin.from('collection_profiles').select('*').eq('organization_id', manager.organizationId).order('min_score', { ascending: false, nullsFirst: false }),
      supabaseAdmin.from('collection_profile_steps').select('*').order('sequence'),
      supabaseAdmin.from('client_tags').select('*').eq('organization_id', manager.organizationId).order('name'),
      supabaseAdmin.from('collection_scores').select('client_id, score, confidence, reason, calculated_at, clients(name)').eq('organization_id', manager.organizationId).order('score', { ascending: true }).limit(50),
      supabaseAdmin.from('billing_cycles').select('id, due_date, amount, status, clients(name)').eq('organization_id', manager.organizationId).in('status', ['open', 'overdue']).order('due_date').limit(50),
      supabaseAdmin.from('clients').select('id, name, plan_value, phone, phone_e164').eq('organization_id', manager.organizationId).in('status', ['active', 'vencido']).not('due_date', 'is', null),
    ])
    if (settingsResult.error || profilesResult.error || stepsResult.error || clientsResult.error) throw new Error(settingsResult.error?.message || profilesResult.error?.message || stepsResult.error?.message || clientsResult.error?.message)
    const enabled = Boolean(settingsResult.data?.enabled)
    const orchestration = {
      mode: enabled ? 'intelligent_with_fixed_recovery' : 'fixed_rules_only',
      precedence: 'intelligent_same_day',
      intelligent_alert_types: enabled ? ['before_due', 'on_due'] : [],
      fixed_alert_types: enabled ? ['after_due'] : ['before_due', 'on_due', 'after_due'],
    }
    const trackedClients = clientsResult.data || []
    const eligibility = {
      ...summarizeCollectionEligibility(trackedClients),
      ineligible: trackedClients.flatMap((client) => {
        const reasons = getCollectionIneligibilityReasons(client)
        return reasons.length > 0 ? [{ clientId: client.id, name: client.name, reasons }] : []
      }),
    }
    if (!settingsResult.data) {
      return NextResponse.json({ initialized: false, settings: null, profiles: [], tags: [], scores: [], cycles: [], orchestration, eligibility })
    }
    const profiles = profilesResult.data || []
    const stepsByProfile = new Map<string, unknown[]>()
    for (const step of stepsResult.data || []) {
      const existing = stepsByProfile.get(step.profile_id) || []
      existing.push(step)
      stepsByProfile.set(step.profile_id, existing)
    }
    const tags = tagsResult.data || []
    const tagCodeById = new Map(tags.map((tag) => [tag.id, tag.code]))
    const { data: assignments } = tags.length
      ? await supabaseAdmin.from('client_tag_assignments').select('client_id, tag_id').in('tag_id', tags.map((tag) => tag.id))
      : { data: [] }
    const tagsByClient = new Map<string, string[]>()
    for (const assignment of assignments || []) {
      const code = tagCodeById.get(assignment.tag_id)
      if (!code) continue
      tagsByClient.set(assignment.client_id, [...(tagsByClient.get(assignment.client_id) || []), code])
    }
    const scoreRows = scoresResult.data || []
    const preview = scoreRows.map((row: any) => ({
      ...row,
      tags: tagsByClient.get(row.client_id) || [],
      profile: resolveProfileCode(row.score, row.confidence, tagsByClient.get(row.client_id) || []),
      profile_source: tagsByClient.get(row.client_id)?.includes('vip')
        ? 'vip_override'
        : tagsByClient.get(row.client_id)?.includes('premium')
          ? 'premium_override'
          : row.confidence === 'high' ? 'score' : 'low_confidence_default',
    }))
    return NextResponse.json({
      initialized: true,
      settings: settingsResult.data,
      profiles: profiles.map((profile) => ({ ...profile, steps: stepsByProfile.get(profile.id) || [] })),
      tags, scores: preview, cycles: cyclesResult.data || [], orchestration, eligibility,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Falha ao carregar cobrança inteligente' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const manager = await getManager()
  if (!manager) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
  try {
    const body = await request.json()
    if (body.action === 'initialize') {
      await ensureIntelligentCollectionSetup(manager.organizationId)
      const prepared = await prepareIntelligentCollectionData(manager.organizationId)
      return NextResponse.json({ success: true, initialized: true, prepared })
    }
    await ensureIntelligentCollectionSetup(manager.organizationId)
    if (body.action === 'set_enabled') {
      if (typeof body.enabled !== 'boolean') return NextResponse.json({ error: 'Valor inválido' }, { status: 400 })
      const { error } = await supabaseAdmin.from('collection_settings').update({ enabled: body.enabled }).eq('organization_id', manager.organizationId)
      if (error) throw error
      return NextResponse.json({ success: true })
    }
    if (body.action === 'update_step') {
      const step = body.step
      if (!step || typeof step.id !== 'string' || !Number.isInteger(step.relative_day) || step.relative_day < -15 || step.relative_day > 30 || typeof step.message_template !== 'string' || step.message_template.trim().length === 0 || step.message_template.length > 1000 || !/^\d{2}:\d{2}$/.test(step.send_time || '')) {
        return NextResponse.json({ error: 'Etapa inválida' }, { status: 400 })
      }
      const { data: owned } = await supabaseAdmin.from('collection_profile_steps').select('id, profile_id').eq('id', step.id).maybeSingle()
      const { data: profile } = owned ? await supabaseAdmin.from('collection_profiles').select('organization_id').eq('id', owned.profile_id).maybeSingle() : { data: null }
      if (!owned || profile?.organization_id !== manager.organizationId) return NextResponse.json({ error: 'Etapa não encontrada' }, { status: 404 })
      const { error } = await supabaseAdmin.from('collection_profile_steps').update({ relative_day: step.relative_day, send_time: step.send_time, message_template: step.message_template.trim(), is_active: Boolean(step.is_active) }).eq('id', step.id)
      if (error) throw error
      return NextResponse.json({ success: true })
    }
    if (body.action === 'assign_tag') {
      if (typeof body.clientId !== 'string' || typeof body.tagCode !== 'string' || !['vip', 'premium'].includes(body.tagCode)) return NextResponse.json({ error: 'Etiqueta inválida' }, { status: 400 })
      const [{ data: client }, { data: tag }] = await Promise.all([
        supabaseAdmin.from('clients').select('id').eq('id', body.clientId).eq('organization_id', manager.organizationId).maybeSingle(),
        supabaseAdmin.from('client_tags').select('id').eq('organization_id', manager.organizationId).eq('code', body.tagCode).maybeSingle(),
      ])
      if (!client || !tag) return NextResponse.json({ error: 'Cliente ou etiqueta não encontrado' }, { status: 404 })
      const { data: overrideTags } = await supabaseAdmin.from('client_tags').select('id').eq('organization_id', manager.organizationId).in('code', ['vip', 'premium'])
      if (overrideTags?.length) await supabaseAdmin.from('client_tag_assignments').delete().eq('client_id', client.id).in('tag_id', overrideTags.map((item) => item.id))
      const { error } = await supabaseAdmin.from('client_tag_assignments').insert({ client_id: client.id, tag_id: tag.id, assigned_by: manager.user.id })
      if (error) throw error
      return NextResponse.json({ success: true })
    }
    return NextResponse.json({ error: 'Ação inválida' }, { status: 400 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Falha ao salvar cobrança inteligente' }, { status: 500 })
  }
}
