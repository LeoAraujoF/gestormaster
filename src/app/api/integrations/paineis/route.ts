import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET all panels
export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const { data: panels, error } = await supabase
      .from('iptv_accounts')
      .select('id, provider, username, password, url, linked_service_id')
      .eq('user_id', user.id)

    if (error) throw error

    return NextResponse.json({ success: true, panels })
  } catch (error: any) {
    console.error('Panels GET Error:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

// CREATE new panel
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const body = await request.json()
    const { provider, username, password, url, linked_service_id } = body

    if (!provider || !username || !password) {
      return NextResponse.json({ error: 'Preencha provedor, usuário e senha.' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('iptv_accounts')
      .insert({
        user_id: user.id,
        provider,
        username,
        password,
        url: url || null,
        linked_service_id: linked_service_id || null
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, panel: data })
  } catch (error: any) {
    console.error('Panels POST Error:', error)
    return NextResponse.json({ error: 'Erro ao salvar' }, { status: 500 })
  }
}

// UPDATE existing panel
export async function PUT(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const body = await request.json()
    const { id, provider, username, password, url, linked_service_id } = body

    if (!id) return NextResponse.json({ error: 'ID obrigatório.' }, { status: 400 })

    const { data, error } = await supabase
      .from('iptv_accounts')
      .update({
        provider,
        username,
        password,
        url: url || null,
        linked_service_id: linked_service_id || null
      })
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, panel: data })
  } catch (error: any) {
    console.error('Panels PUT Error:', error)
    return NextResponse.json({ error: 'Erro ao atualizar' }, { status: 500 })
  }
}

// DELETE panel
export async function DELETE(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) return NextResponse.json({ error: 'ID obrigatório.' }, { status: 400 })

    const { error } = await supabase
      .from('iptv_accounts')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Panels DELETE Error:', error)
    return NextResponse.json({ error: 'Erro ao deletar' }, { status: 500 })
  }
}
