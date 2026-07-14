import assert from 'node:assert/strict'
import test from 'node:test'

import {
  csvCell,
  decodeAuditCursor,
  encodeAuditCursor,
  redactAuditText,
  redactAuditValue,
} from './audit-utils'

test('redacts sensitive keys recursively without exposing their values', () => {
  const result = redactAuditValue({
    status: 'completed',
    credentials: { apiKey: 'visible-only-to-the-test', password: 'short-secret' },
    nested: [{ authorization: 'Bearer abc.def.ghi' }],
  })

  assert.deepEqual(result, {
    status: 'completed',
    credentials: '[REDACTED]',
    nested: [{ authorization: '[REDACTED]' }],
  })
})

test('redacts known secret shapes, query parameters, and high-entropy values', () => {
  assert.equal(redactAuditText('Bearer abcdefghijklmnop'), '[REDACTED]')
  assert.equal(redactAuditText('https://example.test/callback?token=top-secret&mode=safe'), 'https://example.test/callback?token=[REDACTED]&mode=safe')
  assert.equal(redactAuditText('Abcdefghijklmnopqrstuvwxyz123456'), '[REDACTED]')
})

test('preserves UUIDs used by audit correlation', () => {
  const uuid = '6d7b7fd1-e51f-4b1d-b921-e70760105bb2'
  assert.equal(redactAuditText(uuid), uuid)
})

test('round-trips a valid composite cursor and rejects malformed cursors', () => {
  const cursor = { createdAt: '2026-07-13T13:00:00.000Z', id: '6d7b7fd1-e51f-4b1d-b921-e70760105bb2' }
  assert.deepEqual(decodeAuditCursor(encodeAuditCursor(cursor)), cursor)
  assert.equal(decodeAuditCursor('not-a-cursor'), null)
})

test('escapes CSV quotes and neutralizes spreadsheet formulas', () => {
  assert.equal(csvCell('=HYPERLINK("https://example.test")'), '"\'=HYPERLINK(""https://example.test"")"')
  assert.equal(csvCell('  +1+1'), '"\'  +1+1"')
  assert.equal(csvCell('\tmalicious'), '"\'\tmalicious"')
})
