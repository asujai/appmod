import { test } from 'node:test'
import assert from 'node:assert/strict'
import { placeholders, samePlaceholders } from '../core/placeholders.mjs'

test('finds i18next, printf, ICU, markup and nesting tokens', () => {
  assert.deepEqual(placeholders('Hi {{ name }}, %s and %1$d <0>link</0> $t(a.b) {count}'), [
    '$t(a.b)', '%1$d', '%s', '</0>', '<0>', '{count}', '{{name}}',
  ].sort())
})

test('translation keeping tokens in another order passes', () => {
  assert.ok(samePlaceholders('{{count}} files in {{folder}}', '{{folder}} içinde {{count}} dosya'))
})

test('dropped or renamed token fails', () => {
  assert.ok(!samePlaceholders('Delete {{name}}?', 'Silinsin mi?'))
  assert.ok(!samePlaceholders('Delete {{name}}?', '{{isim}} silinsin mi?'))
  assert.ok(!samePlaceholders('Line<br/>break', 'Satır sonu'))
})

test('plain text has no tokens', () => {
  assert.deepEqual(placeholders('Settings'), [])
})
