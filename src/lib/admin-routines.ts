import 'server-only'

import { captureAnalyticsSnapshots } from '@/lib/analytics-service'
import {
  executeRoutineSafely,
  type AdminOperationalRoutineResult,
} from '@/lib/admin-routine-contracts'
import { releaseDeferredContacts } from '@/lib/contact-coordination'
import { scheduleIntelligenceRuns } from '@/lib/intelligence-service'
import { scheduleIntelligentCollections } from '@/lib/intelligent-collections'
import { reconcilePendingPixCharges } from '@/lib/pix-charges'

export async function executeAdminOperationalRoutines(now = new Date()): Promise<AdminOperationalRoutineResult[]> {
  const results: AdminOperationalRoutineResult[] = []

  results.push(await executeRoutineSafely('reconcile-pix', async () => {
    const result = await reconcilePendingPixCharges(100)
    return `${result.checked} cobrança(s) consultada(s); ${result.finalized} pagamento(s) finalizado(s).`
  }))

  results.push(await executeRoutineSafely('schedule-intelligent-collections', async () => {
    const queued = await scheduleIntelligentCollections(now)
    return `${queued} despacho(s) inteligente(s) enfileirado(s).`
  }))

  results.push(await executeRoutineSafely('release-deferred-contacts', async () => {
    const queued = await releaseDeferredContacts(now)
    return `${queued} contato(s) adiado(s) liberado(s).`
  }))

  results.push(await executeRoutineSafely('recover-intelligence', async () => {
    const queued = await scheduleIntelligenceRuns(now)
    return `${queued} execução(ões) Intelligence criada(s) ou recuperada(s).`
  }))

  results.push(await executeRoutineSafely('capture-analytics', async () => {
    const result = await captureAnalyticsSnapshots(now)
    return `${result.captured} snapshot(s) e ${result.forecasts} projeção(ões) persistidos.`
  }))

  return results
}
