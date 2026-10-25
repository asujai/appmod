// Recipe kinds other than electron: web (match patterns, extension), android (locale parsing),
// native (install with backup and undo, protected folders).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, cpSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { loadRecipe, projectRoot } from '../core/recipe.mjs'
import { matchToRegex, prefixToRegex } from '../core/launcher.mjs'
import { detectKind } from '../core/analyze.mjs'
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

test('match patterns without a port match any port; with a port only that one', () => {
  const any = new RegExp(matchToRegex('http://127.0.0.1/app/*'))
  assert.ok(any.test('http://127.0.0.1:5173/app/x'))
  assert.ok(any.test('http://127.0.0.1/app/'))
  assert.ok(!any.test('http://127.0.0.1:5173/other/'))
  const fixed = new RegExp(matchToRegex('http://localhost:8080/*'))
  assert.ok(fixed.test('http://localhost:8080/a'))
  assert.ok(!fixed.test('http://localhost:9090/a'))
  assert.ok(!new RegExp(matchToRegex('https://*.example.com/*')).test('https://evil.com:443.example.org/'))
})

test('a URL prefix only matches at a boundary', () => {
  const discord = new RegExp(prefixToRegex('https://discord.com'))
  assert.ok(discord.test('https://discord.com'))
  assert.ok(discord.test('https://discord.com/channels/@me'))
  assert.ok(discord.test('https://discord.com?x=1'))
  assert.ok(!discord.test('https://discord.com.evil.example/'))
  assert.ok(!discord.test('https://discord.community/'))
  assert.ok(new RegExp(prefixToRegex('qoder-app:')).test('qoder-app://renderer/index.html'))
})

test('webview recipes need an engine and load like electron ones', () => {
  const dir = temp()
  try {
    const write = app => writeFileSync(join(dir, 'recipe.json'), JSON.stringify({ schema: 1, id: 'w', app: { kind: 'webview', exe: 'C:/x/App.exe', ...app } }))
    write({})
    assert.throws(() => loadRecipe(dir), /app\.engine/)
    write({ engine: 'cef', targetTypes: ['page', 'webview'], startTimeoutMs: 5000 })
    const r = loadRecipe(dir)
    assert.equal(r.app.engine, 'cef')
    assert.deepEqual(r.app.targetTypes, ['page', 'webview'])
    assert.equal(r.app.startTimeoutMs, 5000)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('kind detection: electron, WebView2, WinUI 3, CEF, Tauri-style and native', () => {
  const dir = temp()
  try {
    const app = (name, files) => {
      const d = join(dir, name)
      mkdirSync(d, { recursive: true })
      writeFileSync(join(d, 'App.exe'), 'MZ plain binary')
      for (const f of files) writeFileSync(join(d, f), '')
      return join(d, 'App.exe')
    }
    assert.equal(detectKind(app('wv2', ['WebView2Loader.dll'])).engine, 'webview2')
    assert.equal(detectKind(app('cef', ['libcef.dll'])).engine, 'cef')
    const winui = detectKind(app('winui', ['WebView2Loader.dll', 'Microsoft.UI.Xaml.Controls.dll']))
    assert.equal(winui.kind, 'native')
    assert.equal(winui.embeds, 'webview2')
    assert.equal(detectKind(app('native', ['Qt6Core.dll'])).kind, 'native')
    const tauri = app('tauri', [])
    writeFileSync(tauri, Buffer.concat([Buffer.from('MZ'), Buffer.from('CreateCoreWebView2EnvironmentWithOptions', 'utf16le')]))
    assert.equal(detectKind(tauri).engine, 'webview2')
    const electron = app('electron', [])
    mkdirSync(join(dir, 'electron', 'resources', 'app'), { recursive: true })
    writeFileSync(join(dir, 'electron', 'resources', 'app', 'package.json'), '{}')
    assert.equal(detectKind(electron).kind, 'electron')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
