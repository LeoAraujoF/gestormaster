import { NextResponse } from 'next/server'
import { adminErrorResponse, requireMasterAdmin } from '@/lib/admin-security'

/**
 * O fluxo antigo misturava credenciais provisórias, PIX simulado e cobranças
 * avulsas. Assinaturas SaaS agora são criadas somente pelo Checkout oficial.
 */
export async function POST() {
  try {
    await requireMasterAdmin()
    return NextResponse.json(
      {
        error: {
          code: 'ADMIN_LEGACY_BILLING_RETIRED',
          message: 'Este fluxo foi desativado. Use a assinatura oficial da Stripe.',
        },
      },
      { status: 410 },
    )
  } catch (error) {
    return adminErrorResponse(error)
  }
}
