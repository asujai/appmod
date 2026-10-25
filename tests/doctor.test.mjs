// Static recipe validation and the trust summary shown before running someone else's recipe.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { validateAll, validateRecipe, trustSummary } from '../core/doctor.mjs'
import { loadRecipe, projectRoot } from '../core/recipe.mjs'

test('every recipe and template in the repository validates', () => {
  for (const r of validateAll(join(projectRoot, 'recipes'))) assert.deepEqual(r.problems, [], r.id)
})

test('validate catches broken scripts, packs, placeholders and a wrong id', () => {
  const root = mkdtempSync(join(tmpdir(), 'appmod-val-'))
  const dir = join(root, 'my-app')
  try {
    mkdirSync(join(dir, 'features'), { recursive: true })
    mkdirSync(join(dir, 'packs'))
    mkdirSync(join(dir, 'text'))
    writeFileSync(join(dir, 'features', 'f.js'), 'appmod.addStyle(`x`')
    writeFileSync(join(dir, 'packs', 'tr.json'), JSON.stringify({ a: 'b', c: { nested: 'no' } }))
    writeFileSync(join(dir, 'text', 'tr.json'), JSON.stringify({ 'Delete {{name}}?': 'Silinsin mi?' }))
    writeFileSync(
      join(dir, 'recipe.json'),
      JSON.stringify({
        schema: 1,
        id: 'other-id',
        app: { kind: 'web', startUrl: 'https://example.com/', matches: ['https://example.com/*'], browser: process.execPath },
        language: { code: 'tr', i18n: { library: 'none' }, pack: 'packs/tr.json', text: 'text/tr.json' },
        features: ['features/f.js'],
      }),
    )
    const all = validateRecipe(dir).problems.join('\n')
    assert.match(all, /differs from the folder name/)
    assert.match(all, /NOTES\.md/)
    assert.match(all, /f\.js/)
    assert.match(all, /not "key": "string"/)
    assert.match(all, /placeholders differ/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('trust summary lists what a recipe runs', () => {
  const lines = trustSummary(loadRecipe(join(projectRoot, 'recipes', 'discord')))
  assert.ok(lines.some(l => l.startsWith('ACTION translate: runs')))
  assert.ok(lines.some(l => /features[\\/]translate\.js/.test(l)))
  assert.ok(lines.some(l => l === 'injects into: https://discord.com'))
})
