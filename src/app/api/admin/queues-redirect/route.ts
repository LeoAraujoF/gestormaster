import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const adminEmail = process.env.ADMIN_EMAIL || ''
    const isAdmin = user.email === adminEmail

    if (!isAdmin) {
      return NextResponse.json({ error: 'Acesso restrito ao Administrador.' }, { status: 403 })
    }

    const host = request.headers.get('host') || 'localhost'
    const isLocal = host.includes('localhost') || host.includes('127.0.0.1')
    
    // Monta a URL dinamicamente: se estiver local, usa porta 3001. Na nuvem, usa o subdomínio queue.
    const domain = host.split(':')[0].replace('www.', '') // remove porta e www se houver
    const protocol = request.headers.get('x-forwarded-proto') || 'http'
    
    const queuesUrl = process.env.NEXT_PUBLIC_QUEUES_URL || 
      (isLocal ? `http://localhost:3001/admin/queues` : `${protocol}://queue.${domain}/admin/queues`)
    
    return NextResponse.redirect(queuesUrl)
  } catch (error) {
    console.error('Redirect Error:', error)
    return NextResponse.json({ error: 'Falha ao redirecionar' }, { status: 500 })
  }
}
