// Adds a small globe button after every Discord message. Clicking it translates the message
// through the local "translate" action and shows the result below the message.
const TARGET = (appmod.language && appmod.language.code) || 'tr'
const TARGET_NAME = (appmod.language && appmod.language.name) || 'Türkçe'
const TARGET_LABEL = TARGET === 'tr' ? 'Türkçeye çevir' : `${TARGET_NAME} diline çevir`
const HIDE_LABEL = TARGET === 'tr' ? 'Çeviriyi gizle' : `${TARGET_NAME} çevirisini gizle`
const CONTENT_SELECTOR = '[id^="message-content-"]'
const CONTENT_PREFIX = 'message-content-'
const UI_ATTR = 'data-appmod-translate-ui'
const MAX_TEXT = 8000
const CACHE_LIMIT = 400
const ICON =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3z"></path></svg>'

const states = new WeakMap()
const cache = new Map()
const shown = new Set()
const reported = new Set()

appmod.addStyle(`
  .appmod-translate-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    margin: 0 0 0 6px;
    padding: 0;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: inherit;
    cursor: pointer;
    vertical-align: -3px;
    opacity: .9;
    user-select: none;
    transition: opacity .12s ease, background-color .12s ease;
  }
  .appmod-translate-button:hover,
  .appmod-translate-button:focus-visible {
    opacity: 1;
    background: rgba(127, 127, 127, .18);
    color: inherit;
    outline: none;
  }
  .appmod-translate-button[aria-pressed="true"] { opacity: .95; color: inherit; }
  .appmod-translate-button.is-loading { opacity: 1; cursor: progress; }
  .appmod-translate-button.is-loading svg { animation: appmod-translate-spin .9s linear infinite; }
  .appmod-translate-panel {
    margin: 4px 0 2px;
    padding: 6px 10px;
    border-left: 3px solid currentColor;
    border-radius: 4px;
    background: rgba(127, 127, 127, .12);
    color: var(--appmod-translate-color, inherit);
    font-size: .9375rem;
    line-height: 1.375;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .appmod-translate-panel[data-state="same"] {
    color: var(--appmod-translate-color, inherit);
    opacity: .85;
    font-style: italic;
  }
  .appmod-translate-panel[data-state="error"] {
    border-left-color: var(--text-danger, #f23f43);
    color: var(--text-danger, #f23f43);
  }
  .appmod-translate-meta {
    display: block;
    margin-top: 3px;
    color: inherit;
    opacity: .8;
    font-size: .6875rem;
    font-style: normal;
  }
  .appmod-translate-panel[data-state="error"] .appmod-translate-meta {
    color: var(--text-danger, #f23f43);
    opacity: .9;
  }
  @keyframes appmod-translate-spin { to { transform: rotate(360deg); } }
`)

function report(error) {
  const message = error && error.message ? error.message : String(error)
  if (reported.has(message)) return
  reported.add(message)
  appmod.errors.push(`discord-translate: ${message}`)
}

function messageId(content) {
  return content.id.startsWith(CONTENT_PREFIX) ? content.id.slice(CONTENT_PREFIX.length) : ''
}

function quickText(content) {
  return (content.textContent || '').trim()
}

function visibleText(content) {
  return (content.innerText || content.textContent || '').trim()
}

function setLoading(state, loading) {
  state.loading = loading
  const button = state.button
  if (!button) return
  button.classList.toggle('is-loading', loading)
  button.disabled = loading
  button.setAttribute('aria-busy', String(loading))
}

function setButtonState(state, visible) {
  const button = state.button
  if (!button) return
  button.setAttribute('aria-pressed', String(visible))
  const label = visible ? HIDE_LABEL : TARGET_LABEL
  button.title = label
  button.setAttribute('aria-label', label)
}

function buttonFor(content, state) {
  if (state.button && state.button.isConnected) return state.button
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'appmod-translate-button'
  button.dataset.appmodId = 'discord-translate'
  button.setAttribute(UI_ATTR, 'button')
  button.setAttribute('aria-pressed', 'false')
  button.title = TARGET_LABEL
  button.setAttribute('aria-label', TARGET_LABEL)
  button.innerHTML = ICON
  button.addEventListener('click', event => {
    event.preventDefault()
    event.stopPropagation()
    void toggle(content, state)
  })
  content.append(button)
  state.button = button
  setButtonState(state, Boolean(state.panel && state.panel.isConnected))
  return button
}

function makePanel(state) {
  const panel = document.createElement('div')
  panel.className = 'appmod-translate-panel'
  panel.setAttribute(UI_ATTR, 'panel')
  panel.setAttribute('role', 'status')
  panel.setAttribute('aria-live', 'polite')
  panel.setAttribute('dir', 'auto')
  panel.lang = TARGET
  const body = document.createElement('div')
  body.className = 'appmod-translate-body'
  const meta = document.createElement('span')
  meta.className = 'appmod-translate-meta'
  panel.append(body, meta)
  state.panel = panel
  return panel
}

function removePanel(state) {
  if (state.panel) state.panel.remove()
  state.panel = null
}

function syncPanelColor(panel) {
  const content = panel.__appmodContent
  if (!content || !content.isConnected) return
  const color = getComputedStyle(content).color
  if (color) panel.style.setProperty('--appmod-translate-color', color)
}

