import { NextResponse } from 'next/server'
import { isAuthorizedCron } from '@/lib/cron-auth'

/** @deprecated O scheduler coordenado substituiu a geração legada de alertas. */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({
    error: 'Esta rotina foi desativada. Use o scheduler coordenado.',
  }, { status: 410 })
}
