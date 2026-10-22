import { test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { loadRecipe, projectRoot } from '../core/recipe.mjs'

test('the Discord recipe loads with its translation feature and action', () => {
  const recipe = loadRecipe(join(projectRoot, 'recipes', 'discord'))
  assert.equal(recipe.language.code, 'tr')
  assert.ok(recipe.features.some(file => file.endsWith('translate.js')))
  assert.ok(recipe.actions.translate)
  assert.equal(recipe.actions.translate.timeoutMs, 20000)
})
