import assert from 'node:assert/strict'
import test from 'node:test'

import { isTrustedMutationOrigin } from '../src/lib/mutation-origin'

const productionRequest = {
  origin: 'https://www.lembrado.com.br',
  fetchSite: 'same-origin',
  requestUrl: 'http://gestor-app:3000/api/security/destructive-action',
  trustedAppUrl: 'https://lembrado.com.br',
  forwardedHost: 'www.lembrado.com.br',
  forwardedProto: 'https',
  allowHttp: false,
}

test('accepts the public origin forwarded by the reverse proxy', () => {
  assert.equal(isTrustedMutationOrigin(productionRequest), true)
})

test('accepts the configured canonical application origin', () => {
  assert.equal(isTrustedMutationOrigin({
    ...productionRequest,
    origin: 'https://lembrado.com.br',
    forwardedHost: null,
    forwardedProto: null,
  }), true)
})

test('rejects a cross-site mutation even when a forwarded host is present', () => {
  assert.equal(isTrustedMutationOrigin({
    ...productionRequest,
    origin: 'https://attacker.example',
    fetchSite: 'cross-site',
  }), false)
})

test('rejects an origin that does not match any trusted host', () => {
  assert.equal(isTrustedMutationOrigin({
    ...productionRequest,
    origin: 'https://attacker.example',
    fetchSite: null,
  }), false)
})

test('uses only the first value from forwarded proxy headers', () => {
  assert.equal(isTrustedMutationOrigin({
    ...productionRequest,
    forwardedHost: 'www.lembrado.com.br, gestor-app:3000',
    forwardedProto: 'https, http',
  }), true)
})
