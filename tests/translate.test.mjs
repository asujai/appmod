import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseTranslation, normalizeTarget } from '../recipes/discord/features/translate.mjs'

test('parses a Google Translate response', () => {
  const data = [[['Merhaba, bugün nasılsın?', 'Hello, how are you today?', null, null, 3]], null, 'en']
  assert.deepEqual(parseTranslation(data), { text: 'Merhaba, bugün nasılsın?', source: 'en' })
})

test('joins all translated segments and ignores missing source', () => {
  const data = [[['Bir ', 'One '], ['iki', 'two']], null, null]
  assert.deepEqual(parseTranslation(data), { text: 'Bir iki', source: null })
})

test('rejects malformed or empty responses', () => {
  assert.equal(parseTranslation(null), null)
  assert.equal(parseTranslation({}), null)
  assert.equal(parseTranslation([[], null, 'en']), null)
  assert.equal(parseTranslation([[['', 'Hello']], null, 'en']), null)
})

test('normalizes the target language', () => {
  assert.equal(normalizeTarget('de'), 'de')
  assert.equal(normalizeTarget('pt-BR'), 'pt-BR')
  assert.equal(normalizeTarget('not a language'), 'tr')
  assert.equal(normalizeTarget(undefined), 'tr')
})
