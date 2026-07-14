import '../lib/env'
import { Job, Worker } from 'bullmq'
import { INTELLIGENCE_QUEUE_NAME } from '../lib/queue'
import { redisConnection } from '../lib/redis'
import { logger } from '../lib/logger'
import { finalizeFailedIntelligenceRun, processIntelligenceRun } from '../lib/intelligence-service'
import { supabaseAdmin } from '../lib/supabase/service-role'
import { startOperationalHeartbeat } from '../lib/operational-heartbeat'

startOperationalHeartbeat('intelligence_worker')

const worker = new Worker(INTELLIGENCE_QUEUE_NAME, async (job: Job) => {
  const runId = job.data?.intelligence_run_id
  if (typeof runId !== 'string' || !/^[0-9a-f-]{36}$/i.test(runId)) throw new Error('intelligence_run_id inválido')
  const { data: run } = await supabaseAdmin.from('intelligence_runs').select('organization_id').eq('id', runId).maybeSingle()
  const result = await processIntelligenceRun(runId)
  if (run?.organization_id) {
    await supabaseAdmin.from('intelligence_operational_heartbeats').upsert({
      organization_id: run.organization_id,
      component: 'ai_worker',
      status: 'healthy',
      metrics: { last_run_id: runId },
      last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'organization_id,component' })
  }
  return result
}, { connection: redisConnection as any, concurrency: 2 })

worker.on('failed', async (job, error) => {
  if (!job) return
  logger.error(`[Intelligence ${job.id}] Falhou: ${error.message}`)
  const attempts = Number(job.opts.attempts || 1)
  if (job.attemptsMade >= attempts) await finalizeFailedIntelligenceRun(String(job.data?.intelligence_run_id || ''))
})

worker.on('error', (error) => logger.error(`[Intelligence Worker] ${error.message}`))

export default worker
