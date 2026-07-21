export const DEFAULT_MERCADO_PAGO_PAYER_EMAIL = 'pagamentos@lembrado.com.br'

interface BuildMercadoPagoPixPayloadInput {
  amount: number
  description: string | null
  expiresAt: string
  externalReference: string
  notificationUrl: string
  chargeId: string
  payerEmail?: string | null
}

export function buildMercadoPagoPixPayload(input: BuildMercadoPagoPixPayloadInput) {
  const payerEmail = input.payerEmail?.trim().toLowerCase() || DEFAULT_MERCADO_PAGO_PAYER_EMAIL

  return {
    transaction_amount: input.amount,
    description: input.description,
    payment_method_id: 'pix',
    payer: {
      email: payerEmail,
    },
    date_of_expiration: input.expiresAt,
    external_reference: input.externalReference,
    notification_url: input.notificationUrl,
    metadata: { charge_id: input.chargeId },
  }
}
