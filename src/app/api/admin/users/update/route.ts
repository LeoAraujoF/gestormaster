import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { logAudit, getIpFromRequest } from '@/lib/audit'

export async function POST(req: Request) {
  try {
    const { createClient: createServerClient } = require('@/lib/supabase/server');
    const supabaseUser = await createServerClient();
    const { data: { user } } = await supabaseUser.auth.getUser();

    // Admin é definido apenas pelo e-mail do servidor (ADMIN_EMAIL). NÃO confiar em
    // user_metadata.is_admin, que o próprio usuário consegue editar pelo navegador.
    const isAdm = user && user.email === process.env.ADMIN_EMAIL;
    if (!isAdm) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 403 });
    }

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
    const { userId, plan, paymentStatus, dueDate, phone } = body

    if (!userId) {
      return NextResponse.json({ error: 'ID do usuário é obrigatório' }, { status: 400 })
    }

    // Busca o usuário alvo para preservar as chaves existentes de app_metadata (provider/providers)
    const { data: targetData, error: targetErr } = await supabaseAdmin.auth.admin.getUserById(userId)
    if (targetErr || !targetData?.user) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 })
    }

    // 1. Atualizar o metadata no Supabase Auth.
    // payment_status é campo de autorização -> vai em app_metadata (só o servidor grava).
    const updatePayload: any = {
      app_metadata: {
        ...targetData.user.app_metadata,
        payment_status: paymentStatus
      },
      user_metadata: {
        ...targetData.user.user_metadata,
        plan_name: plan,
        due_date: dueDate,
        phone: phone || ''
      }
    }
    
    // Se o telefone foi passado, tenta atualizar a raiz também (pode falhar se o formato não for E.164, então deixamos no metadata como garantido)
    if (phone) {
      updatePayload.phone = phone
    }

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      updatePayload
    )

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 })
    }

    await logAudit({
      user_id: null,
      action: 'admin.update_user',
      resource: 'users',
      resource_id: userId,
      details: { plan, paymentStatus, dueDate, phone },
      ip_address: getIpFromRequest(req)
    })

    return NextResponse.json({ success: true, user: authData.user })
  } catch (error: any) {
    console.error("Erro interno ao atualizar usuário:", error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
