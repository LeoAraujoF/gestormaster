import assert from 'node:assert/strict'
import test from 'node:test'
import { accountDeletionBlockReason, normalizeAccountDeletionLimit } from './account-deletion-policy'

test('exige transferência antes de excluir qualquer proprietário', () => {
  assert.equal(accountDeletionBlockReason([{ organizationId: 'org-1', role: 'owner' }]), 'OWNER_TRANSFER_REQUIRED')
  assert.equal(accountDeletionBlockReason([{ organizationId: 'org-1', role: 'admin' }]), null)
  assert.equal(accountDeletionBlockReason([]), null)
})

test('limita cada lote de purga a cinquenta contas', () => {
  assert.equal(normalizeAccountDeletionLimit(0), 1)
  assert.equal(normalizeAccountDeletionLimit(25), 25)
  assert.equal(normalizeAccountDeletionLimit(500), 50)
})
