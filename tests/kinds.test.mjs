// Recipe kinds other than electron: web (match patterns, extension), android (locale parsing),
// native (install with backup and undo, protected folders).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, cpSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { loadRecipe, projectRoot } from '../core/recipe.mjs'
import { matchToRegex } from '../core/launcher.mjs'
import { buildExtension } from '../core/extension.mjs'
import { parseConfigurations } from '../core/android.mjs'
import { installFiles, resetFiles, protectedTarget } from '../core/native.mjs'

const temp = () => mkdtempSync(join(tmpdir(), 'appmod-kind-'))

test('match patterns keep host wildcards inside the host', () => {
  const re = new RegExp(matchToRegex('https://*.example.com/*'))
  assert.ok(re.test('https://example.com/'))
  assert.ok(re.test('https://a.b.example.com/x?y'))
  assert.ok(!re.test('https://evil.com/?https://a.example.com/'))
  assert.ok(!re.test('https://example.com.evil.com/'))
  assert.ok(new RegExp(matchToRegex('*://news.ycombinator.com/*')).test('http://news.ycombinator.com/item?id=1'))
  assert.throws(() => matchToRegex('example.com'))
})

test('web recipe loads and builds a main-world MV3 extension', () => {
  const dir = temp()
  try {
    cpSync(join(projectRoot, 'recipes', 'hacker-news'), dir, { recursive: true })
    const recipe = loadRecipe(dir)
    assert.equal(recipe.kind, 'web')
    assert.equal(recipe.app.urlPrefix, 'https://news.ycombinator.com')
    const { dir: out, warnings } = buildExtension(recipe)
    const manifest = JSON.parse(readFileSync(join(out, 'manifest.json'), 'utf8'))
    assert.equal(manifest.manifest_version, 3)
    assert.equal(manifest.content_scripts[0].world, 'MAIN')
    assert.deepEqual(manifest.content_scripts[0].matches, ['https://news.ycombinator.com/*'])
    assert.match(readFileSync(join(out, 'appmod.js'), 'utf8'), /CONFIG\.allow/)
    assert.equal(warnings.length, 1)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('aapt2 configurations become language codes', () => {
  const out = ['', 'land', 'tr', 'tr-v21', 'pt-rBR', 'b+sr+Latn', 'zh-rTW-land', 'xhdpi-v4', 'night', 'en-rGB'].join('\n')
  assert.deepEqual(parseConfigurations(out), ['en-GB', 'pt-BR', 'sr-Latn', 'tr', 'zh-TW'])
})

test('android and native recipes reject injected features', () => {
  const dir = temp()
  try {
    writeFileSync(join(dir, 'recipe.json'), JSON.stringify({ schema: 1, id: 'x', app: { kind: 'android', package: 'a.b' }, features: ['f.js'] }))
    assert.throws(() => loadRecipe(dir), /not supported for kind "android"/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('native install keeps a backup, reset restores it, protected folders are refused', () => {
  const dir = temp()
  try {
    const appDir = join(dir, 'App')
    const userDir = join(dir, 'user', 'AppName')
    mkdirSync(appDir)
    mkdirSync(userDir, { recursive: true })
    writeFileSync(join(appDir, 'App.exe'), '')
    writeFileSync(join(userDir, 'lang.xml'), 'original')
    const recipeDir = join(dir, 'recipe')
    mkdirSync(join(recipeDir, 'files'), { recursive: true })
    writeFileSync(join(recipeDir, 'files', 'lang.xml'), 'turkish')
    const write = to =>
      writeFileSync(join(recipeDir, 'recipe.json'), JSON.stringify({ schema: 1, id: 'n', app: { kind: 'native', exe: join(appDir, 'App.exe'), install: [{ from: 'files/lang.xml', to }] } }))

    write(join(userDir, 'lang.xml'))
    const recipe = loadRecipe(recipeDir)
    installFiles(recipe)
    assert.equal(readFileSync(join(userDir, 'lang.xml'), 'utf8'), 'turkish')
    resetFiles(recipe)
    assert.equal(readFileSync(join(userDir, 'lang.xml'), 'utf8'), 'original')
    assert.ok(!existsSync(join(userDir, 'lang.xml.appmod-backup')))

    write(join(appDir, 'lang.xml'))
    const inApp = loadRecipe(recipeDir)
    assert.ok(protectedTarget(inApp, join(appDir, 'lang.xml')))
    assert.throws(() => installFiles(inApp), /refusing to write/)
    installFiles(inApp, { allowAppDir: true })
    assert.equal(readFileSync(join(appDir, 'lang.xml'), 'utf8'), 'turkish')
    resetFiles(inApp)
    assert.ok(!existsSync(join(appDir, 'lang.xml')))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
