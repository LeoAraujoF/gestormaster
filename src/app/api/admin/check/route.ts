import { NextResponse } from 'next/server'
import { adminErrorResponse, requireMasterAdmin } from '@/lib/admin-security'

export async function GET() {
  try { await requireMasterAdmin(); return NextResponse.json({ isAdmin: true }) }
  catch (error) { return adminErrorResponse(error) }
}
