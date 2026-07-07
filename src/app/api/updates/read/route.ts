import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Pega todas as atualizações publicadas
    const { data: updates } = await supabase
      .from('system_updates')
      .select('id')
      .eq('is_published', true)

    if (updates && updates.length > 0) {
      const reads = updates.map(u => ({ user_id: user.id, update_id: u.id }))
      
      // Insere no banco (ignora conflitos caso já lido)
      const { error } = await supabase
        .from('user_update_reads')
        .upsert(reads, { onConflict: 'user_id,update_id' })
        
      if (error) {
        console.error("Erro ao marcar como lido:", error)
        return NextResponse.json({ error: 'Database error' }, { status: 500 })
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Erro na API read updates:", error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
