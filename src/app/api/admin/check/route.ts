import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const adminEmail = process.env.ADMIN_EMAIL || ''
    const isAdmin = user.email === adminEmail

    return NextResponse.json({ isAdmin })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
