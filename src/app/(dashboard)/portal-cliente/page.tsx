import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PortalManagerView } from './portal-manager-view'

export default async function ClientPortalManagerPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return <PortalManagerView />
}
