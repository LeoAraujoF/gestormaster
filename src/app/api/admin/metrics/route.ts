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

    // 1. Get Total Users (Inquilinos)
    const { data: usersData, error: usersError } = await supabaseAdmin.auth.admin.listUsers()
    if (usersError) throw usersError
    
    const totalUsers = usersData.users.length
    
    // 2. Get Global Clients & MRR
    const { data: clientsData, error: clientsError } = await supabaseAdmin
      .from('clients')
      .select('status, plan_value')
      
    if (clientsError) throw clientsError
    
    let totalMRR = 0
    let totalActiveClients = 0
    
    clientsData.forEach(c => {
      if (c.status === 'active') {
        totalActiveClients++
        totalMRR += Number(c.plan_value || 0)
      }
    })
    
    // 3. Get WhatsApp Instances Count
    const { count: instancesCount, error: instancesError } = await supabaseAdmin
      .from('evolution_instances')
      .select('*', { count: 'exact', head: true })
      
    if (instancesError) throw instancesError

    // 4. Get Total Messages Sent this month
    const currentMonth = new Date()
    currentMonth.setDate(1)
    currentMonth.setHours(0,0,0,0)
    
    const { count: messagesCount, error: messagesError } = await supabaseAdmin
      .from('alert_history')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'sent')
      .gte('created_at', currentMonth.toISOString())
      
    if (messagesError) throw messagesError

    return NextResponse.json({ 
      totalUsers,
      totalMRR,
      totalActiveClients,
      totalInstances: instancesCount || 0,
      totalMessagesMonth: messagesCount || 0
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
