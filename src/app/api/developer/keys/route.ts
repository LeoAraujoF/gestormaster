import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import crypto from 'crypto'

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const orgId = user.user_metadata?.organization_id

    const { data: keys, error } = await supabase
      .from('api_keys')
      .select('id, name, created_at, last_used_at')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })

    if (error) {
      if (error.code === '42P01') {
        return NextResponse.json({ success: true, keys: [], missingTable: true })
      }
      throw error
    }

    return NextResponse.json({ success: true, keys: keys || [] })

  } catch (error: any) {
    console.error('API Keys GET Error:', error)
    return NextResponse.json({ error: 'Erro interno no servidor' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const orgId = user.user_metadata?.organization_id
    const { name } = await request.json()

    // Generate plain token
    const randomHex = crypto.randomBytes(24).toString('hex')
    const plainToken = `gm_live_${randomHex}`
    
    // Create Hash
    const hash = crypto.createHash('sha256').update(plainToken).digest('hex')

    const { data, error } = await supabase
      .from('api_keys')
      .insert({
        organization_id: orgId,
        key_hash: hash,
        name: name || 'API Key Padrão',
      })
      .select('id, name, created_at')
      .single()

    if (error) {
      if (error.code === '42P01') {
        return NextResponse.json({ error: 'Tabela api_keys não existe.' }, { status: 400 })
      }
      throw error
    }

    // Only return the plainToken ONCE
    return NextResponse.json({ 
      success: true, 
      key: { ...data, plainToken } 
    })

  } catch (error: any) {
    console.error('API Keys POST Error:', error)
    return NextResponse.json({ error: 'Erro interno no servidor' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const orgId = user.user_metadata?.organization_id

    const { error } = await supabase
      .from('api_keys')
      .delete()
      .eq('id', id)
      .eq('organization_id', orgId)

    if (error) throw error

    return NextResponse.json({ success: true })

  } catch (error: any) {
    return NextResponse.json({ error: 'Erro interno no servidor' }, { status: 500 })
  }
}
