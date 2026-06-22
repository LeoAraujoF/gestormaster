import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/service-role'
import { redisConnection } from '@/lib/redis'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    // Basic permissions check (se necessário, extrairia do header ou cookies,
    // mas por ser uma dashboard de admin assumimos que a página /master já barra a navegação.
    // Aqui fazemos um ping rápido).
    
    // 1. Check Supabase (PostgreSQL)
    const dbStartTime = Date.now()
    let dbStatus = 'offline'
    try {
      const { data, error } = await supabaseAdmin.from('clients').select('id').limit(1)
      if (!error) dbStatus = 'online'
    } catch (e) {}
    const dbLatency = Date.now() - dbStartTime

    // 2. Check Redis
    const redisStartTime = Date.now()
    let redisStatus = 'offline'
    try {
      const pingPromise = redisConnection.ping()
      const timeoutPromise = new Promise<string>((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000))
      const ping = await Promise.race([pingPromise, timeoutPromise])
      if (ping === 'PONG') redisStatus = 'online'
    } catch (e) {}
    const redisLatency = Date.now() - redisStartTime

    // 3. Check Evolution API (Global)
    const evoUrl = process.env.EVOLUTION_API_URL?.replace(/\/$/, '') || 'http://localhost:8080'
    const evoStartTime = Date.now()
    let evoStatus = 'offline'
    try {
      // Usando timeout curto para não travar o painel se a Evolution estiver totalmente congelada
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 3000)
      
      const res = await fetch(`${evoUrl}/`, { 
        method: 'GET',
        signal: controller.signal
      }).catch(() => null)
      
      clearTimeout(timeoutId)
      
      // Evolution base URL can return 404 for root, but if it responds anything, it's UP.
      if (res) evoStatus = 'online'
    } catch (e) {}
    const evoLatency = Date.now() - evoStartTime

    // 4. Server Metrics
    const memoryUsage = process.memoryUsage()
    const memoryMb = Math.round(memoryUsage.rss / 1024 / 1024)
    const uptimeSecs = Math.round(process.uptime())
    
    // Format Uptime
    const d = Math.floor(uptimeSecs / (3600 * 24))
    const h = Math.floor((uptimeSecs % (3600 * 24)) / 3600)
    const m = Math.floor((uptimeSecs % 3600) / 60)
    
    let uptimeFormatted = ''
    if (d > 0) uptimeFormatted += `${d}d `
    if (h > 0) uptimeFormatted += `${h}h `
    uptimeFormatted += `${m}m`

    return NextResponse.json({
      success: true,
      services: {
        database: {
          status: dbStatus,
          latency: dbLatency
        },
        redis: {
          status: redisStatus,
          latency: redisLatency
        },
        evolution: {
          status: evoStatus,
          latency: evoLatency,
          url: evoUrl
        },
        server: {
          memoryMb,
          uptime: uptimeFormatted || '< 1m'
        }
      }
    })

  } catch (error: any) {
    return NextResponse.json({ error: 'Erro interno no servidor' }, { status: 500 })
  }
}
