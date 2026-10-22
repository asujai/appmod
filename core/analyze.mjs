// Static analysis of an Electron app's code for appmod: where its strings live, which languages
// it ships, how it starts, and which hooks (env vars, switches, plugin folders, IPC) exist.
// Everything here is a static observation of shipped code, not proof of runtime behaviour.
import { existsSync, readdirSync } from 'node:fs'
import { join, basename, dirname } from 'node:path'
import { findAppSource } from './asar.mjs'
import { readFuses } from './fuses.mjs'

const CODE = /\.(c|m)?js$/i
const DATA = /\.(json|ftl|po|ya?ml|properties|strings|resx)$/i
const MAX_SCAN = 64 * 1024 * 1024
const LANG = /^(?:[a-z]{2,3})(?:[-_](?:[A-Z]{2}|[A-Z][a-z]{3}|[0-9]{3}))?$/

const I18N_LIBS = [
  ['i18next', /\baddResourceBundle\b|\bi18next\b/],
  ['react-intl / FormatJS', /\bIntlProvider\b|@formatjs|\bformatMessage\(/],
  ['vue-i18n', /\bcreateI18n\(|vue-i18n/],
  ['Lingui', /@lingui\b/],
  ['Angular $localize', /\$localize`/],
  ['Fluent', /@fluent\/|FluentBundle/],
  ['Polyglot', /\bnew Polyglot\(/],
  ['VS Code NLS', /\bvscode-nls\b|\bnls\.localize\(|\blocalize\(\s*['"][\w.-]+['"]\s*,/],
  ['Electron app.getLocale', /\bgetLocale\(\)|\bgetPreferredSystemLanguages\(/],
]

const RULES = {
  envVars: [/process\.env\.([A-Z][A-Z0-9_]{2,})/g, /process\.env\[\s*["'`]([A-Z][A-Z0-9_]{2,})["'`]\s*\]/g],
  switches: [
    /(?:hasSwitch|getSwitchValue|appendSwitch)\(\s*["'`]([a-z][a-z0-9-]+)["'`]/g,
    /argv\.(?:includes|indexOf)\(\s*["'`](--[a-z][a-z0-9-]+)["'`]/g,
  ],
  protocols: [/setAsDefaultProtocolClient\(\s*["'`]([a-z][a-z0-9+.-]*)["'`]/g, /protocol\.(?:handle|registerFileProtocol|registerStringProtocol|registerBufferProtocol)\(\s*["'`]([a-z][a-z0-9+.-]*)["'`]/g],
  ipcMain: [/ipcMain\.(?:handle|handleOnce|on|once)\(\s*["'`]([^"'`]{1,80})["'`]/g],
  ipcRenderer: [/ipcRenderer\.(?:invoke|send|sendSync|on|once)\(\s*["'`]([^"'`]{1,80})["'`]/g],
  exposed: [/exposeInMainWorld\(\s*["'`]([^"'`]{1,60})["'`]/g],
  userData: [/(?:setPath\(\s*["'`]userData["'`]\s*,|setName\()\s*([^)]{1,120})\)/g],
}

const FLAGS = {
  singleInstance: /requestSingleInstanceLock\(/,
  devtoolsBlocked: /devtools-opened[\s\S]{0,200}closeDevTools|closeDevTools\(\)[\s\S]{0,80}devtools-opened/,
  chromeExtensions: /\.loadExtension\(|session\.defaultSession\.extensions/,
  autoUpdate: /electron-updater|autoUpdater\.(?:checkForUpdates|setFeedURL)/,
  contextIsolationOff: /contextIsolation\s*:\s*(?:!1|false)/,
  nodeIntegrationOn: /nodeIntegration\s*:\s*(?:!0|true)/,
  webviewTag: /webviewTag\s*:\s*(?:!0|true)/,
  remoteUi: /\.loadURL\(\s*["'`]https?:\/\//,
}

const PLUGIN_HINT = /["'`]([^"'`\n]{0,80}(?:plugins?|extensions?|addons?|dev-extensions)[\\/][^"'`\n]{0,80})["'`]/gi
const HOOK_ENV = /PLUGIN|EXTENSION|UNVERIFIED|ALLOW|DISABLE|ENABLE|DEBUG|DEV|FEATURE|FLAG|LOCALE|LANG|LOG/

const add = (map, key, file) => {
  const e = map.get(key) || { count: 0, files: new Set() }
  e.count++
  e.files.add(file)
  map.set(key, e)
}
const toList = map =>
  Array.from(map, ([name, e]) => ({ name, count: e.count, files: Array.from(e.files).slice(0, 5) })).sort((a, b) => b.count - a.count)

// obfuscator.io style: many _0x1a2b identifiers and a large string array.
const obfuscationScore = text => {
  const ids = text.length > 2000 ? (text.slice(0, 400000).match(/\b_0x[0-9a-f]{4,6}\b/g) || []).length : 0
  return ids
}

function languagesFromPaths(files) {
  const found = new Map()
  for (const { path } of files) {
    if (path.includes('node_modules/')) continue
    const parts = path.split('/')
    const name = basename(path).replace(/\.[^.]+$/, '')
    const dirName = parts.length > 1 ? parts[parts.length - 2] : ''
    const inLocaleDir = parts.some(p => /^(locales?|i18n|lang(uages)?|translations?|messages|l10n|nls)$/i.test(p))
    for (const candidate of [name, dirName]) {
      if (LANG.test(candidate.replace('_', '-')) && (inLocaleDir || DATA.test(path))) {
        const code = candidate.replace('_', '-')
        if (!found.has(code)) found.set(code, [])
        found.get(code).push(path)
      }
    }
  }
  return Array.from(found, ([code, paths]) => ({ code, files: paths.slice(0, 4), total: paths.length }))
}

export function analyzeApp(exe) {
  const report = { exe, generatedAt: new Date().toISOString(), electron: null, app: null, fuses: null, i18n: {}, hooks: {}, flags: {}, coverage: {}, unknowns: [] }
  report.fuses = readFuses(exe)

  // Chromium's own UI locales (spellcheck, context menus) sit in locales/*.pak next to the exe.
  const pakDir = join(dirname(exe), 'locales')
  if (existsSync(pakDir)) report.chromiumLocales = readdirSync(pakDir).filter(f => f.endsWith('.pak')).map(f => f.slice(0, -4))

  const { resources, source } = findAppSource(exe)
  report.resources = resources
  if (!source) {
    report.unknowns.push('No app.asar or resources/app found next to the exe. Not Electron, or the code lives elsewhere (check the install folder).')
    return report
  }
  report.source = { kind: source.kind, path: source.root }
  const files = source.list()
  report.coverage.files = files.length

  if (source.has('package.json')) {
    try {
      const pkg = JSON.parse(source.read('package.json').toString('utf8'))
      report.app = { name: pkg.name, productName: pkg.productName, version: pkg.version, main: pkg.main, electronVersion: pkg.devDependencies?.electron || pkg.dependencies?.electron || null }
      const appData = process.env.APPDATA || join(process.env.HOME || '', '.config')
      report.app.userDataCandidates = [pkg.productName, pkg.name].filter(Boolean).map(n => join(appData, n)).filter(p => existsSync(p))
    } catch (error) {
      report.unknowns.push(`package.json unreadable: ${error.message}`)
    }
  }

  report.i18n.localeFiles = languagesFromPaths(files)
  report.i18n.dependencies = files
    .map(f => /^node_modules\/((?:@[^/]+\/)?[^/]+)\/package\.json$/.exec(f.path)?.[1])
    .filter(n => n && /i18n|intl|lingui|fluent|polyglot|globalize|nls|locale/i.test(n))

  const libs = new Map()
  const maps = Object.fromEntries(Object.keys(RULES).map(k => [k, new Map()]))
  const plugins = new Map()
  const flags = {}
  const obfuscated = []
  const big = []
  let scanned = 0
  let skipped = 0

  for (const file of files) {
    const own = !file.path.includes('node_modules/')
    if (!CODE.test(file.path) || !own) continue
    if (file.size > MAX_SCAN) {
      big.push(file.path)
      skipped++
      continue
    }
    let text
    try {
      text = source.read(file.path).toString('utf8')
    } catch {
      skipped++
      continue
    }
    scanned++
    for (const [name, re] of I18N_LIBS) if (re.test(text)) add(libs, name, file.path)
    for (const [key, patterns] of Object.entries(RULES)) {
      for (const re of patterns) for (const m of text.matchAll(re)) add(maps[key], m[1].trim(), file.path)
    }
    for (const [key, re] of Object.entries(FLAGS)) if (re.test(text)) (flags[key] = flags[key] || []).push(file.path)
    for (const m of text.matchAll(PLUGIN_HINT)) if (m[1].length < 120 && !m[1].startsWith('-//')) add(plugins, m[1], file.path)
    const score = obfuscationScore(text)
    if (score > 200) obfuscated.push({ path: file.path, obfuscatorIds: score })
  }

  report.coverage.scannedJs = scanned
  report.coverage.skippedJs = skipped
  if (big.length) report.unknowns.push(`Not scanned (over ${MAX_SCAN / 1048576} MB): ${big.join(', ')}`)
  report.i18n.libraries = toList(libs)
  for (const [key, map] of Object.entries(maps)) report.hooks[key] = toList(map).slice(0, 80)
  report.hooks.envVarsOfInterest = report.hooks.envVars.filter(e => HOOK_ENV.test(e.name))
  report.hooks.pluginPaths = toList(plugins).slice(0, 40)
  report.flags = Object.fromEntries(Object.entries(flags).map(([k, v]) => [k, v.slice(0, 5)]))
  report.obfuscated = obfuscated
  if (obfuscated.length) report.unknowns.push('Some files are obfuscated: string literals may be hidden in a lookup array. Read the values at runtime instead (`appmod live <recipe> eval ...`).')
  if (!report.i18n.libraries.length && !report.i18n.localeFiles.length) report.unknowns.push('No i18n library or locale files recognised. Strings may be hard-coded, fetched at runtime, or bundled in a form these patterns miss.')
  report.suggestions = suggest(report)
  return report
}

function suggest(r) {
  const s = []
  const f = r.fuses.fuses || {}
  if (f.EnableEmbeddedAsarIntegrityValidation === 'on') s.push('Integrity validation is on: never edit app.asar; runtime injection (appmod launch) is the only safe route.')
  const libs = r.i18n.libraries.map(l => l.name)
  if (libs.includes('i18next')) s.push('i18next found: use language.i18n.library "i18next"; `appmod inspect` will dump its strings.')
  else if (libs.length) s.push(`i18n via ${libs.join(', ')}: no appmod adapter yet. Use the text map, or write an adapter (runtime/runtime.js) and add a test.`)
  const codes = r.i18n.localeFiles.map(l => l.code)
  if (codes.length) s.push(`Locale files for: ${codes.join(', ')}. If the requested language is among them, it is probably shipped: look for an in-app setting or a --lang switch first.`)
  if (libs.includes('Electron app.getLocale') || libs.includes('VS Code NLS')) s.push('The app reads the OS/Electron locale: try starting it with --lang=<code> (recipe app.args) before translating anything.')
  if (r.flags.remoteUi) s.push('The main window loads a web URL: most UI code is downloaded at runtime, not in app.asar. Static results cover only the shell; study the UI with `appmod live` (anchors, eval).')
  if (r.flags.singleInstance) s.push('Single-instance app: it must be fully quit (tray too) before appmod launch.')
  if (r.flags.devtoolsBlocked) s.push('The app closes DevTools when opened. CDP attach may still work; if pages never report ready, stop and do not try to defeat it.')
  if (r.flags.chromeExtensions) s.push('The app can load Chrome extensions: a feature might be packaged as an extension instead of an injected script.')
  if (r.hooks.envVarsOfInterest.length) s.push(`Env vars worth checking (plugin/dev/feature switches): ${r.hooks.envVarsOfInterest.slice(0, 12).map(e => e.name).join(', ')}. Ask the user before setting any.`)
  if (r.hooks.pluginPaths.length) s.push('Plugin/extension paths are referenced: the app may have its own extension system (see hooks.pluginPaths). An official extension is sturdier than injection.')
  const custom = r.hooks.userData?.map(u => u.name) || []
  if (r.app?.userDataCandidates?.length || custom.length) s.push(`User data folder candidates: ${[...(r.app?.userDataCandidates || []), ...custom.map(c => `code sets ${c}`)].join('; ')}. If the app restarts itself on launch, set portFile to the DevToolsActivePort file that appears in the real one after a launch.`)
  return s
}

export function reportMarkdown(r) {
  const lines = [`# Analysis: ${r.app?.productName || r.app?.name || basename(r.exe)}`, '', `Generated ${r.generatedAt}. Static observations of shipped code; runtime behaviour is not proven.`, '']
  lines.push('## Summary', '', `- exe: \`${r.exe}\``, `- code: ${r.source ? `${r.source.kind} \`${r.source.path}\`` : 'not found'}`)
  if (r.app) lines.push(`- app: ${r.app.productName || r.app.name} ${r.app.version || ''} (main: \`${r.app.main}\`)`)
  lines.push(`- fuses: ${r.fuses.found ? Object.entries(r.fuses.fuses).map(([k, v]) => `${k}=${v}`).join(', ') : 'none found'}`)
  lines.push(`- scanned ${r.coverage.scannedJs ?? 0} own JS files of ${r.coverage.files ?? 0} files; skipped ${r.coverage.skippedJs ?? 0}`)
  lines.push('', '## Suggestions', '', ...(r.suggestions.length ? r.suggestions.map(x => `- ${x}`) : ['- none']))
  lines.push('', '## i18n', '', `- libraries: ${r.i18n.libraries?.map(l => `${l.name} (${l.count} files)`).join(', ') || 'none recognised'}`)
  lines.push(`- locale files: ${r.i18n.localeFiles?.map(l => `${l.code} (${l.total})`).join(', ') || 'none'}`)
  if (r.chromiumLocales) lines.push(`- Chromium UI locales: ${r.chromiumLocales.length}`)
  const section = (title, list, fmt = e => `\`${e.name}\` ×${e.count}`) => {
    if (list?.length) lines.push('', `## ${title}`, '', list.slice(0, 30).map(fmt).join(', '))
  }
  section('Environment variables of interest', r.hooks.envVarsOfInterest)
  section('Command-line switches', r.hooks.switches)
  section('Protocols', r.hooks.protocols)
  section('Plugin / extension paths', r.hooks.pluginPaths)
  section('Exposed to pages (contextBridge)', r.hooks.exposed)
  section('IPC handled by main', r.hooks.ipcMain)
  if (Object.keys(r.flags).length) lines.push('', '## Flags', '', ...Object.entries(r.flags).map(([k, v]) => `- ${k}: ${v.join(', ')}`))
  if (r.fuses.notes?.length) lines.push('', '## Fuse notes', '', ...r.fuses.notes.map(n => `- ${n}`))
  if (r.unknowns.length) lines.push('', '## Unknowns and limits', '', ...r.unknowns.map(u => `- ${u}`))
  return lines.join('\n') + '\n'
}

// Regex search through the app's code with context windows (minified code has no useful lines).
export function searchApp(exe, pattern, { files: filter = '', context = 120, max = 40, includeModules = false } = {}) {
  const { source } = findAppSource(exe)
  if (!source) throw new Error('app code not found next to the exe')
  const re = new RegExp(pattern, 'g')
  const hits = []
  for (const file of source.list()) {
    if (!includeModules && file.path.includes('node_modules/')) continue
    if (filter && !file.path.includes(filter)) continue
    if (!(CODE.test(file.path) || DATA.test(file.path) || /\.html?$/.test(file.path)) || file.size > MAX_SCAN) continue
    const text = source.read(file.path).toString('utf8')
    for (const m of text.matchAll(re)) {
      const start = Math.max(0, m.index - context)
      hits.push({ path: file.path, offset: m.index, match: m[0], snippet: text.slice(start, m.index + m[0].length + context).replace(/\s+/g, ' ') })
      if (hits.length >= max) return { hits, truncated: true }
      if (m[0].length === 0) re.lastIndex++
    }
  }
  return { hits, truncated: false }
}

export { findAppSource }
