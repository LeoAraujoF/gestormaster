import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { subMonths, startOfMonth, endOfMonth, isWithinInterval, format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const userId = session.user.id

    // 1. Busca Clientes
    const { data: clients, error: clientsError } = await supabase
      .from('clients')
      .select('id, status, plan_value, due_date, created_at, updated_at')
      .eq('user_id', userId)

    if (clientsError) throw clientsError

    // 2. Busca Pagamentos (Renovações)
    const { data: payments, error: paymentsError } = await supabase
      .from('payments')
      .select('id, amount_paid, created_at')
      .eq('user_id', userId)
      .gt('amount_paid', 0) // Consideramos apenas pagamentos reais como renovação

    if (paymentsError) throw paymentsError

    const now = new Date()
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    const startOfCurrentMonth = startOfMonth(now)
    
    // Métricas Atuais (Cards)
    let mrr = 0
    let totalActive = 0
    let lostRevenue = 0
    let totalInactive = 0
    let expiringSoon = 0
    let churnedThisMonth = 0
    let activeStartOfMonth = 0

    clients?.forEach(c => {
      const value = c.plan_value || 0
      
      if (c.status === 'active') {
        mrr += value
        totalActive++
        
        // Vencimentos Próximos
        if (c.due_date) {
          const dueDate = new Date(c.due_date)
          if (dueDate >= now && dueDate <= sevenDaysFromNow) {
            expiringSoon++
          }
        }
      } else {
        lostRevenue += value
        totalInactive++
        
        // Churn do Mês Atual (Desativados recentemente ou vencidos recentemente e inativos)
        const updated = new Date(c.updated_at)
        if (updated >= startOfCurrentMonth) {
          churnedThisMonth++
        }
      }
      
      // Estima ativos no início do mês: 
      // Se foi criado antes do mês atual, e (está ativo ou churnou neste mês)
      const created = new Date(c.created_at)
      if (created < startOfCurrentMonth) {
         if (c.status === 'active' || (c.status !== 'active' && new Date(c.updated_at) >= startOfCurrentMonth)) {
            activeStartOfMonth++
         }
      }
    })

    const ticketMedio = totalActive > 0 ? mrr / totalActive : 0
    const churnRate = activeStartOfMonth > 0 ? (churnedThisMonth / activeStartOfMonth) * 100 : 0

    // Chart Data (Últimos 6 meses)
    const chartData = []
    
    for (let i = 5; i >= 0; i--) {
      const monthDate = subMonths(now, i)
      const start = startOfMonth(monthDate)
      const end = endOfMonth(monthDate)
      const monthName = format(monthDate, 'MMM', { locale: ptBR }).toUpperCase()

      // Ativações (Clientes criados neste mês)
      const ativacoes = clients?.filter(c => isWithinInterval(new Date(c.created_at), { start, end })).length || 0

      // Renovações (Pagamentos feitos neste mês)
      const renovacoes = payments?.filter(p => isWithinInterval(new Date(p.created_at), { start, end })).length || 0

      // Vencidos (Churn no mês: inativos cujo due_date caiu neste mês)
      // Como não temos um log exato de quando ele churnou, usamos o due_date para inativos.
      const vencidos = clients?.filter(c => 
        c.status !== 'active' && 
        c.due_date && 
        isWithinInterval(new Date(c.due_date), { start, end })
      ).length || 0

      chartData.push({
        name: monthName,
        Ativações: ativacoes,
        Renovações: renovacoes,
        Vencidos: vencidos
      })
    }

    return NextResponse.json({
      success: true,
      metrics: {
        mrr,
        ticketMedio,
        expiringSoon,
        totalInactive,
        lostRevenue,
        churnRate: parseFloat(churnRate.toFixed(2))
      },
      chartData
    })

  } catch (error: any) {
    console.error('API Client Metrics Error:', error)
    return NextResponse.json({ error: 'Erro interno no servidor' }, { status: 500 })
  }
}
