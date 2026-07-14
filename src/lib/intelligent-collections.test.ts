import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveProfileCode } from './collection-score'
import { dispatchFailureStatus } from './collection-dispatch'

test('seleciona perfil pelo score somente quando há histórico confiável', () => {
  assert.equal(resolveProfileCode(95, 'high', []), 'excellent')
  assert.equal(resolveProfileCode(55, 'high', []), 'attention')
  assert.equal(resolveProfileCode(10, 'low', []), 'regular')
})

test('etiquetas VIP e Premium têm precedência sobre o score', () => {
  assert.equal(resolveProfileCode(10, 'high', ['vip']), 'vip')
  assert.equal(resolveProfileCode(95, 'high', ['premium']), 'premium')
})

test('falha temporária só vira definitiva após a última tentativa', () => {
  assert.equal(dispatchFailureStatus(0, 3), 'retryable')
  assert.equal(dispatchFailureStatus(1, 3), 'retryable')
  assert.equal(dispatchFailureStatus(2, 3), 'failed')
})
