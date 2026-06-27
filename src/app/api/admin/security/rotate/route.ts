import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { supabaseAdmin } from '@/lib/supabase/service-role'
import { createClient } from '@/lib/supabase/server'
import { SecretsManager } from '@/lib/encryption'

async function isAdmin(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const isAdm = user.user_metadata?.is_admin === true || user.email === 'leandro.araujoferreira@gmail.com'
  return isAdm ? user : null
}

// POST — Gera e salva um novo HMAC secret criptografado
export async function POST(request: Request) {
  const user = await isAdmin(request)
  if (!user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
  }

  // Gerar secret criptograficamente seguro
  const rawSecret = `whsec_${crypto.randomBytes(32).toString('hex')}`
  
  let encryptedSecret: string
  try {
    // Criptografar antes de salvar no banco
    encryptedSecret = SecretsManager.encrypt(rawSecret)
  } catch (err: any) {
    console.error('Erro de criptografia:', err.message)
    return NextResponse.json({ 
      error: 'Erro de criptografia: Verifique se a variável ENCRYPTION_KEY está configurada no servidor (mínimo 32 caracteres).' 
    }, { status: 500 })
  }

  const { data: settings, error: fetchError } = await supabaseAdmin
    .from('security_settings')
    .select('id')
    .limit(1)
    .single()

  if (!settings) {
    console.error('Erro ao buscar configuração:', fetchError)
    return NextResponse.json({ error: 'Configuração não encontrada' }, { status: 404 })
  }

  const { error } = await supabaseAdmin
    .from('security_settings')
    .update({
      hmac_secret: encryptedSecret,
      rotated_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', settings.id)

  if (error) {
    console.error('Erro ao rotacionar secret:', error)
    return NextResponse.json({ error: 'Erro ao rotacionar secret' }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    hmac_secret: rawSecret,
    rotated_at: new Date().toISOString()
  })
}
