import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/service-role'

/**
 * GET /api/pix/charges
 * Lista histórico de cobranças PIX + métricas (Fase 1).
 * Query: ?status=pending|paid&limit=50&metrics=1
 */
export async function GET(req: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const url = new URL(req.url)
    const status = url.searchParams.get('status')
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10) || 50))
    const withMetrics = url.searchParams.get('metrics') !== '0'
    const clientId = url.searchParams.get('client_id')

    let query = supabase
      .from('pix_charges')
      .select(
        'id, organization_id, user_id, client_id, provider, provider_payment_id, purpose, status, amount, description, phone, instance_name, months_to_renew, plan_name, expires_at, paid_at, payment_id, created_at, updated_at'
      )
      .order('created_at', { ascending: false })
      .limit(limit)

    if (status) query = query.eq('status', status)
    if (clientId) query = query.eq('client_id', clientId)

    const { data: charges, error } = await query

    if (error) {
      // Tabela ainda não migrada
      if (error.message?.includes('pix_charges') || error.code === '42P01') {
        return NextResponse.json({
          charges: [],
          metrics: emptyMetrics(),
          migration_required: true,
          message: 'Execute supabase/pix_charges.sql no Supabase para habilitar o ledger PIX.',
        })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    let metrics = emptyMetrics()
    if (withMetrics) {
      const { data: rpcData, error: rpcErr } = await supabase.rpc('get_pix_charge_metrics')
      if (!rpcErr && rpcData) {
        metrics = normalizeMetrics(rpcData)
      } else {
        // Fallback em JS se a RPC ainda não existir
        metrics = computeMetricsLocal(user.id)
        // tenta via admin se RLS ok
        const { data: all } = await supabaseAdmin
          .from('pix_charges')
          .select('status, amount, paid_at, expires_at')
          .eq('user_id', user.id)

        if (all) metrics = computeMetricsFromRows(all)
      }
    }

    return NextResponse.json({ charges: charges || [], metrics })
  } catch (e: any) {
    console.error('[pix/charges]', e)
    return NextResponse.json({ error: e.message || 'Erro interno' }, { status: 500 })
  }
}

function emptyMetrics() {
  return {
    pending_count: 0,
    pending_amount: 0,
    paid_today_count: 0,
    paid_today_amount: 0,
    paid_month_count: 0,
    paid_month_amount: 0,
  }
}

function normalizeMetrics(raw: any) {
  if (!raw || typeof raw !== 'object') return emptyMetrics()
  return {
    pending_count: Number(raw.pending_count || 0),
    pending_amount: Number(raw.pending_amount || 0),
    paid_today_count: Number(raw.paid_today_count || 0),
    paid_today_amount: Number(raw.paid_today_amount || 0),
    paid_month_count: Number(raw.paid_month_count || 0),
    paid_month_amount: Number(raw.paid_month_amount || 0),
  }
}

function computeMetricsFromRows(
  rows: Array<{ status: string; amount: number; paid_at: string | null; expires_at: string | null }>
) {
  const now = new Date()
  const spToday = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
  const todayStr = spToday.toISOString().slice(0, 10)
  const monthPrefix = todayStr.slice(0, 7)

  let pending_count = 0
  let pending_amount = 0
  let paid_today_count = 0
  let paid_today_amount = 0
  let paid_month_count = 0
  let paid_month_amount = 0

  for (const r of rows) {
    const amount = Number(r.amount || 0)
    if (r.status === 'pending') {
      if (!r.expires_at || new Date(r.expires_at) > now) {
        pending_count++
        pending_amount += amount
      }
    }
    if (r.status === 'paid' && r.paid_at) {
      const paidLocal = new Date(r.paid_at).toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })
      const paidDate = new Date(paidLocal)
      const paidStr = paidDate.toISOString().slice(0, 10)
      if (paidStr === todayStr) {
        paid_today_count++
        paid_today_amount += amount
      }
      if (paidStr.startsWith(monthPrefix)) {
        paid_month_count++
        paid_month_amount += amount
      }
    }
  }

  return {
    pending_count,
    pending_amount,
    paid_today_count,
    paid_today_amount,
    paid_month_count,
    paid_month_amount,
  }
}

function computeMetricsLocal(_userId: string) {
  return emptyMetrics()
}
