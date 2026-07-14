import 'server-only'

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { adminErrorResponse } from '@/lib/admin-security'

export function adminTicketErrorResponse(error: unknown) {
  if (error instanceof ZodError || error instanceof SyntaxError) {
    return NextResponse.json(
      { error: { code: 'ADMIN_TICKET_INVALID_INPUT', message: 'Dados do chamado inválidos' } },
      { status: 400 },
    )
  }

  return adminErrorResponse(error)
}

export function adminTicketNotFoundResponse() {
  return NextResponse.json(
    { error: { code: 'ADMIN_TICKET_NOT_FOUND', message: 'Chamado não encontrado' } },
    { status: 404 },
  )
}
