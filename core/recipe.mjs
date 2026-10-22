// Loads and validates a recipe folder (recipes/<id>/recipe.json).
// The format is documented in docs/recipe-format.md.
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, resolve, isAbsolute, dirname, basename } from 'node:path'
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
  if (raw.app?.kind !== 'electron') errors.push('app.kind must be "electron" (the only supported kind for now)')

  const exeRaw = forPlatform(raw.app?.exe)
  if (!exeRaw) errors.push(`app.exe has no entry for platform ${PLATFORM}`)
  const exe = exeRaw && resolveGlob(expand(exeRaw))
  const portFileRaw = forPlatform(raw.app?.portFile)
  const portFile = portFileRaw && expand(portFileRaw)

  const language = raw.language ? { ...raw.language } : null
  if (language) {
    if (!language.code) errors.push('language.code is required')
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

  const features = (raw.features || []).map(local)
  for (const f of features) if (!existsSync(f)) errors.push(`feature file missing: ${f}`)

  const actions = {}
  for (const [name, action] of Object.entries(raw.actions || {})) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) errors.push(`action name "${name}" must be kebab-case`)
    if (!action.command) errors.push(`action "${name}" needs a command`)
    actions[name] = {
      // "node" means the node running appmod, so actions work without node on PATH.
      command: action.command === 'node' ? process.execPath : expand(action.command),
      args: (action.args || []).map(a => expand(a.replace(/^\.\//, root + '/'))),
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
    app: {
      exe,
      exeName: basename(exe),
      args: raw.app.args || [],
      portFile,
      urlPrefix: raw.app.pageFilter?.urlPrefix || '',
      reloadIfLate: raw.app.reloadIfLate !== false,
      reloadDelayMs: raw.app.reloadDelayMs ?? 1000,
    },
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

export const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
export const templateDir = join(projectRoot, 'recipes', '_template')
