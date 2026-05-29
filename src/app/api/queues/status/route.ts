import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { messageQueue } from '@/lib/queue'
import { supabaseAdmin } from '@/lib/supabase/service-role'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()

    if (!session) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const userId = session.user.id

    // 1. Busca Jobs Pendentes/Ativos no BullMQ
    // Pegamos todos os jobs nessas states (pode ser pesado em escala gigante, mas atende agora)
    const bullJobs = await messageQueue.getJobs(['waiting', 'active', 'delayed'])
    
    // Filtra apenas os jobs desse usuário
    const userJobs = bullJobs.filter(j => j.data.userId === userId)
    
    let waitingCount = 0;
    let activeCount = 0;
    let delayedCount = 0;

    for (const j of userJobs) {
      const state = await j.getState();
      if (state === 'waiting') waitingCount++;
      if (state === 'active') activeCount++;
      if (state === 'delayed') delayedCount++;
    }

    // Mapeia alguns pendentes para exibir (máximo 10)
    const pendingList = userJobs.slice(0, 10).map(j => ({
      id: j.id,
      phone: j.data.phone,
      state: 'waiting', // simplificação
      added_at: new Date(j.timestamp).toISOString()
    }))

    // 2. Busca Histórico Recente de Sucesso (alert_history)
    const { data: sentHistory, error: sentError } = await supabaseAdmin
      .from('alert_history')
      .select('id, phone, status, error_message, created_at')
      .eq('organization_id', session.user.user_metadata?.organization_id || userId)
      .eq('status', 'sent')
      .order('created_at', { ascending: false })
      .limit(10)

    // 3. Busca Histórico Recente de Falhas
    const { data: errorHistory, error: errHistError } = await supabaseAdmin
      .from('alert_history')
      .select('id, phone, status, error_message, created_at')
      .eq('organization_id', session.user.user_metadata?.organization_id || userId)
      .eq('status', 'error')
      .order('created_at', { ascending: false })
      .limit(10)

    return NextResponse.json({ 
      success: true,
      metrics: {
        waiting: waitingCount + delayedCount,
        active: activeCount
      },
      pendingList,
      sentHistory: sentHistory || [],
      errorHistory: errorHistory || []
    })

  } catch (error: any) {
    console.error('API Queue Status Error:', error)
    return NextResponse.json({ error: 'Erro interno no servidor' }, { status: 500 })
  }
}
