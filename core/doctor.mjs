// Health checks. `validate` is static (for contributors and CI): does a recipe load, parse and
// keep its placeholders. `doctor` looks at this machine: is the target there, has it changed
// since the recipe was tested, is it running, and what exactly will the recipe run.
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, basename } from 'node:path'
import vm from 'node:vm'
import { execFileSync } from 'node:child_process'
import { loadRecipe, findBrowser, INJECTABLE } from './recipe.mjs'
import { matchToRegex, isRunning, runningSession } from './launcher.mjs'
import { samePlaceholders } from './placeholders.mjs'
import { findAppSource } from './asar.mjs'
import { fileVersion } from './analyze.mjs'
import { findAapt2 } from './android.mjs'
import { reaCommand } from './rea.mjs'
import { skillStatus } from './setup.mjs'

const readJson = file => JSON.parse(readFileSync(file, 'utf8'))

// Static checks of one recipe folder. Returns { id, problems: [], warnings: [] }.
export function validateRecipe(dir) {
  const problems = []
  const warnings = []
  const folder = basename(dir)
  let recipe
  try {
    recipe = loadRecipe(dir)
  } catch (error) {
    return { id: folder, problems: [error.message.replace(/^Invalid recipe [^:]+:\n/, '')], warnings }
  }
  const template = folder.startsWith('_')
  if (!template && recipe.id !== folder) problems.push(`id "${recipe.id}" differs from the folder name "${folder}"`)
  const notes = join(dir, 'NOTES.md')
  if (!existsSync(notes) || !readFileSync(notes, 'utf8').trim()) problems.push('NOTES.md is missing or empty (say what was tested and what broke)')
  if (!template && !recipe.tested) warnings.push('tested is null: record version, platform and date once it works')
  for (const file of recipe.features) {
    try {
      new vm.Script(`(function (appmod) {\n${readFileSync(file, 'utf8')}\n})`, { filename: file })
    } catch (error) {
      problems.push(`${basename(file)}: ${error.message}`)
    }
  }
  const lang = recipe.language
  for (const key of ['pack', 'text']) {
    if (!lang?.[key]) continue
    let data
    try {
      data = readJson(lang[key])
    } catch (error) {
      problems.push(`${basename(lang[key])}: not valid JSON (${error.message})`)
      continue
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      problems.push(`${basename(lang[key])}: must be a flat object of strings`)
      continue
    }
    const bad = Object.entries(data).filter(([k, v]) => !k || typeof v !== 'string')
    if (bad.length) problems.push(`${basename(lang[key])}: ${bad.length} entr${bad.length === 1 ? 'y is' : 'ies are'} not "key": "string" (first: ${bad[0][0] || '(empty key)'})`)
    if (key === 'text') {
      const broken = Object.entries(data).filter(([k, v]) => typeof v === 'string' && !samePlaceholders(k, v))
      if (broken.length) problems.push(`${basename(lang[key])}: placeholders differ in ${broken.length} entr${broken.length === 1 ? 'y' : 'ies'} (first: "${broken[0][0]}")`)
    }
  }
  if (recipe.kind === 'web') {
    for (const p of recipe.app.matches) {
      try {
        matchToRegex(p)
      } catch (error) {
        problems.push(error.message)
      }
    }
    if (recipe.app.matches.some(p => /^(\*|https?):\/\/\*\//.test(p))) warnings.push('matches includes every site; keep patterns as narrow as the task allows')
  }
  for (const [name, action] of Object.entries(recipe.actions)) {
    for (const arg of action.args) {
      if ((arg.startsWith(recipe.root) || /[\\/]shared[\\/]actions[\\/]/.test(arg)) && !existsSync(arg)) problems.push(`action ${name}: ${arg} does not exist`)
    }
  }
  if (Object.keys(recipe.actions).length && !INJECTABLE.includes(recipe.kind)) problems.push(`actions need an injectable kind (${INJECTABLE.join(', ')})`)
  return { id: template ? folder : recipe.id, problems, warnings }
}

export function validateAll(recipesDir) {
  return readdirSync(recipesDir)
    .filter(n => statSync(join(recipesDir, n)).isDirectory() && existsSync(join(recipesDir, n, 'recipe.json')))
    .map(n => validateRecipe(join(recipesDir, n)))
}

const tryRun = (cmd, args) => {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }).trim()
  } catch {
    return null
  }
}

