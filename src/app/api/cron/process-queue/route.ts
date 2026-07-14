import { NextResponse } from 'next/server'
import { isAuthorizedCron } from '@/lib/cron-auth'

/** @deprecated O BullMQ é o único processador autorizado para mensagens. */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({
    error: 'Esta rotina foi desativada. As mensagens são processadas exclusivamente pelo BullMQ.',
  }, { status: 410 })
}
