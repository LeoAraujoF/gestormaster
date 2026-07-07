import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isAuthorizedCron } from '@/lib/cron-auth'

// This route uses the service_role key to bypass RLS since it's a server cron job
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // Needs service_role key to act globally
)

export async function GET(req: Request) {
  try {
    // 1. Security Check (header Bearer da Vercel Cron ou ?key= legado)
    if (!isAuthorizedCron(req)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 2. Fetch all active automations that are NOT 'renewal' or 'promotion'
    const { data: automations, error: autoErr } = await supabase
      .from('automations')
      .select('*')
      .eq('is_active', true)
      .in('alert_type', ['before_due', 'on_due', 'after_due'])

    if (autoErr || !automations) {
      throw new Error("Failed to fetch automations")
    }

    let queuedCount = 0

    const userMetaCache: Record<string, any> = {}

    // 3. Process each automation rule
    for (const rule of automations) {
      if (!userMetaCache[rule.user_id]) {
        const { data: { user } } = await supabase.auth.admin.getUserById(rule.user_id)
        userMetaCache[rule.user_id] = user?.user_metadata || {}
      }
      const userMeta = userMetaCache[rule.user_id]
      const tzOffsetStr = userMeta.timezone || "-03:00"

      const nowUtc = new Date()
      const sign = tzOffsetStr.startsWith('-') ? -1 : 1
      const [hh, mm] = tzOffsetStr.replace(/[+-]/, '').split(':').map(Number)
      const offsetMs = sign * ((hh * 3600) + (mm * 60)) * 1000

      const localNow = new Date(nowUtc.getTime() + offsetMs)
      const todayStrLocal = localNow.toISOString().split('T')[0]

      const todayLocalObj = new Date(`${todayStrLocal}T12:00:00Z`)
      const targetDate = new Date(todayLocalObj)
      
      let offset = 0;
      if (rule.alert_type === 'before_due') {
        offset = Math.abs(rule.days_offset);
      } else if (rule.alert_type === 'after_due') {
        offset = -Math.abs(rule.days_offset);
      }
      
      targetDate.setDate(todayLocalObj.getDate() + offset)
      const targetDateStr = targetDate.toISOString().split('T')[0]

      // Fetch all active/vencido clients for this user whose due_date matches the target date
      const { data: clients } = await supabase
        .from('clients')
        .select('id')
        .eq('user_id', rule.user_id)
        .in('status', ['active', 'vencido'])
        .eq('due_date', targetDateStr)

      if (!clients || clients.length === 0) continue

      // For each matching client, check if an alert was already created today
      for (const client of clients) {
        const { data: existingAlerts } = await supabase
          .from('alert_history')
          .select('id')
          .eq('client_id', client.id)
          .eq('automation_id', rule.id)
          .gte('created_at', todayStrLocal + 'T00:00:00Z')
          .lte('created_at', todayStrLocal + 'T23:59:59Z')

        if (existingAlerts && existingAlerts.length > 0) {
          continue // Already generated today
        }

        // Calculate scheduled_at timestamp in UTC
        const sendTime = rule.send_time || '09:00:00'
        const scheduledLocalObj = new Date(`${todayStrLocal}T${sendTime}Z`)
        const scheduledUtc = new Date(scheduledLocalObj.getTime() - offsetMs)

        // Insert into queue
        const { error: insertErr } = await supabase
          .from('alert_history')
          .insert({
            user_id: rule.user_id,
            client_id: client.id,
            automation_id: rule.id,
            status: 'pending',
            scheduled_at: scheduledUtc.toISOString()
          })

        if (!insertErr) {
          queuedCount++
        }
      }
    }

    return NextResponse.json({ 
      success: true, 
      message: `Generated ${queuedCount} alerts in the queue.` 
    })

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