// What this machine has for each kind.
export function doctorEnvironment({ home } = {}) {
  const major = Number(process.versions.node.split('.')[0])
  const rea = reaCommand()
  return [
    { name: 'Node.js', ok: major >= 22, detail: `${process.versions.node}${major >= 22 ? '' : ' (appmod needs 22 or newer)'}` },
    { name: 'platform', ok: true, detail: `${process.platform} ${process.arch}` },
    { name: 'browser (web recipes)', ok: !!findBrowser(), detail: findBrowser() || 'no Chrome or Edge found; set app.browser in web recipes' },
    { name: 'adb (android recipes)', ok: !!tryRun('adb', ['version']), detail: tryRun('adb', ['version'])?.split('\n')[0] || 'not on PATH (only needed for android recipes)' },
    { name: 'aapt2 (android languages)', ok: !!findAapt2(), detail: findAapt2() || 'Android SDK build-tools not found (only needed to list an APK\'s languages)' },
    { name: 'REA (native/APK code)', ok: true, detail: rea.downloads ? `not installed; fetched by npx on first use (${rea.how})` : rea.how },
    ...skillStatus({ home }).map(s => ({ name: `skill (${s.name})`, ok: s.status === 'up to date' || s.status === 'not installed', detail: `${s.status} (${s.dir})` })),
  ]
}

// Versions of the recipe's target that can be read without starting it: the app's own
// package.json (Electron) and the executable's file version. Some apps differ between the two.
export function installedVersions(recipe) {
  const found = []
  if (recipe.kind === 'electron') {
    try {
      const { source } = findAppSource(recipe.app.exe)
      if (source?.has('package.json')) found.push(JSON.parse(source.read('package.json').toString('utf8')).version)
    } catch {}
  }
  if (['electron', 'webview', 'native'].includes(recipe.kind)) found.push(fileVersion(recipe.app.exe))
  return [...new Set(found.filter(Boolean))]
}

// Everything a recipe will run or change, so a recipe from someone else can be read before use.
export function trustSummary(recipe) {
  const lines = []
  if (INJECTABLE.includes(recipe.kind)) {
    lines.push(recipe.kind === 'web' ? `runs on: ${recipe.app.matches.join(', ')}` : `injects into: ${recipe.app.urlPrefix || 'every window of the app'}`)
    for (const f of recipe.features) lines.push(`feature script: ${f.slice(recipe.root.length + 1)}`)
  }
  for (const [name, a] of Object.entries(recipe.actions)) lines.push(`ACTION ${name}: runs ${basename(a.command)} ${a.args.join(' ')} (local command, called from the page)`)
  for (const [k, v] of Object.entries(recipe.raw.app?.env || {})) lines.push(`env for the started process: ${k}=${v}`)
  if (recipe.app.args?.length) lines.push(`arguments: ${recipe.app.args.join(' ')}`)
  for (const i of recipe.app.install || []) lines.push(`copies ${i.from.slice(recipe.root.length + 1)} -> ${i.to} (backup kept, undo with reset)`)
  if (recipe.kind === 'android' && recipe.language) lines.push(`sets the app language of ${recipe.app.package} to ${recipe.language.code}`)
  return lines
}

export async function doctorRecipe(recipe) {
  const rows = []
  const add = (name, ok, detail) => rows.push({ name, ok, detail })
  if (recipe.kind === 'android') {
    const devices = tryRun(recipe.app.adb, ['devices'])
    add('adb', !!devices, devices ? devices.split('\n').slice(1).filter(Boolean).join('; ') || 'no device connected' : 'adb not found')
  } else {
    add('target', existsSync(recipe.app.exe), recipe.app.exe || '(no exe for this platform)')
  }
  const versions = existsSync(recipe.app.exe || '') ? installedVersions(recipe) : []
  const tested = recipe.tested?.version
  if (recipe.kind !== 'web' && (versions.length || tested)) {
    const same = !tested || !versions.length || versions.some(v => v === tested || v.startsWith(`${tested}.`))
    add('version', same, `installed ${versions.join(' / ') || 'unknown'} · recipe tested with ${tested || 'nothing yet'}${same ? '' : ' -> the app changed: run inspect + check (language) and re-verify features'}`)
  }
  if (recipe.kind !== 'android' && recipe.app.exeName) {
    const session = await runningSession(recipe)
    const running = isRunning(recipe.app.exeName)
    add('state', true, session ? `running with this recipe (launcher pid ${session.pid}${session.owned ? '' : ', launcher gone: the next launch takes over'})` : running && recipe.kind !== 'web' ? 'running WITHOUT the recipe (launch asks to restart it)' : 'not running')
  }
  if (recipe.language?.pack) {
    const { base, namespace } = recipe.language.i18n
    const dump = join(recipe.inspectDir, `strings.${base}.${namespace}.json`)
    if (existsSync(dump)) {
      const source = readJson(dump)
      const pack = readJson(recipe.language.pack)
      const missing = Object.keys(source).filter(k => !(k in pack) && source[k].trim()).length
      add('language pack', missing === 0, `${Object.keys(pack).length} keys; ${missing} missing against the last inspect (${statSync(dump).mtime.toISOString().slice(0, 10)})`)
    } else add('language pack', true, `${Object.keys(readJson(recipe.language.pack)).length} keys (no inspect dump here to compare)`)
  }
  const v = validateRecipe(recipe.root)
  add('recipe', !v.problems.length, v.problems.length ? v.problems.join('; ') : v.warnings.join('; ') || 'valid')
  return { rows, trust: trustSummary(recipe) }
}
