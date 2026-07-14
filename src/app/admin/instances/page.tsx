import type { Metadata } from 'next'

import { InstancesFleet } from './instances-fleet'

export const metadata: Metadata = {
  title: 'Instâncias WhatsApp | Admin Master',
}
export default function AdminInstancesPage() {
  return <InstancesFleet />
}
