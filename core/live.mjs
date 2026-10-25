// Talks to an app that `appmod launch` (or `inspect`) started: list windows, evaluate in a page,
// read text, click, screenshot. Used by agents to verify changes in the real app.
import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { connect, evaluate, browserUrl } from './cdp.mjs'
import { runningSession, pageAllowed } from './launcher.mjs'

export async function openLive(recipe, { match = '' } = {}) {
  let url = (await runningSession(recipe))?.browserUrl
  if (!url && recipe.app.portFile && existsSync(recipe.app.portFile)) {
    // Started by an older launcher or shortcut: the app still writes its port here.
    const port = Number(readFileSync(recipe.app.portFile, 'utf8').split(/\r?\n/)[0])
    url = await browserUrl(port).catch(() => null)
  }
  if (!url) throw new Error(`no running session for ${recipe.id}; start it with: node bin/appmod.mjs launch ${recipe.id}`)
  const cdp = connect(url)
  try {
    await cdp.opened
  } catch {
    throw new Error('the app is no longer reachable (closed or restarted); launch it again')
  }
  const { targetInfos } = await cdp.send('Target.getTargets')
  const pages = targetInfos.filter(t => recipe.app.targetTypes.includes(t.type) || t.type === 'page')
  const target =
    pages.find(t => match && t.url.includes(match)) ||
    pages.find(t => pageAllowed(recipe, t.url) && !t.url.startsWith('devtools:')) ||
    pages.find(t => !t.url.startsWith('devtools:')) ||
    pages[0]
  let sessionId = null
  if (target) ({ sessionId } = await cdp.send('Target.attachToTarget', { targetId: target.targetId, flatten: true }))
  return {
    pages,
    target,
    eval: expression => evaluate(cdp, sessionId, expression, { awaitPromise: true }),
    async screenshot(file) {
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' }, sessionId)
      writeFileSync(file, Buffer.from(data, 'base64'))
    },
    // Opens a URL in the current page (web recipes: to check another page of the site).
    go: url => cdp.send('Page.navigate', { url }, sessionId),
    // Closes the whole app/browser that launch started (graceful, like the user quitting it).
    quit: () => cdp.send('Browser.close').catch(() => {}),
    close: () => cdp.close(),
  }
}

// Expressions run inside the page. They only read or perform the single action asked for.
export const liveScripts = {
  text: selector => `(() => { const el = ${selector ? `document.querySelector(${JSON.stringify(selector)})` : 'document.body'}; return el ? el.innerText.slice(0, 20000) : null })()`,
  html: selector => `(() => { const el = document.querySelector(${JSON.stringify(selector)}); return el ? el.outerHTML.slice(0, 20000) : null })()`,
  count: selector => `document.querySelectorAll(${JSON.stringify(selector)}).length`,
  click: selector => `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return 'not found'; el.scrollIntoView({ block: 'center' }); el.click(); return 'clicked' })()`,
  // Runtime state: errors, whether the i18n hook caught the app, pack keys the app has but the
  // pack lacks (after an update), and how many injected controls exist.
  errors: () => `window.__appmod ? { errors: window.__appmod.errors, recipe: window.__appmod.recipe, i18n: !!window.__appmod.i18n, missingKeys: window.__appmod.missing ? window.__appmod.missing().length : null, injected: document.querySelectorAll('[data-appmod-id]').length } : 'appmod runtime not loaded in this page'`,
  // Lists candidate anchors for a feature: elements with stable attributes, with their text.
  anchors: selector => `(() => {
    const root = ${selector ? `document.querySelector(${JSON.stringify(selector)})` : 'document.body'}
    if (!root) return []
    const out = []
    for (const el of root.querySelectorAll('[data-testid],[data-list-item-id],[aria-label],[role=button],button,[role=textbox],textarea,[contenteditable=true],a[href],input,select,h1,h2,h3,[id]')) {
      if (out.length >= 150) break
      const r = el.getBoundingClientRect()
      if (!r.width || !r.height) continue
      const attrs = {}
      for (const a of el.attributes) if (/^(data-|aria-label$|role$|id$|type$|placeholder$|name$)/.test(a.name)) attrs[a.name] = a.value.slice(0, 80)
      out.push({ tag: el.tagName.toLowerCase(), attrs, text: (el.innerText || el.value || '').trim().slice(0, 60) })
    }
    return out
  })()`,
}
