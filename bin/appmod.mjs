#!/usr/bin/env node
// appmod command line. Run `node bin/appmod.mjs help`.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, cpSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { loadRecipe, projectRoot, templateDir } from '../core/recipe.mjs'
import { launch, buildBundle, makeLogger } from '../core/launcher.mjs'
import { evaluate } from '../core/cdp.mjs'
import { samePlaceholders } from '../core/placeholders.mjs'
import { analyzeApp, reportMarkdown, searchApp, findAppSource } from '../core/analyze.mjs'
import { openLive, liveScripts } from '../core/live.mjs'
import { buildExtension } from '../core/extension.mjs'
import { runRea, reaCommand } from '../core/rea.mjs'
import { androidInfo, applyAppLocale, resetAppLocale, startApp, pullApk, apkLocales } from '../core/android.mjs'
import { installFiles, resetFiles, startNative } from '../core/native.mjs'

const HELP = `appmod: personal language packs and small features for installed desktop apps

Usage: node bin/appmod.mjs <command> [recipe] [options]

  list                       recipes in ./recipes
  new <id> [--kind k]        create recipes/<id> from a template (electron, web, android, native)

 Understand the app (static, the app does not need to run):
  analyze <recipe>           fuses, code location, i18n libraries, locale files, env vars, switches,
                             plugin paths, IPC, obfuscation -> <recipe>/analysis/report.{md,json}
        --exe <path>         analyze an exe directly (no recipe needed; prints the report)
  search <recipe> <regex>    search the app's code with context (--files <part> --context <n> --max <n>
                             --modules to include node_modules)
  asar <recipe> list [part]  list files in the app's code
  asar <recipe> cat <path>   print one file from the app's code
  asar <recipe> extract      copy the app's code to <recipe>/analysis/source/ (read-only copy)

 Observe and drive the running app (after launch):
  live <recipe> pages        windows the app has open
  live <recipe> eval <js>    evaluate an expression in the app window (awaits promises)
  live <recipe> text [css]   visible text of the page or of one element
  live <recipe> html <css>   outerHTML of one element
  live <recipe> anchors [css] elements with stable attributes (for feature selectors)
  live <recipe> click <css>  click one element
  live <recipe> shot <file>  screenshot of the window (PNG)
  live <recipe> errors       appmod runtime errors in the window
  live <recipe> quit         close the app (or the web recipe's browser window) gracefully
        --page <part>        pick the window whose URL contains <part>

 Apply changes:
  inspect <recipe>           start the app, detect its i18n setup, dump its strings to <recipe>/inspect/
        --wait <s>           seconds to let the UI settle before reading (default 8)
  check <recipe>             compare the language pack with the dumped strings (keys, placeholders)
  launch <recipe>            start the app with the recipe applied (stays running until the app exits)
        --force              start even if the app seems to be running already
        --allow-app-dir      native: allow install targets inside the app or system folders
  reset <recipe>             undo what launch installed (android app language, native files)
  extension <recipe>         web recipes: build an unpacked browser extension in <recipe>/dist/extension
  rea <command> [args]       run REA for targets appmod does not read itself (native, .NET, APK)
  shortcut <recipe>          create a desktop shortcut that launches the app with the recipe (Windows)
        --name <text>        shortcut name (default "<App> (<Language>)")

<recipe> is a folder path or an id under ./recipes.`

const [command, target, ...rest] = process.argv.slice(2)
const option = (name, fallback) => {
  const i = rest.indexOf(`--${name}`)
  return i === -1 ? fallback : rest[i + 1] ?? true
}
const flag = name => rest.includes(`--${name}`)

const recipeDir = value => {
  if (!value) fail('missing <recipe>')
  const local = join(projectRoot, 'recipes', value)
  return existsSync(join(local, 'recipe.json')) ? local : resolve(value)
}
const readJson = file => JSON.parse(readFileSync(file, 'utf8'))
const writeJson = (file, data) => writeFileSync(file, JSON.stringify(data, null, 1) + '\n')
function fail(message) {
  console.error(`appmod: ${message}`)
  process.exit(1)
}

