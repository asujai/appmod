#!/usr/bin/env node
// appmod command line. Run `node bin/appmod.mjs help`.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, cpSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { loadRecipe, projectRoot, templateDir, INJECTABLE } from '../core/recipe.mjs'
import { launch, buildBundle, makeLogger, isRunning } from '../core/launcher.mjs'
import { evaluate } from '../core/cdp.mjs'
import { samePlaceholders } from '../core/placeholders.mjs'
import { analyzeApp, reportMarkdown, searchApp, findAppSource, detectKind, analyzeWebview, webviewReportMarkdown } from '../core/analyze.mjs'
import { openLive, liveScripts } from '../core/live.mjs'
import { buildExtension } from '../core/extension.mjs'
import { runRea, reaCommand } from '../core/rea.mjs'
import { androidInfo, applyAppLocale, resetAppLocale, startApp, pullApk, apkLocales } from '../core/android.mjs'
import { installFiles, resetFiles, startNative } from '../core/native.mjs'
import { createShortcut, askYesNo, notify, stopApp } from '../core/desktop.mjs'
import { installSkill, removeSkill, AGENTS } from '../core/setup.mjs'
import { validateRecipe, validateAll, doctorEnvironment, doctorRecipe } from '../core/doctor.mjs'

const HELP = `appmod: personal languages, looks and small features for the apps and sites you use

Usage: node bin/appmod.mjs <command> [recipe] [options]

 Start here:
  setup [--agent a,b] [--remove]  install the appmod skill into your coding agents
                             (${Object.keys(AGENTS).join(', ')}; default: the ones found on this machine)
  doctor [recipe]            what this machine has; for a recipe: target, version vs. tested,
                             running state, and everything the recipe will run
  list                       recipes in ./recipes
  new <id> [--kind k]        create recipes/<id> from a template (electron, webview, web, android, native)

 Understand the target (static, nothing runs):
  analyze <recipe>           electron: fuses, i18n, locale files, env vars, switches, plugin paths,
                             IPC, obfuscation; webview: engine and UI files; android: shipped
                             languages; native: REA -> <recipe>/analysis/
        --exe <path>         detect the kind of any exe and analyze it (no recipe needed)
  search <recipe> <regex>    search an Electron app's code (--files <part> --context <n> --max <n> --modules)
  asar <recipe> list [part]  list files in an Electron app's code
  asar <recipe> cat <path>   print one file
  asar <recipe> extract      read-only copy to <recipe>/analysis/source/

 Observe and drive the running target (after launch):
  live <recipe> pages        windows / tabs
  live <recipe> text [css]   visible text of the page or of one element
  live <recipe> anchors [css] elements with stable attributes (selectors for features)
  live <recipe> html <css>   outerHTML of one element
  live <recipe> eval <js>    evaluate in the page (promises are awaited)
  live <recipe> click <css>  click one element
  live <recipe> go <url>     open a URL in the current tab (web recipes)
  live <recipe> shot <file>  screenshot (PNG)
  live <recipe> errors       runtime errors, i18n hook, missing pack keys, injected controls
  live <recipe> missing      write the strings the pack lacks (after an app update) to inspect/
  live <recipe> quit         close the app or the recipe's browser window
        --page <part>        pick the window whose URL contains <part>

 Apply changes:
  inspect <recipe>           start the target, detect its i18n setup, dump its strings to <recipe>/inspect/
        --wait <s>           seconds to let the UI settle before reading (default 8)
  check <recipe>             language pack vs. dumped strings: missing keys, broken placeholders
  validate [recipe|--all]    static checks: recipe loads, scripts parse, packs are well-formed
  launch <recipe>            start the target with the recipe (stays running until it exits).
                             If it already runs with the recipe: new tab (web) or bring to front.
        --restart            quit a copy that runs without the recipe first (unsaved work may be lost)
        --gui                ask before restarting, show errors in a dialog (used by shortcuts)
        --headless           web: run the browser without a window (checks, CI)
        --force              start even if the app seems to be running already
        --allow-app-dir      native: allow install targets inside the app or system folders
  shortcut <recipe>          desktop shortcut that launches the recipe: one click for the user
        --name <text>        shortcut name (default "<App> (<Language>)" or "<App> (appmod)")
  extension <recipe>         web: unpacked browser extension in <recipe>/dist/extension
  reset <recipe>             undo what launch installed (android app language, native files)
  rea <command> [args]       run REA for targets appmod does not read itself (native, .NET, APK)

<recipe> is a folder path or an id under ./recipes.`

