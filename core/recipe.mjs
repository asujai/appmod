// Loads and validates a recipe folder (recipes/<id>/recipe.json).
// The format is documented in docs/recipe-format.md.
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, resolve, isAbsolute, dirname, basename, normalize } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'

const PLATFORM = process.platform

// %VAR% (Windows style), $VAR / ${VAR} and a leading ~ are expanded.
export function expand(value) {
  return value
    .replace(/%([A-Za-z0-9_]+)%/g, (m, name) => process.env[name] ?? m)
    .replace(/\$\{([A-Za-z0-9_]+)\}|\$([A-Za-z0-9_]+)/g, (m, a, b) => process.env[a || b] ?? m)
    .replace(/^~(?=[\\/]|$)/, homedir())
}

// A per-platform value is either a string or { win32, darwin, linux }.
function forPlatform(value) {
  if (value == null) return undefined
  if (typeof value === 'string' || Array.isArray(value)) return value
  return value[PLATFORM]
}

// Resolves one `*` per path segment by picking the newest match (e.g. Discord's app-1.0.9xxx).
export function resolveGlob(path) {
  const parts = path.split(/[\\/]/)
  let current = parts[0] === '' ? '/' : parts[0]
  for (const part of parts.slice(1)) {
    if (!part.includes('*')) {
      current = join(current, part)
      continue
    }
    const pattern = new RegExp('^' + part.split('*').map(escapeRegex).join('.*') + '$', 'i')
    let matches = []
    try {
      matches = readdirSync(current).filter(name => pattern.test(name))
    } catch {}
    if (matches.length === 0) return join(current, part)
    matches.sort((a, b) => statSync(join(current, b)).mtimeMs - statSync(join(current, a)).mtimeMs)
    current = join(current, matches[0])
  }
  return current
}

const escapeRegex = s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')

export function loadRecipe(dir) {
  const root = resolve(dir)
  const file = join(root, 'recipe.json')
  if (!existsSync(file)) throw new Error(`recipe.json not found in ${root}`)
  const raw = JSON.parse(readFileSync(file, 'utf8'))
  const errors = []
  const local = p => (isAbsolute(p) ? p : join(root, p))

  if (raw.schema !== 1) errors.push('schema must be 1')
  if (!raw.id) errors.push('id is required')
  const kind = raw.app?.kind
  if (!KINDS.includes(kind)) errors.push(`app.kind must be one of ${KINDS.join(', ')}`)
  const app = resolveApp(kind, raw.app || {}, root, errors)

  const language = raw.language ? { ...raw.language } : null
  if (language) {
    if (!language.code) errors.push('language.code is required')
    if (kind === 'android' && language.mode && language.mode !== 'app-locale') errors.push('android language.mode must be "app-locale"')
    const i18n = (language.i18n = { library: 'none', namespace: 'translation', mode: 'override', ...language.i18n })
    if (!['i18next', 'none'].includes(i18n.library)) errors.push('language.i18n.library must be "i18next" or "none"')
    if (!['override', 'add'].includes(i18n.mode)) errors.push('language.i18n.mode must be "override" or "add"')
    if (i18n.library === 'i18next' && !i18n.base) errors.push('language.i18n.base is required for i18next')
    for (const key of ['pack', 'text']) {
      if (language[key]) {
        language[key] = local(language[key])
        if (!existsSync(language[key])) errors.push(`language.${key} file missing: ${language[key]}`)
      }
    }
  }

  if ((raw.features || []).length && (kind === 'android' || kind === 'native')) {
    errors.push(`features (injected scripts) are not supported for kind "${kind}"; see skills/appmod/references/kinds.md`)
  }
  const features = (raw.features || []).map(local)
  for (const f of features) if (!existsSync(f)) errors.push(`feature file missing: ${f}`)

  const actions = {}
  for (const [name, action] of Object.entries(raw.actions || {})) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) errors.push(`action name "${name}" must be kebab-case`)
    if (!action.command) errors.push(`action "${name}" needs a command`)
    actions[name] = {
      // "node" means the node running appmod, so actions work without node on PATH.
      command: action.command === 'node' ? process.execPath : expand(action.command),
      // "./x" is inside the recipe, "@appmod/x" inside this repository (shared actions).
      args: (action.args || []).map(a => expand(/^(\.|@appmod)\//.test(a) ? join(a.startsWith('.') ? root : projectRoot, a.replace(/^(\.|@appmod)\//, '')) : a)),
      cwd: root,
      timeoutMs: action.timeoutMs ?? 15000,
    }
  }

  if (errors.length) throw new Error(`Invalid recipe ${basename(root)}:\n- ${errors.join('\n- ')}`)

  return {
    root,
    id: raw.id,
    name: raw.name || raw.id,
    tested: raw.tested || null,
    kind,
    app,
    language,
    features,
    actions,
    raw,
    logFile: join(root, 'appmod.log'),
    inspectDir: join(root, 'inspect'),
    analysisDir: join(root, 'analysis'),
    sessionFile: join(root, '.appmod-session.json'),
  }
}

