import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/service-role'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user || user.email !== process.env.ADMIN_EMAIL) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    // Get all instances with their owners' emails
    const { data: instancesData, error: instancesError } = await supabaseAdmin
      .from('evolution_instances')
      .select('*')
      .order('created_at', { ascending: false })
      
    if (instancesError) throw instancesError

    // We also need the user emails. We can fetch users and map them.
    const { data: usersData } = await supabaseAdmin.auth.admin.listUsers()
    const usersMap = new Map()
    if (usersData && usersData.users) {
      usersData.users.forEach(u => {
        usersMap.set(u.id, u.email)
      })
    }

    const enrichedInstances = instancesData.map(inst => ({
      ...inst,
      user_email: usersMap.get(inst.user_id) || 'Desconhecido'
    }))

    return NextResponse.json({ instances: enrichedInstances })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
