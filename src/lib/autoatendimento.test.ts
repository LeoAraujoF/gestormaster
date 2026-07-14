import assert from 'node:assert/strict'
import test from 'node:test'
import {
  generateVerificationCode,
  normalizeBrazilPhone,
  parseDueDate,
  verifyCode,
} from './autoatendimento'

test('normaliza telefone brasileiro para E.164', () => {
  assert.equal(normalizeBrazilPhone('(11) 99999-9999'), '+5511999999999')
  assert.equal(normalizeBrazilPhone('5511999999999'), '+5511999999999')
  assert.equal(normalizeBrazilPhone('123'), null)
})

test('aceita somente data futura válida dentro de 90 dias', () => {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const valid = `${String(tomorrow.getDate()).padStart(2, '0')}/${String(tomorrow.getMonth() + 1).padStart(2, '0')}/${tomorrow.getFullYear()}`
  assert.match(parseDueDate(valid) || '', /^\d{4}-\d{2}-\d{2}$/)
  assert.equal(parseDueDate('31/02/2026'), null)
  assert.equal(parseDueDate('2026-12-01'), null)
})

test('valida código de telefone somente quando o hash confere', () => {
  const code = generateVerificationCode()
  assert.equal(verifyCode(code.plain, code.hash), true)
  assert.equal(verifyCode('000000', code.hash), false)
})