// Options may come anywhere (`launch --restart qoder`, `setup --agent claude`). These take a
// value; a following --flag is never taken as one.
const VALUE_OPTIONS = new Set(['agent', 'kind', 'exe', 'files', 'context', 'max', 'page', 'wait', 'name'])
const argv = process.argv.slice(2)
const command = argv[0]
const opts = {}
const positional = []
for (let i = 1; i < argv.length; i++) {
  const a = argv[i]
  if (a.startsWith('--') && a.length > 2) {
    const name = a.slice(2)
    const next = argv[i + 1]
    opts[name] = VALUE_OPTIONS.has(name) && next !== undefined && !next.startsWith('--') ? argv[++i] : true
  } else positional.push(a)
}
const [target, ...rest] = positional
const GUI = opts.gui === true
const option = (name, fallback) => (typeof opts[name] === 'string' ? opts[name] : fallback)
const flag = name => opts[name] !== undefined

const recipeDir = value => {
  if (!value || value.startsWith('--')) fail('missing <recipe>')
  const local = join(projectRoot, 'recipes', value)
  return existsSync(join(local, 'recipe.json')) ? local : resolve(value)
}
const readJson = file => JSON.parse(readFileSync(file, 'utf8'))
const writeJson = (file, data) => writeFileSync(file, JSON.stringify(data, null, 1) + '\n')
function fail(message) {
  console.error(`appmod: ${message}`)
  // Started from a shortcut there is no console: show the error instead of failing silently.
  if (GUI) notify('appmod', message)
  process.exit(1)
}
const mark = ok => (ok ? 'ok ' : '!! ')

// When the app already runs without the recipe: quit it if the user agreed (--restart, or yes
// in the dialog). Returns true when it is gone.
async function makeRoom(recipe) {
  if (flag('restart')) return stopApp(recipe.app.exeName)
  if (!GUI) return false
  const yes = askYesNo(`${recipe.name}`, `${recipe.name} is already running without your changes.\n\nRestart it with them now? Unsaved work in ${recipe.name} may be lost.`)
  // No dialog tool on this system: fail() tells the user what to do instead.
  if (yes === null) return false
  if (!yes) process.exit(0)
  return stopApp(recipe.app.exeName)
}

