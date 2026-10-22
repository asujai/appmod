#!/usr/bin/env node
// appmod command line. Run `node bin/appmod.mjs help`.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, cpSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { loadRecipe, projectRoot, templateDir } from '../core/recipe.mjs'
import { launch, buildBundle, makeLogger } from '../core/launcher.mjs'
import { evaluate } from '../core/cdp.mjs'
import { samePlaceholders } from '../core/placeholders.mjs'

const HELP = `appmod: personal language packs and small features for installed desktop apps

Usage: node bin/appmod.mjs <command> [recipe] [options]

  list                       recipes in ./recipes
  new <id>                   create recipes/<id> from the template
  inspect <recipe>           start the app, detect its i18n setup, dump its strings to <recipe>/inspect/
        --wait <s>           seconds to let the UI settle before reading (default 8)
  check <recipe>             compare the language pack with the dumped strings (keys, placeholders)
  launch <recipe>            start the app with the recipe applied (stays running until the app exits)
        --force              start even if the app seems to be running already
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
        console.log(`${id.padEnd(20)} ${r.name} · ${r.language ? r.language.code : 'no language'} · ${t}`)
      } catch (error) {
        console.log(`${id.padEnd(20)} INVALID: ${error.message.split('\n')[0]}`)
      }
    }
  },

  new() {
    if (!target || !/^[a-z0-9][a-z0-9-]*$/.test(target)) fail('new <id>: id must be kebab-case')
    const dest = join(projectRoot, 'recipes', target)
    if (existsSync(dest)) fail(`${dest} already exists`)
    cpSync(templateDir, dest, { recursive: true })
    const file = join(dest, 'recipe.json')
    writeFileSync(file, readFileSync(file, 'utf8').replace(/"id": "[^"]*"/, `"id": "${target}"`))
    console.log(`created ${dest}\nnext: fill app.exe in recipe.json, then run: node bin/appmod.mjs inspect ${target}`)
  },

  async inspect() {
    const recipe = loadRecipe(recipeDir(target))
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
    await launch(recipe, { force: flag('force') }).catch(error => {
      makeLogger(recipe.logFile)(`failed: ${error.message}`)
      fail(error.message)
    })
    process.exit(0)
  },

  shortcut() {
    if (process.platform !== 'win32') fail('shortcut is Windows-only for now; run `node bin/appmod.mjs launch <recipe>` from your launcher instead')
    const recipe = loadRecipe(recipeDir(target))
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

const run = commands[command || 'help']
if (!run) fail(`unknown command "${command}"\n\n${HELP}`)
await run()