function showPanel(content, state, result) {
  if (!content.isConnected) return
  let panel = state.panel
  if (!panel || !panel.isConnected) {
    panel = makePanel(state)
    panel.__appmodContent = content
    content.after(panel)
  }
  panel.__appmodContent = content
  syncPanelColor(panel)
  const body = panel.querySelector('.appmod-translate-body')
  const meta = panel.querySelector('.appmod-translate-meta')
  const same = result.source === TARGET
  const text = same
    ? TARGET === 'tr'
      ? 'Bu mesaj zaten Türkçe.'
      : `Bu mesaj zaten ${TARGET_NAME}.`
    : result.text
  const metaText = same ? '' : result.source ? `${TARGET_NAME} · ${result.source} → ${TARGET}` : TARGET_NAME
  if (body.textContent !== text) body.textContent = text
  if (meta.textContent !== metaText) meta.textContent = metaText
  panel.dataset.state = same ? 'same' : 'translated'
  state.result = result
  state.error = false
  if (state.key) shown.add(state.key)
  setButtonState(state, true)
}

function showError(content, state, message) {
  if (!content.isConnected) return
  let panel = state.panel
  if (!panel || !panel.isConnected) {
    panel = makePanel(state)
    panel.__appmodContent = content
    content.after(panel)
  }
  const body = panel.querySelector('.appmod-translate-body')
  const meta = panel.querySelector('.appmod-translate-meta')
  const text = `Çeviri alınamadı: ${message}`
  const metaText = 'Tekrar denemek için simgeye tıkla.'
  if (body.textContent !== text) body.textContent = text
  if (meta.textContent !== metaText) meta.textContent = metaText
  panel.dataset.state = 'error'
  state.error = true
  state.result = null
  if (state.key) shown.delete(state.key)
  setButtonState(state, false)
}

function hidePanel(state) {
  removePanel(state)
  state.error = false
  if (state.key) shown.delete(state.key)
  setButtonState(state, false)
}

async function translate(content, state) {
  const text = visibleText(content)
  if (!text) return
  if (text.length > MAX_TEXT) {
    showError(content, state, `mesaj çok uzun (${text.length} > ${MAX_TEXT})`)
    return
  }
  const key = `${state.id}\u0000${text}`
  const cached = cache.get(key)
  if (cached) {
    state.key = key
    showPanel(content, state, cached)
    return
  }
  const requested = quickText(content)
  setLoading(state, true)
  try {
    const result = await appmod.action('translate', { text, target: TARGET })
    if (states.get(content) !== state) return
    if (quickText(content) !== requested) return
    if (!result || typeof result.text !== 'string' || !result.text.trim()) throw new Error('boş çeviri döndü')
    state.key = key
    state.text = requested
    cache.set(key, result)
    if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value)
    showPanel(content, state, result)
  } catch (error) {
    if (states.get(content) !== state) return
    if (quickText(content) !== requested) return
    showError(content, state, error && error.message ? error.message : String(error))
  } finally {
    setLoading(state, false)
  }
}

async function toggle(content, state) {
  if (state.loading) return
  if (state.error) {
    removePanel(state)
    state.error = false
  } else if (state.panel && state.panel.isConnected) {
    hidePanel(state)
    return
  }
  if (state.result && state.key) {
    showPanel(content, state, state.result)
    return
  }
  await translate(content, state)
}

function setup(content) {
  if (!content.isConnected) return
  const id = messageId(content)
  if (!id) return
  const text = quickText(content)
  let state = states.get(content)
  if (!state) {
    state = { id, text, key: null, button: null, panel: null, result: null, error: false, loading: false }
    states.set(content, state)
  } else if (state.text !== text) {
    if (state.key) shown.delete(state.key)
    state.text = text
    state.key = null
    state.result = null
    state.error = false
    setLoading(state, false)
    removePanel(state)
    setButtonState(state, false)
  }
  if (!text) {
    if (state.button) {
      state.button.remove()
      state.button = null
    }
    removePanel(state)
    return
  }
  const key = `${id}\u0000${text}`
  state.key = key
  if (!state.result) {
    const cached = cache.get(key)
    if (cached) state.result = cached
  }
  buttonFor(content, state)
  if (state.result && shown.has(key) && (!state.panel || !state.panel.isConnected)) {
    showPanel(content, state, state.result)
  }
}

function sync() {
  document.querySelectorAll(CONTENT_SELECTOR).forEach(content => {
    try {
      setup(content)
    } catch (error) {
      report(error)
    }
  })
  document.querySelectorAll(`[${UI_ATTR}="panel"]`).forEach(panel => {
    if (!panel.__appmodContent || !panel.__appmodContent.isConnected) {
      panel.remove()
      return
    }
    syncPanelColor(panel)
  })
}

let scheduled = false
function schedule() {
  if (scheduled) return
  scheduled = true
  setTimeout(() => {
    scheduled = false
    sync()
  }, 120)
}

appmod.whenReady(() => {
  sync()
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true, characterData: true })
  new MutationObserver(schedule).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  appmod.log(`message translation ready (${TARGET})`)
})
