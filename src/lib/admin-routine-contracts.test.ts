import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ADMIN_OPERATIONAL_ROUTINES,
  executeRoutineSafely,
  isAdminOperationalRoutineId,
} from './admin-routine-contracts'

test('catálogo operacional tem identificadores únicos', () => {
  const ids = ADMIN_OPERATIONAL_ROUTINES.map((routine) => routine.id)
  assert.equal(new Set(ids).size, ids.length)
  assert.equal(isAdminOperationalRoutineId('reconcile-pix'), true)
  assert.equal(isAdminOperationalRoutineId('process-queue'), false)
})

test('executor não expõe mensagem interna quando uma rotina falha', async () => {
  const result = await executeRoutineSafely('reconcile-pix', async () => {
    throw new Error('token secreto do provedor')
  })
  assert.equal(result.ok, false)
  assert.equal(result.summary, null)
})

test('executor limita o resumo operacional', async () => {
  const result = await executeRoutineSafely('capture-analytics', async () => 'a'.repeat(500))
  assert.equal(result.ok, true)
  assert.equal(result.summary?.length, 300)
})
