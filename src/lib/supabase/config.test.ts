import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveSupabasePublicConfig } from './config'

test('prioriza a chave publicável e mantém compatibilidade com anon', () => {
  assert.deepEqual(resolveSupabasePublicConfig({
    url: 'https://project.supabase.co',
    publishableKey: 'sb_publishable_current',
    anonKey: 'legacy-anon',
  }), {
    url: 'https://project.supabase.co',
    key: 'sb_publishable_current',
  })

  assert.equal(resolveSupabasePublicConfig({
    url: 'https://project.supabase.co',
    anonKey: 'legacy-anon',
  })?.key, 'legacy-anon')
})

test('recusa configuração incompleta ou URL insegura', () => {
  assert.equal(resolveSupabasePublicConfig({ url: 'https://project.supabase.co' }), null)
  assert.equal(resolveSupabasePublicConfig({ anonKey: 'legacy-anon' }), null)
  assert.equal(resolveSupabasePublicConfig({ url: 'http://example.com', anonKey: 'legacy-anon' }), null)
})
