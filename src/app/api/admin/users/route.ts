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

    // 1. Get Users
    const { data: usersData, error: usersError } = await supabaseAdmin.auth.admin.listUsers()
    if (usersError) throw usersError
    
    // 2. Get Global Clients to aggregate MRR
    const { data: clientsData } = await supabaseAdmin.from('clients').select('user_id, status, plan_value')
    
    // 3. Get Instances
    const { data: instancesData } = await supabaseAdmin.from('evolution_instances').select('user_id, status, connection_mode')
    
    // 4. Get Alert History (Sent this month)
    const currentMonth = new Date()
    currentMonth.setDate(1)
    currentMonth.setHours(0,0,0,0)
    
    // To avoid fetching too much data, we only select user_id
    const { data: messagesData } = await supabaseAdmin
      .from('alert_history')
      .select('user_id')
      .eq('status', 'sent')
      .gte('created_at', currentMonth.toISOString())
    
    const enrichedUsers = usersData.users.map(u => {
      let mrr = 0
      let activeClients = 0
      
      if (clientsData) {
        const userClients = clientsData.filter(c => c.user_id === u.id)
        userClients.forEach(c => {
          if (c.status === 'active') {
            activeClients++
            mrr += Number(c.plan_value || 0)
          }
        })
      }
      
      let instancesCount = 0
      let connectedInstances = 0
      
      if (instancesData) {
        const userInstances = instancesData.filter(i => i.user_id === u.id)
        instancesCount = userInstances.length
        connectedInstances = userInstances.filter(i => i.status === 'connected').length
      }

      let messagesMonth = 0
      if (messagesData) {
        messagesMonth = messagesData.filter(m => m.user_id === u.id).length
      }

      return {
        id: u.id,
        email: u.email,
        name: u.user_metadata?.full_name || 'Sem Nome',
        plan: u.user_metadata?.plan_name || 'Free',
        is_banned: !!u.banned_until,
        created_at: u.created_at,
        last_sign_in: u.last_sign_in_at,
        stats: {
          mrr,
          activeClients,
          instancesCount,
          connectedInstances,
          messagesMonth
        }
      }
    })

    return NextResponse.json({ users: enrichedUsers })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