const commands = {
  help: () => console.log(HELP),

  list() {
    const dir = join(projectRoot, 'recipes')
    for (const id of readdirSync(dir).filter(n => !n.startsWith('_'))) {
      try {
        const r = loadRecipe(join(dir, id))
        const t = r.tested ? `tested ${r.tested.version} on ${r.tested.platform}` : 'untested'
        console.log(`${id.padEnd(20)} ${r.kind.padEnd(8)} ${r.name} · ${r.language ? r.language.code : 'no language'} · ${t}`)
      } catch (error) {
        console.log(`${id.padEnd(20)} INVALID: ${error.message.split('\n')[0]}`)
      }
    }
  },

  new() {
    if (!target || !/^[a-z0-9][a-z0-9-]*$/.test(target)) fail('new <id>: id must be kebab-case')
    const dest = join(projectRoot, 'recipes', target)
    if (existsSync(dest)) fail(`${dest} already exists`)
    const kind = option('kind', 'electron')
    const template = kind === 'electron' ? templateDir : `${templateDir}-${kind}`
    if (!existsSync(template)) fail(`--kind must be electron, web, android or native`)
    cpSync(template, dest, { recursive: true })
    const file = join(dest, 'recipe.json')
    writeFileSync(file, readFileSync(file, 'utf8').replace(/"id": "[^"]*"/, `"id": "${target}"`))
    const next = { electron: 'fill app.exe, then: analyze', web: 'fill startUrl and matches, then: launch', android: 'fill app.package, then: analyze', native: 'fill app.exe and install, then: analyze' }
    console.log(`created ${dest} (${kind})\nnext: ${next[kind]} ${target}`)
  },

  analyze() {
    const exe = target === '--exe' ? rest[0] : option('exe')
    if (exe && exe !== true) {
      console.log(reportMarkdown(analyzeApp(resolve(exe))))
      return
    }
    const recipe = loadRecipe(recipeDir(target))
    mkdirSync(recipe.analysisDir, { recursive: true })
    if (recipe.kind !== 'electron') return analyzeWithRea(recipe)
    const report = analyzeApp(recipe.app.exe)
    mkdirSync(recipe.analysisDir, { recursive: true })
    writeJson(join(recipe.analysisDir, 'report.json'), report)
    const md = reportMarkdown(report)
    writeFileSync(join(recipe.analysisDir, 'report.md'), md)
    console.log(md)
    console.log(`written to ${recipe.analysisDir}`)
  },

  search() {
    const recipe = loadRecipe(recipeDir(target))
    needKind(recipe, 'electron')
    if (!rest[0] || rest[0].startsWith('--')) fail('search <recipe> <regex>')
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
      const dest = join(recipe.analysisDir, 'source')
      let n = 0
      for (const f of source.list()) {
        if (!flag('modules') && f.path.includes('node_modules/')) continue
        const out = join(dest, f.path)
        mkdirSync(join(out, '..'), { recursive: true })
        writeFileSync(out, source.read(f.path))
        n++
      }
      console.log(`${n} files copied to ${dest} (node_modules skipped unless --modules)`)
    } else fail('asar <recipe> list|cat|extract')
  },

  async live() {
    const recipe = loadRecipe(recipeDir(target))
    needKind(recipe, 'electron', 'web')
    const [sub, arg] = rest.filter((a, i) => !a.startsWith('--') && !rest[i - 1]?.startsWith('--'))
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
      } else if (sub === 'eval') {
        if (!arg) fail('live <recipe> eval <expression>')
        console.log(JSON.stringify(await session.eval(arg), null, 1))
      } else if (liveScripts[sub]) {
        if ((sub === 'html' || sub === 'click' || sub === 'count') && !arg) fail(`live <recipe> ${sub} <css>`)
        const value = await session.eval(liveScripts[sub](arg))
        console.log(typeof value === 'string' ? value : JSON.stringify(value, null, 1))
      } else fail('live <recipe> pages|eval|text|html|anchors|click|shot|errors|quit')
    } finally {
      session.close()
    }
    process.exit(0)
  },

  async inspect() {
    const recipe = loadRecipe(recipeDir(target))
    if (recipe.kind === 'android') return console.log(JSON.stringify(androidInfo(recipe), null, 1))
    needKind(recipe, 'electron', 'web')
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

  async launch() {
    const recipe = loadRecipe(recipeDir(target))
    if (recipe.kind === 'android') {
      const info = recipe.language ? applyAppLocale(recipe) : androidInfo(recipe)
      startApp(recipe)
      console.log(`${info.model}: ${info.package} ${info.version || ''} started${recipe.language ? `, app language now ${info.appLocales}` : ''}`)
      return
    }
    if (recipe.kind === 'native') {
      const installed = installFiles(recipe, { allowAppDir: flag('allow-app-dir') })
      const pid = startNative(recipe)
      console.log(`started ${recipe.app.exe} (pid ${pid})${installed.length ? `; ${installed.length} installed item(s), undo with: node bin/appmod.mjs reset ${recipe.id}` : ''}`)
      return
    }
    await launch(recipe, { force: flag('force') }).catch(error => {
      makeLogger(recipe.logFile)(`failed: ${error.message}`)
      fail(error.message)
    })
    process.exit(0)
  },

  reset() {
    const recipe = loadRecipe(recipeDir(target))
    if (recipe.kind === 'android') console.log(`app language cleared: ${resetAppLocale(recipe) ?? '(follows system)'}`)
    else if (recipe.kind === 'native') console.log(`removed ${resetFiles(recipe).length} installed item(s), backups restored`)
    else if (recipe.kind === 'web') console.log(`nothing installed. The browser profile stays at ${recipe.app.profile}; delete that folder to remove its logins and data.`)
    else console.log('nothing to reset: electron recipes change the app only while appmod launches it.')
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
    const { how, output } = runRea([target, ...rest])
    process.stdout.write(output)
    console.error(`(via ${how})`)
  },

  shortcut() {
    if (process.platform !== 'win32') fail('shortcut is Windows-only for now; run `node bin/appmod.mjs launch <recipe>` from your launcher instead')
    const recipe = loadRecipe(recipeDir(target))
    if (recipe.kind === 'android') fail('shortcuts are for desktop recipes')
    const name = option('name', `${recipe.name}${recipe.language?.name ? ` (${recipe.language.name})` : ''}`)
    const dir = join(process.env.LOCALAPPDATA, 'appmod')
    mkdirSync(dir, { recursive: true })
    const vbs = join(dir, `launch-${recipe.id}.vbs`)
    const q = s => s.replace(/"/g, '""')
    // A .vbs wrapper starts node without a console window.
    writeFileSync(
      vbs,
      `' Generated by appmod: starts ${q(recipe.name)} with recipe ${recipe.id}\r\n` +
        `CreateObject("WScript.Shell").Run """${q(process.execPath)}"" ""${q(join(projectRoot, 'bin', 'appmod.mjs'))}"" launch ""${q(recipe.root)}""", 0, False\r\n`,
    )
    const ps = `$d=[Environment]::GetFolderPath('Desktop');$s=(New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $d $env:APPMOD_NAME)+'.lnk');$s.TargetPath='wscript.exe';$s.Arguments='"'+$env:APPMOD_VBS+'"';$s.IconLocation=$env:APPMOD_ICON+',0';$s.Description='appmod';$s.Save();Write-Output (Join-Path $d $env:APPMOD_NAME)`
    const out = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], {
      encoding: 'utf8',
      env: { ...process.env, APPMOD_NAME: name, APPMOD_VBS: vbs, APPMOD_ICON: recipe.app.exe },
    })
    console.log(`shortcut: ${out.trim()}.lnk -> ${vbs}`)
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
    console.log('web: the site code is read live. Run `live <id> anchors` / `eval`; for a static bundle report, with the recipe launched:')
    console.log(`  node bin/appmod.mjs rea list-browser-targets <endpoint>  then  rea analyze-web-bundle <endpoint> <targetId>`)
  }
}

const run = commands[command || 'help']
if (!run) fail(`unknown command "${command}"\n\n${HELP}`)
await run()
