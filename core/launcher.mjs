// Starts an Electron app with a local debugging port and injects the appmod runtime into
// every matching window before the window's own scripts run. The app's files are never touched.
import { spawn, execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, rmSync, statSync, existsSync, appendFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
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

const readJson = file => (file ? JSON.parse(readFileSync(file, 'utf8')) : {})

// Builds the script injected into each page: runtime + language data + feature scripts.
export function buildBundle(recipe, { withLanguage = true, withFeatures = true } = {}) {
  const language = withLanguage ? recipe.language : null
  const config = {
    recipe: recipe.id,
    language: language && { code: language.code, name: language.name, i18n: language.i18n },
    maxTextLength: recipe.raw.maxTextLength,
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
      source += `\n;(function (appmod) {\ntry {\n${readFileSync(file, 'utf8')}\n} catch (error) { appmod.errors.push(${name} + ': ' + error.message); console.warn('[appmod]', ${name}, error) }\n})(window.__appmod);\n`
    }
  }
  return source
}

export function isRunning(exeName) {
  try {
    if (process.platform === 'win32') {
      const out = execFileSync('tasklist', ['/FI', `IMAGENAME eq ${exeName}`, '/NH'], { encoding: 'utf8' })
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

// Waits for the browser endpoint. With a portFile the app picks its own port (and may restart
// itself on a new one); without it we pass a fixed free port.
async function waitForBrowser({ portFile, port }, since, previous) {
  for (let i = 0; i < 300; i++) {
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
  throw new Error('debugging port did not open (is the app already running? close it, including from the tray)')
}

// Runs a recipe action with the page's input on stdin; returns stdout (JSON when it parses).
function runAction(action, input) {
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
    child.stdin.end(JSON.stringify(input))
  })
}

// Launches the app and keeps injecting into its windows until it exits.
// onPage(cdp, sessionId, targetInfo) is called once a page has the runtime (used by inspect).
export async function launch(recipe, { bundle, onPage, extraArgs = [], force = false, log = makeLogger(recipe.logFile) } = {}) {
  const { app } = recipe
  if (!existsSync(app.exe)) throw new Error(`app not found: ${app.exe}`)
  if (!force && isRunning(app.exeName)) {
    throw new Error(`${app.exeName} is already running. Quit it completely (also from the tray), then try again.`)
  }
  const source = bundle ?? buildBundle(recipe)
  const port = app.portFile ? 0 : await freePort()
  const startedAt = Date.now()
  const child = spawn(app.exe, [`--remote-debugging-port=${port}`, ...app.args, ...extraArgs], {
    detached: true,
    stdio: 'ignore',
  })
  child.unref()
  log(`started ${app.exe}`)

  const prepared = new Set()
  let cdp

  async function prepare(sessionId, targetInfo) {
    if (targetInfo.type !== 'page' || prepared.has(targetInfo.targetId)) return
    prepared.add(targetInfo.targetId)
    try {
      // addScriptToEvaluateOnNewDocument does nothing in Electron until Page is enabled.
      await cdp.send('Page.enable', {}, sessionId)
      await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source }, sessionId)
      await cdp.send('Runtime.enable', {}, sessionId)
      await cdp.send('Runtime.addBinding', { name: '__appmodAction' }, sessionId)

      let liveUrl = targetInfo.url || ''
      for (let i = 0; i < 600; i++) {
        const state = await evaluate(
          cdp,
          sessionId,
          '({ href: location.href, ready: document.readyState, appmod: !!window.__appmod })',
        ).catch(() => null)
        if (state) {
          liveUrl = state.href || liveUrl
          const matches = !app.urlPrefix || liveUrl.startsWith(app.urlPrefix)
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
      log(`error (${targetInfo.url}): ${error.message}`)
    }
  }

  async function onBinding(sessionId, payload) {
    let call
    try {
      call = JSON.parse(payload)
    } catch {
      return
    }
    const action = recipe.actions[call.name]
    let ok = true
    let data
    if (!action) {
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
    await evaluate(cdp, sessionId, `window.__appmod && window.__appmod._reply(${call.id}, ${ok}, ${JSON.stringify(data ?? null)})`).catch(() => {})
  }

  let since = startedAt
  for (;;) {
    let url
    try {
      url = await waitForBrowser({ portFile: app.portFile, port }, since, cdp?.url)
    } catch (error) {
      if (!cdp) throw error
      break
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
        if (info.type === 'page' && !prepared.has(info.targetId)) {
          cdp.send('Target.attachToTarget', { targetId: info.targetId, flatten: true }).catch(error => log(`attach failed (${info.url}): ${error.message}`))
        }
      } else if (message.method === 'Runtime.bindingCalled' && message.params.name === '__appmodAction') {
        void onBinding(message.sessionId, message.params.payload)
      }
    })
    await cdp.send('Target.setDiscoverTargets', { discover: true })
    log(`connected: ${url}`)
    // `appmod live` reads this to reach the running app.
    writeFileSync(recipe.sessionFile, JSON.stringify({ browserUrl: url, exe: app.exe, pid: process.pid, since: new Date().toISOString() }))
    await cdp.closed
    log('connection closed')
    // The app may restart itself with a new port; with a fixed port it reuses the same one.
    since = 0
  }
  rmSync(recipe.sessionFile, { force: true })
  log('app exited')
}