const commands = {
  help: () => console.log(HELP),

  setup() {
    const agent = option('agent', '')
    const agents = typeof agent === 'string' && agent ? agent.split(',').map(a => a.trim()) : []
    if (flag('remove')) {
      const removed = removeSkill({ agents })
      console.log(removed.length ? removed.map(r => `removed ${r.dir}`).join('\n') : 'no appmod skill installed by setup')
      return
    }
    const results = installSkill({ agents, force: flag('force') })
    if (!results.length) {
      console.log(`No coding agent found in your home folder. Pick one: setup --agent ${Object.keys(AGENTS).join('|')}`)
      return
    }
    for (const r of results) console.log(`${r.status === 'installed' ? 'installed' : r.status}: ${r.label} -> ${r.dir}`)
    console.log(`\nNow ask your agent, in your own words, e.g. "Add Turkish to <app>" or "Put a dark theme on <site>".
Re-run setup after updating appmod.`)
  },

  async doctor() {
    if (!target) {
      for (const r of doctorEnvironment()) console.log(`${mark(r.ok)}${r.name.padEnd(28)} ${r.detail}`)
      return
    }
    const recipe = loadRecipe(recipeDir(target))
    const { rows, trust } = await doctorRecipe(recipe)
    console.log(`${recipe.name} (${recipe.id}, ${recipe.kind})`)
    for (const r of rows) console.log(`${mark(r.ok)}${r.name.padEnd(14)} ${r.detail}`)
    console.log('\nThis recipe will:')
    for (const t of trust) console.log(`  - ${t}`)
    if (!trust.length) console.log('  - nothing (empty recipe)')
  },

  list() {
    const dir = join(projectRoot, 'recipes')
    for (const id of readdirSync(dir).filter(n => !n.startsWith('_') && existsSync(join(dir, n, 'recipe.json')))) {
      try {
        const r = loadRecipe(join(dir, id))
        const t = r.tested ? `tested ${r.tested.version} on ${r.tested.platform}` : 'untested'
        const what = [r.language && `language ${r.language.code}`, r.features.length && `${r.features.length} feature(s)`].filter(Boolean).join(', ') || 'empty'
        console.log(`${id.padEnd(20)} ${r.kind.padEnd(8)} ${r.name} · ${what} · ${t}`)
      } catch (error) {
        console.log(`${id.padEnd(20)} INVALID: ${error.message.split('\n')[1] || error.message}`)
      }
    }
  },

  new() {
    if (!target || !/^[a-z0-9][a-z0-9-]*$/.test(target)) fail('new <id>: id must be kebab-case')
    const dest = join(projectRoot, 'recipes', target)
    if (existsSync(dest)) fail(`${dest} already exists`)
    const kind = option('kind', 'electron')
    const template = kind === 'electron' ? templateDir : `${templateDir}-${kind}`
    if (!existsSync(template)) fail(`--kind must be electron, webview, web, android or native`)
    cpSync(template, dest, { recursive: true })
    const file = join(dest, 'recipe.json')
    writeFileSync(file, readFileSync(file, 'utf8').replace(/"id": "[^"]*"/, `"id": "${target}"`))
    const next = {
      electron: 'fill app.exe, then: analyze',
      webview: 'fill app.exe and app.engine (analyze --exe tells you), then: launch',
      web: 'fill startUrl and matches, then: launch',
      android: 'fill app.package, then: analyze',
      native: 'fill app.exe and install, then: analyze',
    }
    console.log(`created ${dest} (${kind})\nnext: ${next[kind]} ${target}`)
  },

  analyze() {
    const exe = option('exe')
    if (exe && exe !== true) {
      const path = resolve(exe)
      const kind = detectKind(path)
      console.log(`kind: ${kind.kind}${kind.engine ? ` (engine ${kind.engine})` : ''} — ${kind.evidence.join('; ')}\n`)
      if (kind.kind === 'electron') console.log(reportMarkdown(analyzeApp(path)))
      else if (kind.kind === 'webview') console.log(webviewReportMarkdown(analyzeWebview(path, kind.engine)))
      else console.log('Not a web-technology app: no injection. Look for official routes (language folder, plugins, documented switches) and read its code with REA: node bin/appmod.mjs rea inspect-desktop-application <folder> --json')
      return
    }
    const recipe = loadRecipe(recipeDir(target))
    if (recipe.app.unavailable) fail(`cannot analyze ${recipe.id} here: ${recipe.app.unavailable}`)
    mkdirSync(recipe.analysisDir, { recursive: true })
    if (recipe.kind === 'webview') {
      const report = analyzeWebview(recipe.app.exe, recipe.app.engine)
      writeJson(join(recipe.analysisDir, 'report.json'), report)
      const md = webviewReportMarkdown(report)
      writeFileSync(join(recipe.analysisDir, 'report.md'), md)
      console.log(md)
      return
    }
    if (recipe.kind !== 'electron') return analyzeWithRea(recipe)
    const report = analyzeApp(recipe.app.exe)
    writeJson(join(recipe.analysisDir, 'report.json'), report)
    const md = reportMarkdown(report)
    writeFileSync(join(recipe.analysisDir, 'report.md'), md)
    console.log(md)
    console.log(`written to ${recipe.analysisDir}`)
  },

  search() {
    const recipe = loadRecipe(recipeDir(target))
    needKind(recipe, 'electron')
    if (!rest[0]) fail('search <recipe> <regex>')
    const { hits, truncated } = searchApp(recipe.app.exe, rest[0], {
      files: option('files', ''),
      context: Number(option('context', 120)),
      max: Number(option('max', 40)),
      includeModules: flag('modules'),
    })
    for (const h of hits) console.log(`${h.path}@${h.offset}: ${h.snippet}\n`)
    console.log(`${hits.length} hit(s)${truncated ? ' (stopped at --max)' : ''}`)
  },

  asar() {
    const recipe = loadRecipe(recipeDir(target))
    needKind(recipe, 'electron')
    const { source } = findAppSource(recipe.app.exe)
    if (!source) fail('app code not found next to the exe')
    const [sub, arg] = rest
    if (sub === 'list') {
      for (const f of source.list()) if (!arg || f.path.includes(arg)) console.log(`${String(f.size).padStart(10)}  ${f.path}${f.unpacked ? '  (unpacked)' : ''}`)
    } else if (sub === 'cat') {
      if (!arg) fail('asar <recipe> cat <path>')
      process.stdout.write(source.read(arg))
    } else if (sub === 'extract') {
      const dest = resolve(recipe.analysisDir, 'source')
      let n = 0
      for (const f of source.list()) {
        if (!flag('modules') && f.path.includes('node_modules/')) continue
        const out = resolve(dest, f.path)
        // Archive entry names come from the app: never let "../" write outside the copy.
        if (!out.startsWith(dest + sep)) {
          console.log(`skipped ${f.path} (points outside the copy)`)
          continue
        }
        mkdirSync(join(out, '..'), { recursive: true })
        writeFileSync(out, source.read(f.path))
        n++
      }
      console.log(`${n} files copied to ${dest} (node_modules skipped unless --modules)`)
    } else fail('asar <recipe> list|cat|extract')
  },

  async live() {
    const recipe = loadRecipe(recipeDir(target))
    needKind(recipe, ...INJECTABLE)
    const [sub, arg] = rest
    const session = await openLive(recipe, { match: option('page', '') }).catch(error => fail(error.message))
    try {
      if (sub === 'quit') {
        await session.quit()
        console.log('closed')
      } else if (sub === 'pages') {
        for (const p of session.pages) console.log(`${p === session.target ? '*' : ' '} ${p.title} | ${p.url}`)
      } else if (sub === 'shot') {
        const file = resolve(arg || join(recipe.analysisDir, 'shot.png'))
        mkdirSync(join(file, '..'), { recursive: true })
        await session.screenshot(file)
        console.log(file)
      } else if (sub === 'go') {
        if (!arg) fail('live <recipe> go <url>')
        await session.go(arg)
        console.log(`opened ${arg}`)
      } else if (sub === 'missing') {
        // After an app update: the strings the pack lacks, read from the running app itself, so
        // no separate inspect run is needed. Same file `check` writes.
        if (!recipe.language?.pack) fail('missing: the recipe has no language pack')
        const { base, namespace } = recipe.language.i18n
        const original = await session.eval(`__appmod.dumpOriginal(${JSON.stringify(base)}, ${JSON.stringify(namespace)})`)
        const keys = await session.eval('__appmod.missing()')
        const missing = Object.fromEntries(keys.map(k => [k, original[k]]))
        mkdirSync(recipe.inspectDir, { recursive: true })
        // Refresh the dump too, so `check` compares against what the app has now.
        writeJson(join(recipe.inspectDir, `strings.${base}.${namespace}.json`), original)
        const file = resolve(arg || join(recipe.inspectDir, `missing.${recipe.language.code}.json`))
        writeJson(file, missing)
        console.log(`${keys.length} missing key(s) written to ${file} (the app has ${Object.keys(original).length} strings now). Translate the values, merge them into ${recipe.language.pack}, run check.`)
      } else if (sub === 'eval') {
        if (!arg) fail('live <recipe> eval <expression>')
        console.log(JSON.stringify(await session.eval(arg), null, 1))
      } else if (liveScripts[sub]) {
        if ((sub === 'html' || sub === 'click' || sub === 'count') && !arg) fail(`live <recipe> ${sub} <css>`)
        const value = await session.eval(liveScripts[sub](arg))
        console.log(typeof value === 'string' ? value : JSON.stringify(value, null, 1))
      } else fail('live <recipe> pages|text|anchors|html|eval|click|go|shot|errors|missing|quit')
    } finally {
      session.close()
    }
    process.exit(0)
  },

  async inspect() {
    const recipe = loadRecipe(recipeDir(target))
    if (recipe.kind === 'android') return console.log(JSON.stringify(androidInfo(recipe), null, 1))
    needKind(recipe, ...INJECTABLE)
    const wait = Number(option('wait', 8)) * 1000
    mkdirSync(recipe.inspectDir, { recursive: true })
    const log = makeLogger(recipe.logFile)
    // Inspect with the runtime only: no language pack, so the captured strings are the originals.
    const bundle = buildBundle(recipe, { withLanguage: false, withFeatures: false })
    let index = 0
    let done = false
    await Promise.race([
      launch(recipe, {
        bundle,
        force: flag('force'),
        headless: flag('headless'),
        log,
        async onPage(cdp, sessionId, info) {
          if (recipe.app.urlPrefix && !info.url.startsWith(recipe.app.urlPrefix)) return
          await new Promise(r => setTimeout(r, wait))
          const n = index++
          try {
            const report = await evaluate(cdp, sessionId, 'window.__appmod.detect()')
            report.visibleText = await evaluate(cdp, sessionId, 'window.__appmod.visibleText()')
            writeJson(join(recipe.inspectDir, `page-${n}.json`), report)
            for (const [lng, namespaces] of Object.entries(report.namespaces)) {
              for (const ns of namespaces) {
                const strings = await evaluate(cdp, sessionId, `window.__appmod.dumpOriginal(${JSON.stringify(lng)}, ${JSON.stringify(ns)})`)
                writeJson(join(recipe.inspectDir, `strings.${lng}.${ns}.json`), strings)
                console.log(`strings.${lng}.${ns}.json: ${Object.keys(strings).length} keys`)
              }
            }
            console.log(`page-${n}.json: ${report.url}\n  found: ${JSON.stringify(report.found)}\n  visible text: ${report.visibleText.length} strings`)
            if (report.errors.length) console.log(`  runtime errors: ${report.errors.join('; ')}`)
          } catch (error) {
            console.log(`page ${info.url}: ${error.message}`)
          }
          if (!done) {
            done = true
            console.log(`\nwritten to ${recipe.inspectDir}. The app keeps running; quit it before launching with the recipe.`)
            setTimeout(() => process.exit(0), 500)
          }
        },
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('no matching window within 90 s (check app.pageFilter.urlPrefix)')), 90000)),
    ]).catch(error => fail(error.message))
  },

  check() {
    const recipe = loadRecipe(recipeDir(target))
    const lang = recipe.language
    if (!lang) fail('recipe has no "language" block')
    let problems = 0
    if (lang.pack) {
      const { base, namespace } = lang.i18n
      const baseFile = join(recipe.inspectDir, `strings.${base}.${namespace}.json`)
      const pack = readJson(lang.pack)
      if (!existsSync(baseFile)) {
        console.log(`no ${baseFile}; run inspect first. Checking the pack on its own.`)
      }
      const source = existsSync(baseFile) ? readJson(baseFile) : null
      const missing = {}
      const extra = []
      const broken = []
      const empty = []
      let same = 0
      for (const [key, value] of Object.entries(pack)) {
        // Empty is only wrong when the app's own string is not empty too.
        const blank = typeof value !== 'string' || !value.trim()
        if (blank && (!source || (source[key] || '').trim())) empty.push(key)
        if (!source) continue
        if (!(key in source)) extra.push(key)
        else if (!samePlaceholders(source[key], value)) broken.push(key)
        else if (source[key] === value) same++
      }
      if (source) for (const [key, value] of Object.entries(source)) if (!(key in pack)) missing[key] = value
      const total = source ? Object.keys(source).length : Object.keys(pack).length
      console.log(`pack ${lang.pack}\n  keys in app: ${source ? total : '?'} · translated: ${Object.keys(pack).length - extra.length} · missing: ${Object.keys(missing).length} · same as source: ${same}`)
      if (Object.keys(missing).length) {
        const file = join(recipe.inspectDir, `missing.${lang.code}.json`)
        writeJson(file, missing)
        console.log(`  missing keys written to ${file} (translate these and merge into the pack)`)
      }
      for (const key of broken) console.log(`  PLACEHOLDER MISMATCH ${key}\n    source: ${source[key]}\n    pack:   ${pack[key]}`)
      for (const key of extra) console.log(`  NOT IN APP ${key} (renamed or removed upstream?)`)
      for (const key of empty) console.log(`  EMPTY ${key}${source ? '' : ' (run inspect to see if the original is empty too)'}`)
      problems += broken.length + (source ? empty.length : 0)
    }
    if (lang.text) {
      const text = readJson(lang.text)
      for (const [en, tr] of Object.entries(text)) {
        if (!samePlaceholders(en, tr)) {
          console.log(`  TEXT PLACEHOLDER MISMATCH "${en}" -> "${tr}"`)
          problems++
        }
      }
      console.log(`text map ${lang.text}: ${Object.keys(text).length} entries`)
    }
    if (problems) fail(`${problems} problem(s)`)
    console.log('ok')
  },

  validate() {
    const results = !target || target === '--all' ? validateAll(join(projectRoot, 'recipes')) : [validateRecipe(recipeDir(target))]
    let bad = 0
    for (const r of results) {
      if (r.problems.length) bad++
      console.log(`${mark(!r.problems.length)}${r.id}`)
      for (const p of r.problems) console.log(`     problem: ${p}`)
      for (const w of r.warnings) console.log(`     note: ${w}`)
    }
    if (bad) fail(`${bad} recipe(s) with problems`)
  },

  async launch() {
    const recipe = loadRecipe(recipeDir(target))
    if (recipe.kind === 'android') {
      const info = recipe.language ? applyAppLocale(recipe) : androidInfo(recipe)
      startApp(recipe)
      console.log(`${info.model}: ${info.package} ${info.version || ''} started${recipe.language ? `, app language now ${info.appLocales}` : ''}`)
      return
    }
    if (recipe.kind === 'native') {
      if (recipe.app.unavailable) fail(`cannot start ${recipe.id} here: ${recipe.app.unavailable}`)
      // Arguments and env reach only a fresh process; a running single-instance app ignores them.
      if (!flag('force') && isRunning(recipe.app.exeName) && !(await makeRoom(recipe))) {
        fail(`${recipe.app.exeName} is already running. Quit it first, or run launch --restart.`)
      }
      const installed = installFiles(recipe, { allowAppDir: flag('allow-app-dir') })
      const pid = startNative(recipe)
      console.log(`started ${recipe.app.exe} (pid ${pid})${installed.length ? `; ${installed.length} installed item(s), undo with: node bin/appmod.mjs reset ${recipe.id}` : ''}`)
      return
    }
    if (flag('headless') && recipe.kind !== 'web') fail('--headless is for web recipes')
    const result = await launch(recipe, { force: flag('force'), headless: flag('headless'), beforeStart: () => makeRoom(recipe) }).catch(error => {
      makeLogger(recipe.logFile)(`failed: ${error.message}`)
      fail(error.message)
    })
    if (result?.reused) console.log(`${recipe.name} already runs with the recipe; ${recipe.kind === 'web' ? 'opened a new tab' : 'brought it to the front'}.`)
    process.exit(0)
  },

  reset() {
    const recipe = loadRecipe(recipeDir(target))
    if (recipe.kind === 'android') console.log(`app language cleared: ${resetAppLocale(recipe) ?? '(follows system)'}`)
    else if (recipe.kind === 'native') console.log(`removed ${resetFiles(recipe).length} installed item(s), backups restored`)
    else if (recipe.kind === 'web') console.log(`nothing installed. The browser profile stays at ${recipe.app.profile}; delete that folder to remove its logins and data.`)
    else console.log(`nothing to reset: ${recipe.kind} recipes change the app only while appmod launches it. Start the app normally to get it unchanged.`)
  },

  extension() {
    const recipe = loadRecipe(recipeDir(target))
    const { dir, warnings } = buildExtension(recipe)
    for (const w of warnings) console.log(`note: ${w}`)
    console.log(`unpacked extension: ${dir}
load it in chrome://extensions (or edge://extensions) -> Developer mode -> Load unpacked`)
  },

  rea() {
    if (!target) fail('rea <command> [args...]: runs REA (installed, APPMOD_REA, or npx). Example: rea doctor --json')
    // REA gets its arguments untouched, flags included.
    const { how, output } = runRea(argv.slice(1))
    process.stdout.write(output)
    console.error(`(via ${how})`)
  },

  shortcut() {
    const recipe = loadRecipe(recipeDir(target))
    const label = recipe.language?.name && recipe.language.i18n?.library !== 'none' ? recipe.language.name : 'appmod'
    const name = option('name', `${recipe.name} (${label})`)
    const icon = recipe.kind === 'android' ? null : recipe.app.exe
    const files = createShortcut(recipe, { name: String(name), icon })
    console.log(`shortcut: ${files[0]}${files.length > 1 ? `\n  (${files.slice(1).join(', ')})` : ''}`)
    console.log('Double-click it to start with the recipe. If the app is already open without it, it asks to restart.')
  },
}

