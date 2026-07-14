import { NextResponse } from 'next/server'
import { requireMasterAdmin, adminErrorResponse } from '@/lib/admin-security'

const privateResponse = { 'Cache-Control': 'private, no-store, max-age=0' }

function retiredResponse() {
  return NextResponse.json(
    { error: { code: 'ADMIN_APIKEYS_RETIRED', message: 'Rota descontinuada. Use /api/developer/keys.' } },
    { status: 410, headers: privateResponse },
  )
}

// Rota antiga removida: ela persistia API keys em texto puro. Use
// /api/developer/keys, que armazena somente o hash da chave.
export async function POST() {
  try { await requireMasterAdmin(); return retiredResponse() }
  catch (error) { return adminErrorResponse(error) }
}

export async function DELETE() {
  try { await requireMasterAdmin(); return retiredResponse() }
  catch (error) { return adminErrorResponse(error) }
}
