import { NextResponse } from 'next/server'
import { z } from 'zod'

import {
  csvCell,
  decodeAuditCursor,
  encodeAuditCursor,
  redactAuditText,
  redactAuditValue,
  type AuditCursor,
} from './audit-utils'
import { getIpFromRequest, logAudit } from '@/lib/audit'
import { adminCriticalActionSchema } from '@/lib/admin-types'
import {
  adminErrorResponse,
  claimAdminAction,
  finishAdminAction,
  protectAdminMutation,
  requireMasterAdmin,
} from '@/lib/admin-security'
import { supabaseAdmin } from '@/lib/supabase/service-role'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 50
const MAX_PAGE_SIZE = 100
const MAX_EXPORT_ROWS = 5_000
const MAX_EXPORT_PERIOD_MS = 31 * 24 * 60 * 60 * 1_000
const NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  Pragma: 'no-cache',
  'X-Content-Type-Options': 'nosniff',
}

const actionSchema = z.string().trim().min(1).max(160).regex(/^[\p{L}\p{N}_.:-]+$/u)
const filtersSchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  action: actionSchema.optional(),
  outcome: z.enum(['success', 'failure']).optional(),
  correlationId: z.string().uuid().optional(),
}).superRefine((filters, context) => {
  if (filters.from && filters.to && Date.parse(filters.from) > Date.parse(filters.to)) {
    context.addIssue({ code: 'custom', message: 'Período inválido', path: ['to'] })
  }
})

const querySchema = filtersSchema.and(z.object({
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(PAGE_SIZE),
  cursor: z.string().max(512).optional(),
}))

const exportSchema = adminCriticalActionSchema.extend({
  filters: filtersSchema,
})

type AuditFilters = z.infer<typeof filtersSchema>
type AuditRow = {
  id: string
  user_id: string | null
  action: string
  resource: string
  resource_id: string | null
  details: unknown
  ip_address: string | null
  correlation_id: string | null
  outcome: 'success' | 'failure'
  reason: string | null
  created_at: string
}

class AuditDataError extends Error {
  constructor(public code: string) {
    super('Audit data unavailable')
  }
}

class AuditExportLimitError extends Error {}

function parseFilters(searchParams: URLSearchParams) {
  return querySchema.safeParse({
    from: searchParams.get('from') || undefined,
    to: searchParams.get('to') || undefined,
    action: searchParams.get('action') || undefined,
    outcome: searchParams.get('outcome') || undefined,
    correlationId: searchParams.get('correlationId') || undefined,
    limit: searchParams.get('limit') || PAGE_SIZE,
    cursor: searchParams.get('cursor') || undefined,
  })
}

function databaseError(code?: string) {
  if (code === '42P01' || code === '42703' || code === '42501' || code === 'PGRST205') {
    return new AuditDataError('ADMIN_AUDIT_UNAVAILABLE')
  }
  return new AuditDataError('ADMIN_AUDIT_QUERY_FAILED')
}

async function selectAuditRows(
  filters: AuditFilters,
  options: { limit: number; cursor?: AuditCursor },
): Promise<AuditRow[]> {
  let query = supabaseAdmin
    .from('audit_logs')
    .select('id,user_id,action,resource,resource_id,details,ip_address,correlation_id,outcome,reason,created_at')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(options.limit)

  if (filters.from) query = query.gte('created_at', filters.from)
  if (filters.to) query = query.lte('created_at', filters.to)
  if (filters.action) query = query.eq('action', filters.action)
  if (filters.outcome) query = query.eq('outcome', filters.outcome)
  if (filters.correlationId) query = query.eq('correlation_id', filters.correlationId)
  if (options.cursor) {
    const { createdAt, id } = options.cursor
    query = query.or(`created_at.lt.${createdAt},and(created_at.eq.${createdAt},id.lt.${id})`)
  }

  const { data, error } = await query
  if (error) throw databaseError(error.code)
  return (data || []) as AuditRow[]
}

async function getActorEmails(rows: AuditRow[]) {
  const userIds = [...new Set(rows.map((row) => row.user_id).filter((id): id is string => Boolean(id)))]
  const entries = await Promise.all(userIds.map(async (userId) => {
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId)
    return [userId, error ? null : data.user?.email || null] as const
  }))
  return Object.fromEntries(entries) as Record<string, string | null>
}

function toAuditDto(row: AuditRow, actorEmail: string | null = null) {
  return {
    id: row.id,
    action: row.action,
    resource: row.resource,
    resourceId: row.resource_id,
    details: redactAuditValue(row.details),
    ipAddress: row.ip_address,
    correlationId: row.correlation_id,
    outcome: row.outcome === 'failure' ? 'failure' as const : 'success' as const,
    reason: row.reason ? redactAuditText(row.reason) : null,
    createdAt: row.created_at,
    actor: row.user_id ? { id: row.user_id, email: actorEmail } : null,
  }
}

function invalidRequest(message = 'Filtros inválidos') {
  return NextResponse.json(
    { error: { code: 'ADMIN_INVALID_INPUT', message } },
    { status: 400, headers: NO_STORE_HEADERS },
  )
}

function auditDataErrorResponse(error: AuditDataError) {
  const unavailable = error.code === 'ADMIN_AUDIT_UNAVAILABLE'
  return NextResponse.json(
    {
      error: {
        code: error.code,
        message: unavailable
          ? 'A auditoria está indisponível. Verifique a configuração segura do banco.'
          : 'Não foi possível consultar a auditoria.',
      },
    },
    { status: unavailable ? 503 : 500, headers: NO_STORE_HEADERS },
  )
}

