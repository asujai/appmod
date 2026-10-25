// Starts an app (Electron, WebView2/CEF, or a browser for web recipes) with a local debugging
// port and injects the appmod runtime into every matching window before the window's own
// scripts run. The app's files are never touched.
import { spawn, execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, rmSync, statSync, existsSync, appendFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:net'
import { connect, browserUrl, evaluate } from './cdp.mjs'
import { projectRoot } from './recipe.mjs'

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

export function makeLogger(file) {
  mkdirSync(dirname(file), { recursive: true })
  return line => {
    const stamped = `[${new Date().toISOString()}] ${line}`
    try {
      appendFileSync(file, stamped + '\n')
    } catch {}
    if (process.stdout.isTTY) console.log(stamped)
  }
}

// Chrome match pattern ("https://*.example.com/*") -> regex source.
// Host wildcards stay inside the host, so "?https://a.example.com" in a query cannot match.
// Like Chrome, a pattern without a port matches any port ("http://localhost/*").
const escapeRe = s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
export function matchToRegex(pattern) {
  const m = /^(\*|https?|file):\/\/([^/]*)(\/.*)$/.exec(pattern)
  if (!m) throw new Error(`invalid match pattern: ${pattern}`)
  const scheme = m[1] === '*' ? 'https?' : m[1]
  const [, hostPart, portPart] = /^([^:]*)(?::(\d+|\*))?$/.exec(m[2]) || [, m[2]]
  const host = hostPart === '*' ? '[^/:]*' : hostPart.startsWith('*.') ? `(?:[^/:]*\\.)?${escapeRe(hostPart.slice(2))}` : escapeRe(hostPart)
  const port = portPart && portPart !== '*' ? `:${portPart}` : '(?::\\d+)?'
  const path = m[3].split('*').map(escapeRe).join('.*')
  return `^${scheme}://${host}${m[1] === 'file' ? '' : port}${path}$`
}

// A URL prefix must end at a boundary: "https://discord.com" covers "https://discord.com/app"
// but not "https://discord.com.evil.example/". Prefixes that end in / ? # or : already do.
export function prefixToRegex(prefix) {
  return `^${escapeRe(prefix)}${/[/?#:]$/.test(prefix) ? '' : '(?:[/?#]|$)'}`
}

// Where the runtime and the actions may run: web `matches`, otherwise `pageFilter.urlPrefix`.
// null means every page of the app.
export function allowPatterns(recipe) {
  if (recipe.kind === 'web') return recipe.app.matches.map(matchToRegex)
  return recipe.app.urlPrefix ? [prefixToRegex(recipe.app.urlPrefix)] : null
}

export function pageAllowed(recipe, url) {
  const allow = allowPatterns(recipe)
  return !allow || allow.some(source => new RegExp(source).test(url))
}

const readJson = file => (file ? JSON.parse(readFileSync(file, 'utf8')) : {})

// Builds the script injected into each page: runtime + language data + feature scripts.
export function buildBundle(recipe, { withLanguage = true, withFeatures = true } = {}) {
  const language = withLanguage ? recipe.language : null
  const config = {
    recipe: recipe.id,
    language: language && { code: language.code, name: language.name, i18n: language.i18n },
    maxTextLength: recipe.raw.maxTextLength,
    // The runtime stays inert outside the recipe's pages (other sites, login popups, embeds),
    // even if a tab navigates there.
    allow: allowPatterns(recipe),
  }
  const pack = language ? readJson(language.pack) : {}
  const text = language ? readJson(language.text) : {}
  let source = readFileSync(join(projectRoot, 'runtime', 'runtime.js'), 'utf8')
    .replace('__APPMOD_CONFIG__', () => JSON.stringify(config))
    .replace('__APPMOD_PACK__', () => JSON.stringify(pack))
    .replace('__APPMOD_TEXT__', () => JSON.stringify(text))
  if (withFeatures) {
    for (const file of recipe.features) {
      const name = JSON.stringify(file.slice(recipe.root.length + 1))
      source += `\n;(function (appmod) {\nif (!appmod) return\ntry {\n${readFileSync(file, 'utf8')}\n} catch (error) { appmod.errors.push(${name} + ': ' + error.message); console.warn('[appmod]', ${name}, error) }\n})(window.__appmod);\n`
    }
  }
  return source
}

export function isRunning(exeName) {
  try {
    if (process.platform === 'win32') {
      const out = execFileSync('tasklist', ['/FI', `IMAGENAME eq ${exeName}`, '/NH'], { encoding: 'utf8', windowsHide: true })
      return out.toLowerCase().includes(exeName.toLowerCase())
    }
    execFileSync('pgrep', ['-x', exeName.replace(/\.app$/, '')])
    return true
  } catch {
    return false
  }
}

const freePort = () =>
  new Promise((resolve, reject) => {
    const server = createServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
  })

// Is `pid` still a running Node process? A killed launcher's PID can be reused by an unrelated
// program; checking the image name keeps that from passing as a live launcher.
const alive = pid => {
  if (pid === process.pid) return true
  try {
    process.kill(pid, 0)
  } catch (error) {
    if (error.code !== 'EPERM') return false
  }
  try {
    const out =
      process.platform === 'win32'
        ? execFileSync('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], { encoding: 'utf8', windowsHide: true })
        : execFileSync('ps', ['-p', String(pid), '-o', 'comm='], { encoding: 'utf8' })
    return /node/i.test(out)
  } catch {
    return false
  }
}

// The session a previous `launch` left behind, if its debugging endpoint still answers.
// `owned` says whether that launcher process is still alive (and still injecting).
export async function runningSession(recipe) {
  if (!existsSync(recipe.sessionFile)) return null
  let session
  try {
    session = JSON.parse(readFileSync(recipe.sessionFile, 'utf8'))
  } catch {
    return null
  }
  const port = Number(/:(\d+)\//.exec(session.browserUrl || '')?.[1])
  const url = port ? await browserUrl(port).catch(() => null) : null
  if (!url || url !== session.browserUrl) return null
  return { ...session, owned: !!session.pid && alive(session.pid) }
}

// Waits for the browser endpoint. With a portFile the app picks its own port (and may restart
// itself on a new one); without it we pass a fixed free port.
async function waitForBrowser({ portFile, port }, since, previous, timeoutMs, giveUp = () => false) {
  const end = Date.now() + timeoutMs
  while (Date.now() < end && !giveUp()) {
    try {
      let p = port
      if (portFile) {
        if (!existsSync(portFile) || statSync(portFile).mtimeMs < since - 1000) throw 0
        p = Number(readFileSync(portFile, 'utf8').split(/\r?\n/)[0])
      }
      if (p > 0) {
        const url = await browserUrl(p)
        if (url && url !== previous) return url
      }
    } catch {}
    await sleep(100)
  }
  throw new Error('debugging port did not open: the app may still run in the tray or background (quit it fully), or its window is not a web view (WinUI/WPF/Qt apps)')
}

// Runs a recipe action with the page's input on stdin; returns stdout (JSON when it parses).
export function runAction(action, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(action.command, action.args, { cwd: action.cwd, windowsHide: true })
    let out = ''
    let err = ''
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error(`timed out after ${action.timeoutMs} ms`))
    }, action.timeoutMs)
    child.stdout.on('data', d => (out += d))
    child.stderr.on('data', d => (err += d))
    child.on('error', error => {
      clearTimeout(timer)
      reject(error)
    })
    child.on('close', code => {
      clearTimeout(timer)
      if (code !== 0) return reject(new Error(err.trim() || `exit code ${code}`))
      const text = out.trim()
      try {
        resolve(text ? JSON.parse(text) : null)
      } catch {
        resolve(text)
      }
    })
    child.stdin.on('error', () => {})
    child.stdin.end(JSON.stringify(input))
  })
}

