import 'server-only'

import { randomBytes, scrypt as nodeScrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

import { supabaseAdmin } from '@/lib/supabase/service-role'

const scrypt = promisify(nodeScrypt)
const PIN_PATTERN = /^\d{4}$/
const PIN_KEY_LENGTH = 64
const MAX_ATTEMPTS = 3

type CredentialRow = {
  pin_digest: string
  pin_salt: string
  locked_until: string | null
}

type AttemptRow = {
  verified: boolean
  result_locked_until: string | null
  remaining_attempts: number
}

export type SecurityPinStatus = {
  configured: boolean
  lockedUntil: string | null
}

export type SecurityPinVerification =
  | { ok: true }
  | {
      ok: false
      code: 'PIN_NOT_CONFIGURED' | 'PIN_INVALID' | 'PIN_LOCKED' | 'PIN_CONFIGURATION_UNAVAILABLE'
      lockedUntil?: string
      remainingAttempts?: number
    }

function getPinPepper() {
  const pepper = process.env.PIN_PEPPER?.trim()
  if (!pepper || pepper.length < 32) {
    throw new Error('PIN_PEPPER_MISSING')
  }
  return pepper
}

async function derivePinDigest(pin: string, salt: string) {
  const pepper = getPinPepper()
  const derived = (await scrypt(pin, `${salt}:${pepper}`, PIN_KEY_LENGTH)) as Buffer
  return derived
}

function credentialLockedUntil(row: Pick<CredentialRow, 'locked_until'>) {
  if (!row.locked_until) return null
  return new Date(row.locked_until).getTime() > Date.now() ? row.locked_until : null
}

async function recordAttempt(userId: string, success: boolean): Promise<AttemptRow> {
  const { data, error } = await supabaseAdmin.rpc('record_security_pin_attempt', {
    p_user_id: userId,
    p_success: success,
  })
  if (error) throw error

  const row = (Array.isArray(data) ? data[0] : data) as AttemptRow | null
  return row || {
    verified: false,
    result_locked_until: null,
    remaining_attempts: 0,
  }
}

export function isValidSecurityPin(pin: string) {
  return PIN_PATTERN.test(pin)
}

export async function getSecurityPinStatus(userId: string): Promise<SecurityPinStatus> {
  const { data, error } = await supabaseAdmin
    .from('user_security_credentials')
    .select('locked_until')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  if (!data) return { configured: false, lockedUntil: null }

  return {
    configured: true,
    lockedUntil: credentialLockedUntil(data),
  }
}

export async function saveSecurityPin(userId: string, pin: string) {
  if (!isValidSecurityPin(pin)) throw new Error('PIN_FORMAT_INVALID')

  const salt = randomBytes(24).toString('base64url')
  const digest = await derivePinDigest(pin, salt)
  const now = new Date().toISOString()
  const { error } = await supabaseAdmin
    .from('user_security_credentials')
    .upsert({
      user_id: userId,
      pin_digest: digest.toString('base64url'),
      pin_salt: salt,
      failed_attempts: 0,
      locked_until: null,
      updated_at: now,
    }, { onConflict: 'user_id' })

  if (error) throw error
}

export async function verifySecurityPin(
  userId: string,
  pin: string
): Promise<SecurityPinVerification> {
  let pepperAvailable = true
  try {
    getPinPepper()
  } catch {
    pepperAvailable = false
  }
  if (!pepperAvailable) {
    return { ok: false, code: 'PIN_CONFIGURATION_UNAVAILABLE' }
  }

  const { data, error } = await supabaseAdmin
    .from('user_security_credentials')
    .select('pin_digest, pin_salt, locked_until')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  if (!data) return { ok: false, code: 'PIN_NOT_CONFIGURED' }

  const lockedUntil = credentialLockedUntil(data as CredentialRow)
  if (lockedUntil) {
    return { ok: false, code: 'PIN_LOCKED', lockedUntil }
  }

  let matches = false
  if (isValidSecurityPin(pin)) {
    const candidate = await derivePinDigest(pin, data.pin_salt)
    const stored = Buffer.from(data.pin_digest, 'base64url')
    matches = stored.length === candidate.length && timingSafeEqual(stored, candidate)
  }

  const attempt = await recordAttempt(userId, matches)
  if (matches && attempt.verified) return { ok: true }

  if (attempt.result_locked_until) {
    return {
      ok: false,
      code: 'PIN_LOCKED',
      lockedUntil: attempt.result_locked_until,
    }
  }

  return {
    ok: false,
    code: 'PIN_INVALID',
    remainingAttempts: Math.max(0, Math.min(MAX_ATTEMPTS, attempt.remaining_attempts)),
  }
}
