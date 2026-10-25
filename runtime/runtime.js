// appmod runtime. Injected into every matching page before the page's own scripts run.
// The launcher replaces the __APPMOD_*__ placeholders and appends the recipe's feature scripts.
// Exposes window.__appmod (see docs/feature-api.md).
;(function () {
  if (window.__appmod) return

  const CONFIG = __APPMOD_CONFIG__
  const PACK = __APPMOD_PACK__ // flat { "a.b.c": "translated" } for the i18n library
  const TEXT = __APPMOD_TEXT__ // exact on-screen English text -> translated, for strings outside i18n
  if (CONFIG.allow && !CONFIG.allow.some(source => new RegExp(source).test(location.href))) return

  const listeners = { ready: [] }
  const appmod = {
    version: 1,
    recipe: CONFIG.recipe,
    language: CONFIG.language,
    i18n: null,
    original: {}, // original bundles as the app registered them: original[lng][ns] (nested)
    errors: [],
    log: (...args) => console.log('[appmod]', ...args),
  }
  Object.defineProperty(window, '__appmod', { value: appmod, enumerable: false })

  const report = (where, error) => {
    appmod.errors.push(`${where}: ${error && error.message ? error.message : error}`)
    console.warn('[appmod]', where, error)
  }

  // ---------- helpers ----------

  function nested(flat) {
    const root = {}
    for (const [path, value] of Object.entries(flat)) {
      const parts = path.split('.')
      let node = root
      for (let i = 0; i < parts.length - 1; i++) {
        if (typeof node[parts[i]] !== 'object' || node[parts[i]] === null) node[parts[i]] = {}
        node = node[parts[i]]
      }
      node[parts[parts.length - 1]] = value
    }
    return root
  }

  function flatten(tree, prefix = '', out = {}) {
    for (const [key, value] of Object.entries(tree || {})) {
      const path = prefix ? `${prefix}.${key}` : key
      if (value && typeof value === 'object') flatten(value, path, out)
      else if (typeof value === 'string') out[path] = value
    }
    return out
  }

  function mergeInto(target, source) {
    for (const [key, value] of Object.entries(source || {})) {
      if (value && typeof value === 'object') {
        if (typeof target[key] !== 'object' || target[key] === null) target[key] = {}
        mergeInto(target[key], value)
      } else if (typeof value === 'string') {
        target[key] = value
      }
    }
  }

  const remember = (lng, ns, resources) => {
    appmod.original[lng] = appmod.original[lng] || {}
    appmod.original[lng][ns] = appmod.original[lng][ns] || {}
    mergeInto(appmod.original[lng][ns], resources)
  }

  // ---------- i18next adapter ----------

  const lang = CONFIG.language
  const i18nCfg = lang && lang.i18n
  const OVERRIDES = nested(PACK)
  // "pt-BR" matches "pt-BR"; a regional "en-US" bundle also matches a plain "en" target.
  const sameLang = (a, b) => {
    if (typeof a !== 'string') return false
    const x = a.toLowerCase()
    const y = b.toLowerCase()
    return x === y || x.split('-')[0] === y
  }

  function hookI18next(i18n) {
    const store = i18n.store
    if (!store || store.__appmod) return
    store.__appmod = true
    appmod.i18n = i18n
    for (const [lng, namespaces] of Object.entries(store.data || {})) {
      for (const [ns, resources] of Object.entries(namespaces || {})) remember(lng, ns, resources)
    }
    if (!i18nCfg || i18nCfg.library !== 'i18next') return

    const ns = i18nCfg.namespace
    const original = store.addResourceBundle.bind(store)
    // override: write the translation over the base language. add: register a new language.
    const target = i18nCfg.mode === 'override' ? i18nCfg.base : lang.code
    const apply = () => original(target, ns, OVERRIDES, true, true)

    store.addResourceBundle = function (lng, bundleNs, resources, deep, overwrite) {
      const mine = resources === OVERRIDES
      if (!mine) remember(lng, bundleNs, resources)
      const result = original(lng, bundleNs, resources, deep, overwrite)
      // The app (re)loaded the bundle we replace; put our strings back on top.
      if (!mine && bundleNs === ns && sameLang(lng, target)) apply()
      return result
    }
    apply()

    if (i18nCfg.mode === 'add') {
      // Missing keys fall back to the base language instead of showing raw keys.
      const fb = i18n.options && i18n.options.fallbackLng
      if (i18n.options) i18n.options.fallbackLng = Array.from(new Set([i18nCfg.base].concat(fb || [])))
      const switchTo = () => {
        if (i18n.language !== lang.code) i18n.changeLanguage(lang.code).catch(e => report('changeLanguage', e))
      }
      if (i18n.isInitialized) switchTo()
      else i18n.on && i18n.on('initialized', switchTo)
    }
    appmod.log(`i18next hooked (${i18nCfg.mode} -> ${target}, ${Object.keys(PACK).length} keys)`)
  }

  // i18next assigns `translator` on the instance during init; trapping that assignment gives us
  // the instance even when the app bundles i18next privately and never exposes it on window.
  try {
    Object.defineProperty(Object.prototype, 'translator', {
      configurable: true,
      enumerable: false,
      get() {
        return undefined
      },
      set(value) {
        Object.defineProperty(this, 'translator', { value, writable: true, enumerable: true, configurable: true })
        try {
          if (typeof this.changeLanguage === 'function' && this.store) hookI18next(this)
        } catch (error) {
          report('i18next hook', error)
        }
      },
    })
  } catch (error) {
    report('translator trap', error)
  }

  // ---------- exact-text replacement (strings the i18n library does not own) ----------

  const ATTRIBUTES = ['placeholder', 'title', 'aria-label']
  const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'PRE', 'NOSCRIPT'])
  const MAX_TEXT = CONFIG.maxTextLength || 120

  // Values this script wrote, so its own mutations are not translated again (a map with
  // "Home" -> "Start" and "Start" -> "Home" would otherwise flip forever).
  const written = new WeakMap()

  function translateTextNode(node) {
    const text = node.nodeValue
    if (!text || text.length > MAX_TEXT || written.get(node) === text) return
    const trimmed = text.trim()
    const tr = TEXT[trimmed]
    if (tr !== undefined && tr !== trimmed) {
      // A replacer function keeps "$&", "$$" and similar in translations literal.
      node.nodeValue = text.replace(trimmed, () => tr)
      written.set(node, node.nodeValue)
    }
  }

  function translateElement(element) {
    if (SKIP.has(element.tagName) || element.isContentEditable) return
    let mine = written.get(element)
    for (const name of ATTRIBUTES) {
      const value = element.getAttribute(name)
      if (!value || (mine && mine[name] === value)) continue
      const tr = TEXT[value.trim()]
      if (tr !== undefined && tr !== value) {
        element.setAttribute(name, tr)
        if (!mine) written.set(element, (mine = {}))
        mine[name] = tr
      }
    }
  }

  function walk(root, onText, onElement) {
    if (root.nodeType === Node.TEXT_NODE) {
      if (!SKIP.has(root.parentElement && root.parentElement.tagName)) onText(root)
      return
    }
    if (root.nodeType !== Node.ELEMENT_NODE) return
    onElement(root)
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: node =>
        node.nodeType === Node.ELEMENT_NODE && (SKIP.has(node.tagName) || node.isContentEditable)
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT,
    })
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      node.nodeType === Node.TEXT_NODE ? onText(node) : onElement(node)
    }
  }

  function startTextReplacement() {
    if (Object.keys(TEXT).length === 0) return
    walk(document.body, translateTextNode, translateElement)
    new MutationObserver(records => {
      for (const record of records) {
        if (record.type === 'characterData') translateTextNode(record.target)
        else if (record.type === 'attributes') translateElement(record.target)
        else record.addedNodes.forEach(node => walk(node, translateTextNode, translateElement))
      }
    }).observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ATTRIBUTES,
    })
  }

  // ---------- feature API ----------

  appmod.whenReady = fn => {
    if (document.body) queueMicrotask(() => run('whenReady', fn))
    else listeners.ready.push(fn)
  }

  const run = (where, fn, ...args) => {
    try {
      return fn(...args)
    } catch (error) {
      report(where, error)
    }
  }

  // Calls fn(element) once for every element matching selector, now and whenever one appears.
  // All observers share one MutationObserver and one scan per batch of DOM changes, so many
  // features stay cheap in busy apps.
  const watchers = []
  let scanQueued = false
  const scanAll = () => {
    scanQueued = false
    for (const w of watchers) {
      if (w.broken) continue
      let found
      try {
        found = document.querySelectorAll(w.selector)
      } catch (error) {
        // An invalid selector is reported once, not on every DOM change.
        w.broken = true
        report(`observe(${w.selector})`, error)
        continue
      }
      found.forEach(el => {
        if (w.seen.has(el)) return
        w.seen.add(el)
        run(`observe(${w.selector})`, w.fn, el)
      })
    }
  }
  let rootObserver = null
  appmod.observe = (selector, fn) => {
    watchers.push({ selector, fn, seen: new WeakSet() })
    appmod.whenReady(() => {
      if (!rootObserver) {
        rootObserver = new MutationObserver(() => {
          if (!scanQueued) {
            scanQueued = true
            queueMicrotask(scanAll)
          }
        })
        rootObserver.observe(document.body, { subtree: true, childList: true })
      }
      scanAll()
    })
  }

  // Adds a button next to every element matching `near`.
  // position: 'before' | 'after' | 'prepend' | 'append' (default 'after').
  appmod.addButton = ({ id, near, position = 'after', label = '', title, html, className, style, onClick }) => {
    if (!id) throw new Error('addButton needs an id')
    const mine = el => !!el && el.dataset && el.dataset.appmodId === id
    appmod.observe(near, anchor => {
      // One button per anchor, even when several anchors share a parent.
      if (position === 'after' && mine(anchor.nextElementSibling)) return
      if (position === 'before' && mine(anchor.previousElementSibling)) return
      if ((position === 'prepend' || position === 'append') && Array.from(anchor.children).some(mine)) return
      const button = document.createElement('button')
      button.type = 'button'
      button.dataset.appmodId = id
      if (html) button.innerHTML = html
      else button.textContent = label
      if (title) button.title = title
      if (className) button.className = className
      if (style) Object.assign(button.style, style)
      button.addEventListener('click', event => {
        event.preventDefault()
        event.stopPropagation()
        Promise.resolve(run(`button ${id}`, onClick, event, anchor)).catch(e => report(`button ${id}`, e))
      })
      if (position === 'before') anchor.before(button)
      else if (position === 'prepend') anchor.prepend(button)
      else if (position === 'append') anchor.append(button)
      else anchor.after(button)
    })
  }

  appmod.addStyle = css => {
    appmod.whenReady(() => {
      const style = document.createElement('style')
      style.dataset.appmod = ''
      style.textContent = css
      document.head.appendChild(style)
    })
  }

  // Hides elements with CSS instead of removing them, so the app's own rendering is unaffected.
  appmod.hide = selector => appmod.addStyle(`${selector} { display: none !important; }`)

  // Keyboard shortcut, e.g. appmod.hotkey('ctrl+shift+k', fn). "mod" is Cmd on macOS, Ctrl
  // elsewhere. Ignored while the user types in a field unless { inInputs: true }.
  appmod.hotkey = (combo, fn, { inInputs = false } = {}) => {
    const isMac = /Mac/.test(navigator.platform || navigator.userAgent || '')
    const parts = String(combo).toLowerCase().split('+').map(s => s.trim())
    const key = parts.pop()
    const want = { ctrl: false, shift: false, alt: false, meta: false }
    for (const p of parts) {
      if (p === 'mod') want[isMac ? 'meta' : 'ctrl'] = true
      else if (p === 'cmd' || p === 'meta') want.meta = true
      else if (p === 'ctrl' || p === 'shift' || p === 'alt') want[p] = true
      else throw new Error(`hotkey: unknown modifier "${p}" in "${combo}"`)
    }
    document.addEventListener(
      'keydown',
      event => {
        // event.code keeps "shift+1" and non-Latin layouts working ("Digit1", "KeyK").
        const code = (event.code || '').toLowerCase().replace(/^(key|digit)/, '')
        if ((event.key || '').toLowerCase() !== key && code !== key) return
        if (event.ctrlKey !== want.ctrl || event.shiftKey !== want.shift || event.altKey !== want.alt || event.metaKey !== want.meta) return
        const t = event.target
        if (!inInputs && t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return
        event.preventDefault()
        event.stopPropagation()
        Promise.resolve(run(`hotkey ${combo}`, fn, event)).catch(e => report(`hotkey ${combo}`, e))
      },
      true,
    )
  }

  // Small per-recipe settings (a toggle, a last choice) in the page's own localStorage.
  const storeKey = key => `appmod:${CONFIG.recipe}:${key}`
  appmod.store = {
    get(key, fallback = null) {
      try {
        const raw = localStorage.getItem(storeKey(key))
        return raw === null ? fallback : JSON.parse(raw)
      } catch {
        return fallback
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(storeKey(key), JSON.stringify(value))
        return true
      } catch (error) {
        report('store.set', error)
        return false
      }
    },
  }

  // Runs a native action declared in recipe.json "actions". Resolves with its stdout (parsed as
  // JSON when possible). Only declared actions can run; the launcher enforces this.
  let nextCall = 1
  const calls = new Map()
  appmod.action = (name, input) =>
    new Promise((resolve, reject) => {
      if (typeof window.__appmodAction !== 'function') return reject(new Error('appmod launcher bridge not available'))
      const id = nextCall++
      calls.set(id, { resolve, reject })
      window.__appmodAction(JSON.stringify({ id, name, input: input === undefined ? null : input }))
    })
  appmod._reply = (id, ok, data) => {
    const call = calls.get(id)
    if (!call) return
    calls.delete(id)
    ok ? call.resolve(data) : call.reject(new Error(data))
  }

  // Translates a key through the captured i18n instance (for feature labels).
  appmod.t = (key, options) => (appmod.i18n ? appmod.i18n.t(key, options) : key)

  // ---------- inspection helpers (used by `appmod inspect`) ----------

  appmod.dumpOriginal = (lng, ns) => flatten((appmod.original[lng] || {})[ns])

  // Keys the app has now but the language pack lacks: after an app update these show up in
  // English. `live <recipe> errors` reports the count.
  appmod.missing = () => {
    if (!i18nCfg || i18nCfg.library !== 'i18next') return []
    const original = appmod.dumpOriginal(i18nCfg.base, i18nCfg.namespace)
    return Object.keys(original).filter(key => !(key in PACK) && original[key].trim())
  }

  appmod.detect = () => {
    const found = []
    if (appmod.i18n) found.push({ library: 'i18next', languages: Object.keys(appmod.original), language: appmod.i18n.language })
    if (window.i18next && !appmod.i18n) found.push({ library: 'i18next (window.i18next, not hooked)' })
    if (window.__INTL_MESSAGES__ || document.querySelector('[data-intl]')) found.push({ library: 'react-intl?' })
    if (window.Vue || document.querySelector('[data-v-app]')) found.push({ library: 'vue (check vue-i18n)' })
    if (window.ng || document.querySelector('[ng-version]')) found.push({ library: 'angular (check $localize)' })
    if (window.webpackChunkdiscord_app) found.push({ library: 'discord webpack (custom i18n)' })
    return {
      url: location.href,
      title: document.title,
      userAgent: navigator.userAgent,
      htmlLang: document.documentElement.lang,
      found,
      namespaces: Object.fromEntries(Object.entries(appmod.original).map(([l, n]) => [l, Object.keys(n)])),
      errors: appmod.errors,
    }
  }

  // Short visible text currently on screen; seeds the exact-text map for apps without i18n.
  appmod.visibleText = () => {
    const out = new Set()
    walk(
      document.body,
      node => {
        const t = node.nodeValue && node.nodeValue.trim()
        if (t && t.length <= MAX_TEXT && /[A-Za-z]/.test(t) && node.parentElement && node.parentElement.offsetParent !== null) out.add(t)
      },
      element => {
        for (const name of ATTRIBUTES) {
          const v = element.getAttribute(name)
          if (v && v.trim() && v.length <= MAX_TEXT) out.add(v.trim())
        }
      },
    )
    return Array.from(out).sort()
  }

  // ---------- start ----------

  const onReady = () => {
    run('text replacement', startTextReplacement)
    for (const fn of listeners.ready.splice(0)) run('whenReady', fn)
  }
  if (document.body) onReady()
  else document.addEventListener('DOMContentLoaded', onReady, { once: true })

  appmod.log(`loaded recipe ${CONFIG.recipe}`)
})()