// Command line and environment that open the debugging port for each kind of target.
function startCommand(recipe, port, { headless = false, extraArgs = [] } = {}) {
  const { app } = recipe
  const env = { ...process.env, ...app.env }
  const debug = `--remote-debugging-port=${port}`
  if (recipe.kind === 'web') {
    const args = [debug, `--user-data-dir=${app.profile}`, '--no-first-run', '--no-default-browser-check', ...(headless ? ['--headless'] : []), ...app.args, ...extraArgs, app.startUrl]
    return { args, env }
  }
  if (recipe.kind === 'webview' && app.engine === 'webview2') {
    // WebView2 reads extra browser arguments from this variable and appends them to the app's own.
    env.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = [env.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS, debug].filter(Boolean).join(' ')
    return { args: [...app.args, ...extraArgs], env }
  }
  return { args: [debug, ...app.args, ...extraArgs], env }
}

// Launches the app and keeps injecting into its windows until it exits.
// onPage(cdp, sessionId, targetInfo) is called once a page has the runtime (used by inspect).
// If a previous launch of this recipe is still running, it is reused instead: a new tab for web
// recipes, the window brought to the front otherwise. Resolves { reused } once the app exits.
export async function launch(recipe, { bundle, onPage, extraArgs = [], force = false, headless = false, beforeStart, log = makeLogger(recipe.logFile) } = {}) {
  const { app } = recipe
  if (!existsSync(app.exe)) throw new Error(`app not found: ${app.exe}`)
  const source = bundle ?? buildBundle(recipe)

  let adoptUrl = null
  const existing = await runningSession(recipe)
  if (existing && !bundle) {
    if (existing.owned) {
      await reuse(recipe, existing.browserUrl)
      log(`already running (launcher pid ${existing.pid}); ${recipe.kind === 'web' ? 'opened a new tab' : 'brought it to the front'}`)
      return { reused: true }
    }
    // The app still runs with its debugging port but its launcher is gone: take over.
    adoptUrl = existing.browserUrl
  }
  // A web recipe gets its own browser profile, so the user's normal browser may keep running.
  if (!adoptUrl && recipe.kind !== 'web' && !force && isRunning(app.exeName)) {
    const ok = beforeStart ? await beforeStart() : false
    if (!ok) throw new Error(`${app.exeName} is already running. Quit it completely (also from the tray), then try again.`)
  }

  let port = app.portFile ? 0 : await freePort()
  const startedAt = Date.now()
  let exited = false
  let exitedAt = 0
  const adopted = !!adoptUrl
  if (adoptUrl) {
    port = Number(/:(\d+)\//.exec(adoptUrl)[1])
    log(`adopting the running app at ${adoptUrl}`)
  } else {
    const { args, env } = startCommand(recipe, port, { headless, extraArgs })
    const child = spawn(app.exe, args, { detached: true, stdio: 'ignore', env, windowsHide: false })
    child.on('exit', () => {
      exited = true
      exitedAt = Date.now()
    })
    child.on('error', error => {
      exited = true
      exitedAt = Date.now()
      log(`could not start ${app.exe}: ${error.message}`)
    })
    child.unref()
    log(`started ${app.exe}`)
  }

  const types = app.targetTypes
  const token = randomUUID()
  const prepared = new Set()
  let cdp

  async function prepare(sessionId, targetInfo) {
    if (!types.includes(targetInfo.type) || prepared.has(targetInfo.targetId)) return
    prepared.add(targetInfo.targetId)
    try {
      // addScriptToEvaluateOnNewDocument does nothing in Electron until Page is enabled.
      await cdp.send('Page.enable', {}, sessionId)
      await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source }, sessionId)
      await cdp.send('Runtime.enable', {}, sessionId)
      await cdp.send('Runtime.addBinding', { name: '__appmodAction' }, sessionId)

      let liveUrl = targetInfo.url || ''
      for (let i = 0; i < 600; i++) {
        const state = await evaluate(cdp, sessionId, '({ href: location.href, ready: document.readyState, appmod: !!window.__appmod })').catch(() => null)
        if (state) {
          liveUrl = state.href || liveUrl
          const matches = pageAllowed(recipe, liveUrl)
          if (state.appmod) break
          if (liveUrl && liveUrl !== 'about:blank' && !matches) break
          if (matches && liveUrl !== 'about:blank' && state.ready === 'complete') {
            if (app.reloadIfLate) {
              await sleep(app.reloadDelayMs)
              await cdp.send('Page.reload', {}, sessionId)
            } else {
              // A renderer swap (about:blank -> a web app) can drop the new-document script.
              // Injecting after load keeps features working; recipes that need the i18n hook
              // before initialization keep reloadIfLate: true.
              await evaluate(cdp, sessionId, source)
              log(`late injection: ${liveUrl}`)
            }
            break
          }
        }
        await sleep(100)
      }
      log(`ready: ${liveUrl || targetInfo.url || '(new window)'}`)
      if (onPage) void onPage(cdp, sessionId, { ...targetInfo, url: liveUrl })
    } catch (error) {
      prepared.delete(targetInfo.targetId)
      // The app quitting while a window was being prepared is not an error.
      if (!/CDP connection (closed|is not open)/.test(error.message)) log(`error (${targetInfo.url}): ${error.message}`)
    }
  }

  // Actions run local commands, so only pages the recipe applies to may call them. The binding
  // itself exists in every frame of the target; the caller's URL is checked on each call.
  async function onBinding(sessionId, { payload, executionContextId: contextId }) {
    let call
    try {
      call = JSON.parse(payload)
    } catch {
      return
    }
    if (!Number.isInteger(call?.id)) return
    const inContext = expression => cdp.send('Runtime.evaluate', { expression, contextId, returnByValue: true }, sessionId)
    const href = await inContext('location.href').then(r => r.result.value, () => '')
    const action = recipe.actions[call.name]
    let ok = true
    let data
    if (!pageAllowed(recipe, href)) {
      ok = false
      data = `refused on ${href.slice(0, 200) || 'an unknown page'} (outside the recipe's pages)`
    } else if (!action) {
      ok = false
      data = `unknown action "${call.name}" (declare it in recipe.json "actions")`
    } else {
      try {
        data = await runAction(action, call.input)
      } catch (error) {
        ok = false
        data = error.message
      }
    }
    log(`action ${call.name}: ${ok ? 'ok' : data}`)
    await inContext(`window.__appmod && window.__appmod._reply(${call.id}, ${ok}, ${JSON.stringify(data ?? null)})`).catch(() => {})
  }

  let since = startedAt
  let timeoutMs = app.startTimeoutMs
  for (;;) {
    let url = adoptUrl
    adoptUrl = null
    if (!url) {
      // Without a portFile, a process that has exited is not coming back with the port: before
      // the first connection it handed off to another copy (tray instance, updater stub,
      // protocol handler); after one, the app has quit. A stub's real app or an app restarting
      // itself on the same port (Electron app.relaunch) gets these few seconds.
      const giveUp = () => !app.portFile && exitedAt > 0 && Date.now() - exitedAt > (cdp ? 5000 : Math.min(20000, app.startTimeoutMs))
      try {
        url = await waitForBrowser({ portFile: app.portFile, port }, since, cdp?.url, timeoutMs, giveUp)
      } catch (error) {
        if (!cdp) {
          throw new Error(
            exited
              ? `${app.exeName} exited before its debugging port opened: it handed the start over to another process (a copy already running in the tray or background, an updater stub, or a protocol handler). Quit every copy fully; if it still happens, point app.exe at the real binary, or this app has no supported route.`
              : error.message,
          )
        }
        break
      }
    }
    cdp = connect(url)
    try {
      await cdp.opened
    } catch {
      since = Date.now()
      continue
    }
    cdp.on(message => {
      if (message.method === 'Target.attachedToTarget') {
        void prepare(message.params.sessionId, message.params.targetInfo)
      } else if (message.method === 'Target.targetCreated') {
        const info = message.params.targetInfo
        // setAutoAttach + waitForDebuggerOnStart freezes some Electron windows; attach explicitly.
        if (types.includes(info.type) && !prepared.has(info.targetId)) {
          cdp.send('Target.attachToTarget', { targetId: info.targetId, flatten: true }).catch(error => log(`attach failed (${info.url}): ${error.message}`))
        }
      } else if (message.method === 'Runtime.bindingCalled' && message.params.name === '__appmodAction') {
        void onBinding(message.sessionId, message.params)
      }
    })
    await cdp.send('Target.setDiscoverTargets', { discover: true })
    log(`connected: ${url}`)
    // `appmod live` and the next `launch` read this to reach the running app.
    writeFileSync(recipe.sessionFile, JSON.stringify({ browserUrl: url, exe: app.exe, kind: recipe.kind, pid: process.pid, token, since: new Date().toISOString() }))
    await cdp.closed
    log('connection closed')
    // The app may restart itself (a new port with portFile, the same port without). Once the
    // process we started is gone and nothing answers shortly, the app has really quit.
    since = 0
    timeoutMs = app.portFile ? 15000 : app.startTimeoutMs
    // No process of ours to watch any more (adopted, or our exe handed off before connecting):
    // count the restart grace from this close, not from an earlier exit.
    if (adopted || exited) exitedAt = Date.now()
  }
  // A newer launch may already have written its own session; leave that one alone.
  try {
    if (JSON.parse(readFileSync(recipe.sessionFile, 'utf8')).token === token) rmSync(recipe.sessionFile, { force: true })
  } catch {}
  log('app exited')
  return { reused: false }
}

// A second launch while the first one still runs: open the start page again (web) or bring the
// app's window to the front.
async function reuse(recipe, url) {
  const cdp = connect(url)
  await cdp.opened
  try {
    if (recipe.kind === 'web') {
      await cdp.send('Target.createTarget', { url: recipe.app.startUrl })
      return
    }
    const { targetInfos } = await cdp.send('Target.getTargets')
    const page = targetInfos.find(t => recipe.app.targetTypes.includes(t.type) && pageAllowed(recipe, t.url)) || targetInfos.find(t => t.type === 'page')
    if (page) await cdp.send('Target.activateTarget', { targetId: page.targetId }).catch(() => {})
  } finally {
    cdp.close()
  }
}
