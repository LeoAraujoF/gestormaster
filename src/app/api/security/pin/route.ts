import { NextResponse } from 'next/server'
import { z } from 'zod'

import { getOrganizationMembership } from '@/lib/access-control'
import { getIpFromRequest, logAudit } from '@/lib/audit'
import { isTrustedMutation } from '@/lib/client-portal-route'
import { rateLimit } from '@/lib/rate-limit'
import {
  getSecurityPinStatus,
  isValidSecurityPin,
  saveSecurityPin,
  verifySecurityPin,
} from '@/lib/security-pin'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const updatePinSchema = z.object({
  currentPin: z.string().optional(),
  newPin: z.string(),
}).strict()

function noStore(data: unknown, init?: ResponseInit) {
  const response = NextResponse.json(data, init)
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}

function verificationError(result: Exclude<Awaited<ReturnType<typeof verifySecurityPin>>, { ok: true }>) {
  if (result.code === 'PIN_LOCKED') {
    return noStore({
      error: 'PIN bloqueado após três tentativas. Aguarde 15 minutos.',
      code: result.code,
      lockedUntil: result.lockedUntil,
    }, { status: 423 })
  }
  if (result.code === 'PIN_CONFIGURATION_UNAVAILABLE') {
    return noStore({
      error: 'Proteção por PIN indisponível. Verifique a configuração do servidor.',
      code: result.code,
    }, { status: 503 })
  }
  return noStore({
    error: result.code === 'PIN_NOT_CONFIGURED'
      ? 'Configure um novo PIN de segurança.'
      : 'PIN atual incorreto.',
    code: result.code,
    remainingAttempts: result.remainingAttempts,
  }, { status: result.code === 'PIN_NOT_CONFIGURED' ? 409 : 401 })
}

async function authenticatedUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return { supabase, user }
}

export async function GET() {
  try {
    const { user } = await authenticatedUser()
    if (!user) return noStore({ error: 'Não autenticado.' }, { status: 401 })

    return noStore(await getSecurityPinStatus(user.id))
  } catch (error) {
    console.error('[Security PIN] Falha ao consultar status:', error)
    return noStore({ error: 'Não foi possível consultar o PIN de segurança.' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  if (!isTrustedMutation(request)) {
    return noStore({ error: 'Origem da solicitação não autorizada.' }, { status: 403 })
  }

  try {
    const { supabase, user } = await authenticatedUser()
    if (!user) return noStore({ error: 'Não autenticado.' }, { status: 401 })

    const limited = await rateLimit(`security-pin:update:${user.id}:${getIpFromRequest(request)}`, 10, 900)
    if (!limited.ok) {
      return noStore({ error: 'Muitas tentativas. Aguarde antes de tentar novamente.' }, { status: 429 })
    }

    const parsed = updatePinSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success || !isValidSecurityPin(parsed.data.newPin)) {
      return noStore({ error: 'O novo PIN deve conter exatamente quatro dígitos.', code: 'PIN_FORMAT_INVALID' }, { status: 400 })
    }

    const status = await getSecurityPinStatus(user.id)
    if (status.configured) {
      if (!parsed.data.currentPin) {
        return noStore({ error: 'Informe o PIN atual.', code: 'CURRENT_PIN_REQUIRED' }, { status: 400 })
      }
      if (parsed.data.currentPin === parsed.data.newPin) {
        return noStore({ error: 'Escolha um novo PIN diferente do atual.', code: 'PIN_REUSE_NOT_ALLOWED' }, { status: 400 })
      }
      const verification = await verifySecurityPin(user.id, parsed.data.currentPin)
      if (!verification.ok) {
        const membership = await getOrganizationMembership(supabase, user.id)
        await logAudit({
          organization_id: membership?.organizationId,
          user_id: user.id,
          action: 'security.pin.update',
          resource: 'user_security_credentials',
          resource_id: user.id,
          outcome: 'failure',
          reason: verification.code,
          ip_address: getIpFromRequest(request),
        })
        return verificationError(verification)
      }
    }

    await saveSecurityPin(user.id, parsed.data.newPin)
    const membership = await getOrganizationMembership(supabase, user.id)
    await logAudit({
      organization_id: membership?.organizationId,
      user_id: user.id,
      action: status.configured ? 'security.pin.updated' : 'security.pin.created',
      resource: 'user_security_credentials',
      resource_id: user.id,
      ip_address: getIpFromRequest(request),
    })

    return noStore({ success: true, configured: true })
  } catch (error) {
    console.error('[Security PIN] Falha ao salvar PIN:', error)
    const unavailable = error instanceof Error && error.message === 'PIN_PEPPER_MISSING'
    return noStore({
      error: unavailable
        ? 'Proteção por PIN indisponível. Configure PIN_PEPPER no servidor.'
        : 'Não foi possível salvar o PIN de segurança.',
      code: unavailable ? 'PIN_CONFIGURATION_UNAVAILABLE' : 'PIN_SAVE_FAILED',
    }, { status: unavailable ? 503 : 500 })
  }
}