function needKind(recipe, ...kinds) {
  if (!kinds.includes(recipe.kind)) fail(`this command works for ${kinds.join('/')} recipes; ${recipe.id} is ${recipe.kind}`)
}

// Non-Electron analysis is delegated to REA, saved next to the recipe like the Electron report.
function analyzeWithRea(recipe) {
  const save = (name, data) => {
    const file = join(recipe.analysisDir, name)
    writeFileSync(file, typeof data === 'string' ? data : JSON.stringify(data, null, 1))
    console.log(`written ${file}`)
  }
  // REA may need its own providers (JADX for APK code, Ghidra for native); a missing one is
  // reported, not fatal, because the appmod-side facts are still useful.
  const viaRea = (name, args) => {
    const rea = reaCommand()
    if (rea.downloads) console.log(`REA is not installed; fetching rea-agents through npx (one-time download into npm's cache).`)
    try {
      save(name, runRea(args, { json: true }).output)
    } catch (error) {
      save(name.replace('.json', '.error.txt'), error.message)
      console.log(`REA step skipped: ${error.message.slice(0, 300)}`)
    }
  }
  if (recipe.kind === 'native') {
    viaRea('rea-desktop.json', ['inspect-desktop-application', join(recipe.app.exe, '..')])
  } else if (recipe.kind === 'android') {
    const info = androidInfo(recipe)
    const { out, splits } = pullApk(recipe)
    info.apk = out
    info.shippedLocales = apkLocales(out)
    if (splits) info.note = `${splits} split APK(s) not pulled; language splits may add more locales.`
    if (!info.shippedLocales) info.note = 'aapt2 not found (Android SDK build-tools); shipped languages unknown.'
    else {
      const want = recipe.language?.code
      info.requestedLanguageShipped = want ? info.shippedLocales.some(c => c === want || c.startsWith(want + '-')) : null
    }
    save('android-info.json', info)
    console.log(JSON.stringify({ version: info.version, shippedLocales: info.shippedLocales, requestedLanguageShipped: info.requestedLanguageShipped }, null, 1))
    if (flag('code')) viaRea('rea-android-package.json', ['inspect-android-package', out])
    else console.log('APK code analysis (REA + JADX) skipped; add --code to run it.')
  } else if (recipe.kind === 'web') {
    console.log('web: the site code is read live. Run `launch <id> --headless`, then `live <id> anchors` / `eval`. For a static bundle report:')
    console.log(`  node bin/appmod.mjs rea list-browser-targets <endpoint>  then  rea analyze-web-bundle <endpoint> <targetId>`)
  }
}

const run = commands[command || 'help']
if (!run) fail(`unknown command "${command}"\n\n${HELP}`)
try {
  await run()
} catch (error) {
  fail(error.message)
}