export const KINDS = ['electron', 'webview', 'web', 'android', 'native']
// Kinds whose windows are Chromium pages appmod injects into over CDP.
export const INJECTABLE = ['electron', 'webview', 'web']
export const ENGINES = ['webview2', 'cef']

// Standard install locations, used when a web recipe says "browser": "auto".
const BROWSERS = {
  win32: [
    '%PROGRAMFILES%/Google/Chrome/Application/chrome.exe',
    '%PROGRAMFILES(X86)%/Google/Chrome/Application/chrome.exe',
    '%LOCALAPPDATA%/Google/Chrome/Application/chrome.exe',
    '%PROGRAMFILES(X86)%/Microsoft/Edge/Application/msedge.exe',
    '%PROGRAMFILES%/Microsoft/Edge/Application/msedge.exe',
  ],
  darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'],
  linux: ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge'],
}

export function findBrowser() {
  return (BROWSERS[PLATFORM] || []).map(p => normalize(expand(p))).find(p => existsSync(p)) || null
}

// Per-kind app settings. Every kind gets: exe (what to start, if anything), args, env.
function resolveApp(kind, a, root, errors) {
  const env = Object.fromEntries(Object.entries(a.env || {}).map(([k, v]) => [k, expand(String(v))]))
  const base = {
    args: a.args || [],
    env,
    urlPrefix: a.pageFilter?.urlPrefix || '',
    reloadIfLate: a.reloadIfLate !== false,
    reloadDelayMs: a.reloadDelayMs ?? 1000,
    startTimeoutMs: a.startTimeoutMs ?? 60000,
    // CDP target types that get the runtime. Electron <webview> tags are "webview".
    targetTypes: a.targetTypes || ['page'],
  }
  if (!Array.isArray(base.args) || base.args.some(x => typeof x !== 'string')) errors.push('app.args must be a list of strings')
  if (kind === 'webview') {
    if (!ENGINES.includes(a.engine)) errors.push(`webview recipes need app.engine: ${ENGINES.join(' or ')}`)
    if (a.engine === 'webview2' && PLATFORM !== 'win32') errors.push('WebView2 exists on Windows only')
  }
  if (kind === 'electron' || kind === 'native' || kind === 'webview') {
    const exeRaw = forPlatform(a.exe)
    if (!exeRaw) errors.push(`app.exe has no entry for platform ${PLATFORM}`)
    const exe = exeRaw ? resolveGlob(expand(exeRaw)) : ''
    const portFileRaw = forPlatform(a.portFile)
    const install = (a.install || []).map(i => ({ from: isAbsolute(i.from) ? i.from : join(root, i.from), to: resolveGlob(expand(forPlatform(i.to) || '')) }))
    for (const i of install) {
      if (!existsSync(i.from)) errors.push(`install source missing: ${i.from}`)
      if (!i.to) errors.push(`install target has no entry for platform ${PLATFORM}`)
    }
    if (install.length && kind !== 'native') errors.push(`install is for kind "native"; ${kind} recipes change the app at runtime`)
    return { ...base, exe, exeName: exe ? basename(exe) : '', portFile: portFileRaw && expand(portFileRaw), install, engine: kind === 'webview' ? a.engine : undefined }
  }
  if (kind === 'web') {
    const browserRaw = forPlatform(a.browser) || 'auto'
    const exe = browserRaw === 'auto' ? findBrowser() : resolveGlob(expand(browserRaw))
    if (!exe) errors.push('no Chrome or Edge found; set app.browser to a Chromium-based browser path')
    if (!a.startUrl) errors.push('web recipes need app.startUrl')
    if (!a.matches?.length) errors.push('web recipes need app.matches (URL patterns like "https://example.com/*")')
    const profile = expand(a.profile || join(process.env.LOCALAPPDATA || join(homedir(), '.local', 'share'), 'appmod', 'profiles', basename(root)))
    return { ...base, exe: exe || '', exeName: exe ? basename(exe) : '', startUrl: a.startUrl, matches: a.matches || [], profile, urlPrefix: base.urlPrefix || new URL(a.startUrl || 'about:blank').origin }
  }
  if (kind === 'android') {
    if (!a.package) errors.push('android recipes need app.package (e.g. "com.example.app")')
    return { ...base, package: a.package, device: a.device || process.env.ANDROID_SERIAL || null, adb: expand(a.adb || 'adb') }
  }
  return base
}

export const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
export const templateDir = join(projectRoot, 'recipes', '_template')
