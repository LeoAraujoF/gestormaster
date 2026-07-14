import assert from 'node:assert/strict'
import test from 'node:test'
import { isWithinPlanLimit, PLAN_RESOURCE_LIMITS } from './plan-types'

test('aplica os limites aprovados de clientes', () => {
  assert.equal(PLAN_RESOURCE_LIMITS.starter.clients, 100)
  assert.equal(PLAN_RESOURCE_LIMITS.pro.clients, 500)
  assert.equal(PLAN_RESOURCE_LIMITS.master.clients, null)
  assert.equal(isWithinPlanLimit(99, 1, PLAN_RESOURCE_LIMITS.starter.clients), true)
  assert.equal(isWithinPlanLimit(100, 1, PLAN_RESOURCE_LIMITS.starter.clients), false)
  assert.equal(isWithinPlanLimit(50_000, 1, PLAN_RESOURCE_LIMITS.master.clients), true)
})

test('aplica os limites aprovados de WhatsApp', () => {
  assert.deepEqual([
    PLAN_RESOURCE_LIMITS.starter.whatsappInstances,
    PLAN_RESOURCE_LIMITS.pro.whatsappInstances,
    PLAN_RESOURCE_LIMITS.master.whatsappInstances,
  ], [1, 2, 3])
})
