import { cookies, headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { getPublicPortalBrand, PORTAL_COOKIE, resolvePortalSession } from '@/lib/client-portal-service'
import { PortalPublicView } from './portal-public-view'

export default async function PortalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const brand = await getPublicPortalBrand(slug)
  if (!brand) notFound()
  const session = await resolvePortalSession(slug, (await cookies()).get(PORTAL_COOKIE)?.value, (await headers()).get('user-agent'))
  return <PortalPublicView slug={slug} brand={brand} initiallyAuthenticated={Boolean(session)} />
}
