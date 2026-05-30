import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/service-role'
import { redisConnection } from '@/lib/redis'

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user || user.email !== process.env.ADMIN_EMAIL) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const { userId, isBlocked } = await req.json()
    if (!userId) {
      return NextResponse.json({ error: 'User ID é obrigatório' }, { status: 400 })
    }

    // Block or unblock using Supabase ban_duration
    const banDuration = isBlocked ? '87600h' : 'none'

    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      ban_duration: banDuration
    })

    if (error) throw error

    // Sincroniza com o Redis (Kill Switch ultra rápido para o Backend/Worker)
    if (isBlocked) {
      await redisConnection.sadd('global:banned_users', userId)
    } else {
      await redisConnection.srem('global:banned_users', userId)
    }

    return NextResponse.json({ success: true, message: isBlocked ? 'Usuário bloqueado' : 'Usuário desbloqueado' })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
