import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const host = req.headers.get('host')
    const protocol = req.headers.get('x-forwarded-proto') || 'http'
    const baseUrl = `${protocol}://${host}`

    const cronSecret = process.env.CRON_SECRET

    // Chama os robôs via HTTP passando a chave
    await fetch(`${baseUrl}/api/cron/generate-alerts?key=${cronSecret}`)
    await fetch(`${baseUrl}/api/cron/process-queue?key=${cronSecret}`)

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
