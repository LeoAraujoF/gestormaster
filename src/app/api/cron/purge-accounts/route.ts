import { NextResponse } from 'next/server'
import { purgeDueAccountDeletions } from '@/lib/account-deletion'
import { isAuthorizedCron } from '@/lib/cron-auth'

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    return NextResponse.json({ data: await purgeDueAccountDeletions(25), meta: {} })
  } catch {
    return NextResponse.json({ error: 'Falha ao processar retenções de conta' }, { status: 500 })
  }
}