function createCsv(rows: AuditRow[]) {
  const header = ['data_hora', 'resultado', 'acao', 'recurso', 'recurso_id', 'ator_id', 'ip', 'correlation_id', 'motivo', 'detalhes_redigidos']
  const body = rows.map((row) => {
    const dto = toAuditDto(row)
    return [
      dto.createdAt,
      dto.outcome,
      dto.action,
      dto.resource,
      dto.resourceId,
      dto.actor?.id,
      dto.ipAddress,
      dto.correlationId,
      dto.reason,
      dto.details === null ? '' : JSON.stringify(dto.details),
    ].map(csvCell).join(',')
  })
  return `\uFEFF${[header.map(csvCell).join(','), ...body].join('\r\n')}`
}

export async function GET(request: Request) {
  try {
    await requireMasterAdmin()

    const parsed = parseFilters(new URL(request.url).searchParams)
    if (!parsed.success) return invalidRequest()

    const cursor = parsed.data.cursor ? decodeAuditCursor(parsed.data.cursor) ?? undefined : undefined
    if (parsed.data.cursor && !cursor) return invalidRequest('Cursor inválido')

    const { limit } = parsed.data
    const filters: AuditFilters = {
      from: parsed.data.from,
      to: parsed.data.to,
      action: parsed.data.action,
      outcome: parsed.data.outcome,
      correlationId: parsed.data.correlationId,
    }
    const rows = await selectAuditRows(filters, { limit: limit + 1, cursor })
    const page = rows.slice(0, limit)
    const actorEmails = await getActorEmails(page)
    const lastRow = page.at(-1)
    const nextCursor = rows.length > limit && lastRow
      ? encodeAuditCursor({ createdAt: lastRow.created_at, id: lastRow.id })
      : null

    return NextResponse.json(
      {
        data: page.map((row) => toAuditDto(row, row.user_id ? actorEmails[row.user_id] || null : null)),
        meta: { nextCursor, pageSize: limit },
      },
      { headers: NO_STORE_HEADERS },
    )
  } catch (error) {
    if (error instanceof AuditDataError) return auditDataErrorResponse(error)
    return adminErrorResponse(error)
  }
}

export async function POST(request: Request) {
  let claimId: string | null = null
  let admin: Awaited<ReturnType<typeof protectAdminMutation>> | null = null
  let input: z.infer<typeof exportSchema> | null = null

  try {
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
      return invalidRequest('Content-Type inválido')
    }
    const contentLength = Number(request.headers.get('content-length') || 0)
    if (contentLength > 16_384) return invalidRequest('Corpo da requisição muito grande')

    const parsed = exportSchema.safeParse(await request.json())
    if (!parsed.success) return invalidRequest('Dados da exportação inválidos')
    input = parsed.data
    if (input.confirmation !== 'EXPORTAR AUDITORIA') return invalidRequest('Confirmação inválida')
    if (!input.filters.from || !input.filters.to) return invalidRequest('Informe o início e o fim do período')
    if (Date.parse(input.filters.to) - Date.parse(input.filters.from) > MAX_EXPORT_PERIOD_MS) {
      return invalidRequest('O período máximo para exportação é de 31 dias')
    }

    admin = await protectAdminMutation(request, { recentAuth: true, limit: 5 })
    claimId = await claimAdminAction(admin, input, 'admin.audit.export')

    const rows = await selectAuditRows(input.filters, { limit: MAX_EXPORT_ROWS + 1 })
    if (rows.length > MAX_EXPORT_ROWS) throw new AuditExportLimitError()

    const csv = createCsv(rows)
    await finishAdminAction(claimId, 'completed')
    await logAudit({
      user_id: admin.userId,
      action: 'admin.audit.export',
      resource: 'audit_logs',
      details: {
        from: input.filters.from,
        to: input.filters.to,
        action: input.filters.action || null,
        outcome: input.filters.outcome || null,
        correlation_filter_applied: Boolean(input.filters.correlationId),
        exported_rows: rows.length,
      },
      reason: input.reason,
      correlation_id: input.idempotencyKey,
      outcome: 'success',
      ip_address: getIpFromRequest(request),
    })

    const date = new Date().toISOString().slice(0, 10)
    return new Response(csv, {
      status: 200,
      headers: {
        ...NO_STORE_HEADERS,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="auditoria-${date}.csv"`,
      },
    })
  } catch (error) {
    if (claimId) await finishAdminAction(claimId, 'failed')
    if (admin && input) {
      await logAudit({
        user_id: admin.userId,
        action: 'admin.audit.export',
        resource: 'audit_logs',
        details: {
          from: input.filters.from || null,
          to: input.filters.to || null,
          action: input.filters.action || null,
          outcome: input.filters.outcome || null,
          correlation_filter_applied: Boolean(input.filters.correlationId),
        },
        reason: input.reason,
        correlation_id: input.idempotencyKey,
        outcome: 'failure',
        ip_address: getIpFromRequest(request),
      })
    }
    if (error instanceof AuditExportLimitError) {
      return NextResponse.json(
        { error: { code: 'ADMIN_AUDIT_EXPORT_TOO_LARGE', message: 'A exportação excede 5.000 registros. Reduza o período ou aplique mais filtros.' } },
        { status: 413, headers: NO_STORE_HEADERS },
      )
    }
    if (error instanceof AuditDataError) return auditDataErrorResponse(error)
    return adminErrorResponse(error)
  }
}
