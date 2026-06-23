import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { logAudit, getIpFromRequest } from '@/lib/audit'

export async function POST(req: Request) {
  try {
    // 1. Validar Admin via Header/Token (Simplificado para o momento)
    // Precisamos do Service Role Key para usar a API de Admin do Supabase
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: 'Supabase Service Role Key não configurada no .env' }, { status: 500 })
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    const body = await req.json()
    const { email, password, name, plan, paymentStatus, phone } = body

    if (!email || !password || !name) {
      return NextResponse.json({ error: 'Email, senha e nome são obrigatórios' }, { status: 400 })
    }

    // Calcular validade padrão (30 dias)
    const dueDate = new Date()
    dueDate.setDate(dueDate.getDate() + 30)

    // 2. Criar usuário no Auth
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      phone: phone || undefined,
      user_metadata: {
        full_name: name,
        plan_name: plan || 'Free',
        payment_status: paymentStatus || 'Ativo',
        is_admin: false,
        due_date: dueDate.toISOString(),
        phone: phone || ''
      }
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    // 3. Disparo de Boas-Vindas Assíncrono (Simulado para depois conectar no Z-API)
    if (phone) {
      // Usar a rota de billing que preparamos para enviar via WhatsApp
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
      fetch(`${siteUrl}/api/admin/billing/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: data.user.id, method: 'whatsapp', type: 'welcome', password })
      }).catch(err => console.error("Falha ao agendar boas-vindas:", err))
    }

    await logAudit({
      user_id: null,
      action: 'admin.create_user',
      resource: 'users',
      resource_id: data.user.id,
      details: { email, plan: plan || 'Free' },
      ip_address: getIpFromRequest(req)
    })

    return NextResponse.json({ success: true, user: data.user })
  } catch (error: any) {
    console.error("Erro interno ao criar usuário:", error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
