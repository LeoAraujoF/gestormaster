import 'server-only'

import { NextResponse } from 'next/server'
import { getTrustedAppUrl } from '@/lib/access-control'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/service-role'
import { getClientIp, rateLimit } from '@/lib/rate-limit'
import type { AdminCriticalAction } from '@/lib/admin-types'

export class AdminAccessError extends Error {
  constructor(public status: 401 | 403 | 409 | 429, public code: string, message: string) {
    super(message)
  }
}

export type MasterAdminSession = {
  userId: string
  email: string
  authTime: number
  sessionId: string | null
}

function getPasswordAuthTime(claims: Record<string, unknown>): number {
  const legacyAuthTime = Number(claims.auth_time || 0)
  const amr = Array.isArray(claims.amr) ? claims.amr : []
  const passwordAuthTimes = amr
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
    .filter((entry) => entry.method === 'password')
    .map((entry) => Number(entry.timestamp || 0))
    .filter((timestamp) => Number.isFinite(timestamp) && timestamp > 0)

  return Math.max(
    Number.isFinite(legacyAuthTime) && legacyAuthTime > 0 ? legacyAuthTime : 0,
    ...passwordAuthTimes,
  )
}

export async function requireMasterAdmin(options: { recentAuth?: boolean } = {}): Promise<MasterAdminSession> {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getClaims()
  const claims = data?.claims as Record<string, unknown> | undefined
  if (error || !claims?.sub || !claims.email) throw new AdminAccessError(401, 'ADMIN_UNAUTHENTICATED', 'Sessão necessária')

  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase()
  const email = String(claims.email).trim().toLowerCase()
  if (!adminEmail || email !== adminEmail) throw new AdminAccessError(403, 'ADMIN_FORBIDDEN', 'Acesso restrito')

  const authTime = getPasswordAuthTime(claims)
  const authAgeSeconds = Math.floor(Date.now() / 1000) - authTime
  if (options.recentAuth && (!authTime || authAgeSeconds < -60 || authAgeSeconds > 300)) {
    throw new AdminAccessError(403, 'ADMIN_REAUTH_REQUIRED', 'Confirme sua senha novamente')
  }

  return { userId: String(claims.sub), email, authTime, sessionId: claims.session_id ? String(claims.session_id) : null }
}

export async function protectAdminMutation(request: Request, options: { recentAuth?: boolean; limit?: number } = {}) {
  const origin = request.headers.get('origin')
  const expectedOrigin = getTrustedAppUrl()
  const fetchSite = request.headers.get('sec-fetch-site')
  if ((origin && origin !== expectedOrigin) || fetchSite === 'cross-site') {
    throw new AdminAccessError(403, 'ADMIN_ORIGIN_REJECTED', 'Origem não autorizada')
  }

  const admin = await requireMasterAdmin({ recentAuth: options.recentAuth })
  const rate = await rateLimit(`admin:${admin.userId}:${getClientIp(request)}`, options.limit || 30, 60, { failOpen: false })
  if (!rate.ok) throw new AdminAccessError(429, 'ADMIN_RATE_LIMITED', 'Muitas solicitações administrativas')
  return admin
}

export async function claimAdminAction(admin: MasterAdminSession, action: AdminCriticalAction, actionName: string) {
  const { data, error } = await supabaseAdmin.from('admin_action_idempotency').insert({
    idempotency_key: action.idempotencyKey,
    admin_user_id: admin.userId,
    action: actionName,
    status: 'processing',
  }).select('id').single()
  if (error?.code === '23505') throw new AdminAccessError(409, 'ADMIN_DUPLICATE_ACTION', 'Esta ação já foi processada')
  if (error || !data) throw new Error('Falha ao reservar ação administrativa')
  return data.id as string
}

export async function finishAdminAction(id: string, status: 'completed' | 'failed') {
  await supabaseAdmin.from('admin_action_idempotency').update({ status, completed_at: new Date().toISOString() }).eq('id', id)
}

export function adminErrorResponse(error: unknown) {
  if (error instanceof AdminAccessError) {
    return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status })
  }
  console.error('[Admin]', error)
  return NextResponse.json({ error: { code: 'ADMIN_INTERNAL_ERROR', message: 'Erro interno no servidor' } }, { status: 500 })
}
