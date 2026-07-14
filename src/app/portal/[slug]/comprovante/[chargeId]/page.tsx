import { cookies, headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { PORTAL_COOKIE, resolvePortalSession } from '@/lib/client-portal-service'
import { supabaseAdmin } from '@/lib/supabase/service-role'

export default async function ReceiptPage({ params }: { params: Promise<{ slug: string; chargeId: string }> }) {
  const { slug, chargeId } = await params
  const session = await resolvePortalSession(slug, (await cookies()).get(PORTAL_COOKIE)?.value, (await headers()).get('user-agent'))
  if (!session) redirect(`/portal/${slug}`)
  const { data: charge } = await supabaseAdmin.from('pix_charges').select('id, amount, description, paid_at, provider_payment_id, status')
    .eq('id', chargeId).eq('organization_id', session.organizationId).eq('client_id', session.clientId).eq('status', 'paid').maybeSingle()
  if (!charge) notFound()
  return <main className="mx-auto max-w-xl p-8 text-slate-950"><div className="rounded-xl border p-8"><p className="text-sm text-slate-500">{session.settings.display_name}</p><h1 className="mt-2 text-2xl font-bold">Comprovante de pagamento</h1><dl className="mt-8 grid grid-cols-2 gap-4 text-sm"><dt>Cliente</dt><dd className="text-right font-medium">{session.client.name}</dd><dt>Valor</dt><dd className="text-right font-medium">{new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(charge.amount))}</dd><dt>Pagamento</dt><dd className="text-right">{charge.paid_at ? new Date(charge.paid_at).toLocaleString('pt-BR'):'—'}</dd><dt>Descrição</dt><dd className="text-right">{charge.description || 'Pagamento PIX'}</dd><dt>Referência</dt><dd className="break-all text-right font-mono text-xs">{charge.provider_payment_id || charge.id}</dd></dl><p className="mt-8 text-xs text-slate-500">Comprovante interno autenticado. Use a função de impressão do navegador para salvar ou imprimir.</p></div></main>
}
