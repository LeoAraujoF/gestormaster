import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/service-role'
import { createClient } from '@/lib/supabase/server'
import { SecretsManager } from '@/lib/encryption'

async function isAdmin(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  // Admin apenas por e-mail (server-side). Não confiar em user_metadata.is_admin (editável pelo usuário).
  const isAdm = user.email === (process.env.ADMIN_EMAIL || 'leandro.araujoferreira@gmail.com')
  return isAdm ? user : null
}

// GET — Retorna as configurações de segurança (secret descriptografado)
export async function GET(request: Request) {
  const user = await isAdmin(request)
  if (!user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
  }

  const { data, error } = await supabaseAdmin
    .from('security_settings')
    .select('*')
    .limit(1)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Configuração não encontrada' }, { status: 404 })
  }

  // Descriptografar o secret para exibir ao admin
  let decryptedSecret = data.hmac_secret
  try {
    decryptedSecret = SecretsManager.decrypt(data.hmac_secret)
  } catch {
    // Se não está criptografado ainda (ex: placeholder inicial), exibe como está
  }

  return NextResponse.json({
    id: data.id,
    hmac_secret: decryptedSecret,
    require_signature: data.require_signature,
    rotated_at: data.rotated_at,
    created_at: data.created_at,
    updated_at: data.updated_at
  })
}

// PUT — Atualiza configurações (require_signature toggle)
export async function PUT(request: Request) {
  const user = await isAdmin(request)
  if (!user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
  }

  const body = await request.json()
  const { require_signature } = body

  if (typeof require_signature !== 'boolean') {
    return NextResponse.json({ error: 'require_signature deve ser boolean' }, { status: 400 })
  }

  const { data: settings } = await supabaseAdmin
    .from('security_settings')
    .select('id')
    .limit(1)
    .single()

  if (!settings) {
    return NextResponse.json({ error: 'Configuração não encontrada' }, { status: 404 })
  }

  const { error } = await supabaseAdmin
    .from('security_settings')
    .update({ require_signature, updated_at: new Date().toISOString() })
    .eq('id', settings.id)

  if (error) {
    return NextResponse.json({ error: 'Erro ao salvar' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
