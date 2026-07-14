import assert from 'node:assert/strict'
import test from 'node:test'
import { generatePortalCode, generatePortalToken, hashPortalCode, maskPhone, normalizePortalSlug, portalHash } from './client-portal-crypto'

process.env.PORTAL_AUTH_SECRET ||= 'portal-test-secret-with-more-than-32-characters'

test('gera OTP com seis dígitos e token forte', () => {
  assert.match(generatePortalCode(), /^\d{6}$/)
  assert.ok(generatePortalToken().length >= 43)
})

test('vincula o hash do OTP ao desafio', () => {
  assert.equal(hashPortalCode('a', '123456'), hashPortalCode('a', '123456'))
  assert.notEqual(hashPortalCode('a', '123456'), hashPortalCode('b', '123456'))
  assert.notEqual(hashPortalCode('a', '123456'), hashPortalCode('a', '654321'))
})

test('hash e máscara não expõem o valor original', () => {
  assert.match(portalHash('sensitive'), /^[a-f0-9]{64}$/)
  assert.equal(maskPhone('+5511999991234'), '+55 ** *****-1234')
})

test('normaliza slug público', () => {
  assert.equal(normalizePortalSlug(' Minha Organização 2.0 '), 'minha-organizacao-2-0')
})
