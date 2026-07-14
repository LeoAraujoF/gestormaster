import { NextResponse } from 'next/server'
import { isAuthorizedCron } from '@/lib/cron-auth'
import { reconcilePendingPixCharges } from '@/lib/pix-charges'

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    return NextResponse.json({ success: true, ...(await reconcilePendingPixCharges()) })
  } catch {
    return NextResponse.json({ error: 'Falha ao reconciliar cobranças PIX' }, { status: 500 })
  }
}
