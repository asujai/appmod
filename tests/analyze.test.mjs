// Builds a tiny fake Electron install (exe with fuses + app.asar) and runs the analyzer on it.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { openAsar } from '../core/asar.mjs'
import { readFuses } from '../core/fuses.mjs'
import { analyzeApp, searchApp } from '../core/analyze.mjs'

function writeAsar(file, entries) {
  const header = { files: {} }
  const chunks = []
  let offset = 0
  for (const [path, text] of Object.entries(entries)) {
    const data = Buffer.from(text)
    let node = header
    const parts = path.split('/')
    for (const dir of parts.slice(0, -1)) node = node.files[dir] ??= { files: {} }
    node.files[parts.at(-1)] = { size: data.length, offset: String(offset) }
    chunks.push(data)
    offset += data.length
  }
  const json = Buffer.from(JSON.stringify(header))
  const pad = (4 - (json.length % 4)) % 4
  const pickle = Buffer.alloc(8 + json.length + pad)
  pickle.writeUInt32LE(4 + json.length + pad, 0)
  pickle.writeUInt32LE(json.length, 4)
  json.copy(pickle, 8)
  const size = Buffer.alloc(8)
  size.writeUInt32LE(4, 0)
  size.writeUInt32LE(pickle.length, 4)
  writeFileSync(file, Buffer.concat([size, pickle, ...chunks]))
}

function fakeInstall() {
  const dir = mkdtempSync(join(tmpdir(), 'appmod-'))
  mkdirSync(join(dir, 'resources'))
  const fuses = Buffer.concat([Buffer.alloc(100), Buffer.from('dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX'), Buffer.from([1, 9]), Buffer.from('100010r11'), Buffer.alloc(50)])
  writeFileSync(join(dir, 'App.exe'), fuses)
  writeAsar(join(dir, 'resources', 'app.asar'), {
    'package.json': JSON.stringify({ name: 'fake', productName: 'Fake App', version: '1.2.3', main: 'main.js' }),
    'main.js': `const {app, ipcMain} = require('electron'); app.requestSingleInstanceLock();
      if (process.env.FAKE_PLUGIN_DEV_DIRS) load(); ipcMain.handle('settings:get', () => 1);
      app.commandLine.hasSwitch('safe-mode'); const p = "~/.fake/plugins/installed.json";`,
    'renderer/app.js': `i18n.addResourceBundle('en','translation',{}); import('./locales/de.json')`,
    'locales/en.json': '{"hello":"Hello"}',
    'locales/de.json': '{"hello":"Hallo"}',
  })
  return dir
}

test('asar reader lists and reads files', () => {
  const dir = fakeInstall()
  try {
    const asar = openAsar(join(dir, 'resources', 'app.asar'))
    assert.deepEqual(asar.list().map(f => f.path).sort(), ['locales/de.json', 'locales/en.json', 'main.js', 'package.json', 'renderer/app.js'])
    assert.equal(asar.read('locales/de.json').toString(), '{"hello":"Hallo"}')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('fuse reader decodes states', () => {
  const dir = fakeInstall()
  try {
    const { found, fuses } = readFuses(join(dir, 'App.exe'))
    assert.ok(found)
    assert.equal(fuses.RunAsNode, 'on')
    assert.equal(fuses.EnableEmbeddedAsarIntegrityValidation, 'on')
    assert.equal(fuses.LoadBrowserProcessSpecificV8Snapshot, 'removed')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('analyzer finds i18n, locales, hooks and flags', () => {
  const dir = fakeInstall()
  try {
    const r = analyzeApp(join(dir, 'App.exe'))
    assert.equal(r.app.productName, 'Fake App')
    assert.ok(r.i18n.libraries.some(l => l.name === 'i18next'))
    assert.deepEqual(r.i18n.localeFiles.map(l => l.code).sort(), ['de', 'en'])
    assert.ok(r.hooks.envVarsOfInterest.some(e => e.name === 'FAKE_PLUGIN_DEV_DIRS'))
    assert.ok(r.hooks.ipcMain.some(e => e.name === 'settings:get'))
    assert.ok(r.hooks.switches.some(e => e.name === 'safe-mode'))
    assert.ok(r.hooks.pluginPaths.length > 0)
    assert.ok(r.flags.singleInstance)
    assert.ok(r.suggestions.some(s => s.includes('never edit app.asar')))
    const { hits } = searchApp(join(dir, 'App.exe'), 'FAKE_[A-Z_]+')
    assert.equal(hits[0].path, 'main.js')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
