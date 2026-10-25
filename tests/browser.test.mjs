// End to end in a real browser: the launcher starts headless Chrome/Edge on a local test site,
// injects the runtime, and the test drives it over CDP like `appmod live` does. Covers the
// i18next hook, the text map, features (button, hide, hotkey, store), the action bridge, and
// that pages outside the recipe get neither the runtime nor the actions.
// Skipped when no Chromium-based browser is installed.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { loadRecipe, findBrowser } from '../core/recipe.mjs'
import { launch, runningSession } from '../core/launcher.mjs'
import { openLive } from '../core/live.mjs'

const sleep = ms => new Promise(r => setTimeout(r, ms))
// Resolves with the promise's value, or 'timeout'; the timer does not keep the process alive.
const within = (promise, ms) => Promise.race([promise, new Promise(r => setTimeout(r, ms, 'timeout').unref())])

// A page that initialises a tiny i18next look-alike the way i18next does: it assigns
// `translator` on the instance, which is what the runtime traps.
const APP = `<!doctype html><html><head><meta charset="utf-8"><title>test app</title><script>
  const store = {
    data: { en: { translation: { settings: { title: 'Settings' }, hello: 'Hello' } } },
    addResourceBundle(lng, ns, res) { const m = (t, s) => { for (const [k, v] of Object.entries(s)) { if (v && typeof v === 'object') { t[k] = t[k] || {}; m(t[k], v) } else t[k] = v } }; this.data[lng] = this.data[lng] || {}; this.data[lng][ns] = this.data[lng][ns] || {}; m(this.data[lng][ns], res) },
  }
  const i18n = { store, language: 'en', options: {}, isInitialized: true, changeLanguage(l) { this.language = l; return Promise.resolve() } }
  i18n.translator = {}
  window.t = key => key.split('.').reduce((o, k) => o && o[k], store.data.en.translation)
  document.addEventListener('DOMContentLoaded', () => { document.getElementById('title').textContent = t('settings.title') })
</script></head><body>
  <h1 id="title"></h1>
  <ul><li class="item">One</li><li class="item">Two</li></ul>
  <p id="price">Price</p>
  <p id="swap">Home</p>
  <div class="ad">ad</div>
</body></html>`

const OTHER = `<!doctype html><html><body><p>Other site</p></body></html>`

function makeRecipe(dir, port) {
  mkdirSync(join(dir, 'features'), { recursive: true })
  mkdirSync(join(dir, 'packs'))
  mkdirSync(join(dir, 'text'))
  writeFileSync(join(dir, 'NOTES.md'), '# test\n')
  writeFileSync(join(dir, 'packs', 'tr.json'), JSON.stringify({ 'settings.title': 'Ayarlar' }))
  // "$$" and "$&" must survive literally (String.replace patterns); Home <-> Start must not
  // flip forever.
  writeFileSync(join(dir, 'text', 'tr.json'), JSON.stringify({ Price: 'Fiyat $$5 $&', Home: 'Start', Start: 'Home' }))
  writeFileSync(
    join(dir, 'features', 'f.js'),
    `appmod.addButton({ id: 'echo', near: '.item', position: 'append', label: '+', async onClick(e, a) { a.dataset.echo = (await appmod.action('echo', { text: a.firstChild.nodeValue })).text } })
     appmod.hide('.ad')
     appmod.hotkey('ctrl+shift+k', () => { document.body.dataset.hot = String(Number(document.body.dataset.hot || 0) + 1) })
     appmod.store.set('seen', { n: 1 })`,
  )
  // The action records each call, so a refused call is visible as a missing line.
  writeFileSync(
    join(dir, 'features', 'echo.mjs'),
    `import { appendFileSync } from 'node:fs'
     let s = ''; for await (const c of process.stdin) s += c
     const { text } = JSON.parse(s); appendFileSync(new URL('./calls.txt', import.meta.url), text + '\\n')
     console.log(JSON.stringify({ text: 'echo:' + text }))`,
  )
  writeFileSync(
    join(dir, 'recipe.json'),
    JSON.stringify({
      schema: 1,
      id: 'browser-test',
      app: {
        kind: 'web',
        browser: 'auto',
        startUrl: `http://127.0.0.1:${port}/app/`,
        // No port in the pattern: like Chrome, it matches any port.
        matches: ['http://127.0.0.1/app/*'],
        profile: join(dir, 'profile'),
        args: process.platform === 'linux' ? ['--no-sandbox'] : [],
        startTimeoutMs: 30000,
      },
      language: { code: 'tr', i18n: { library: 'i18next', base: 'en', namespace: 'translation', mode: 'override' }, pack: 'packs/tr.json', text: 'text/tr.json' },
      features: ['features/f.js'],
      actions: { echo: { command: 'node', args: ['./features/echo.mjs'], timeoutMs: 10000 } },
    }),
  )
  return loadRecipe(dir)
}

test('web recipe end to end in a headless browser', { skip: !findBrowser() && 'no Chrome or Edge installed', timeout: 120000 }, async () => {
  const server = createServer((req, res) => {
    res.setHeader('content-type', 'text/html; charset=utf-8')
    res.end(req.url.startsWith('/app/') ? APP : OTHER)
  })
  await new Promise(r => server.listen(0, '127.0.0.1', r))
  const port = server.address().port
  const dir = mkdtempSync(join(tmpdir(), 'appmod-browser-'))
  let live
  try {
    const recipe = makeRecipe(dir, port)
    const running = launch(recipe, { headless: true, log: () => {} })
    let session = null
    for (let i = 0; i < 300 && !session; i++) {
      session = await runningSession(recipe)
      if (!session) await sleep(100)
    }
    assert.ok(session, 'the launcher wrote a reachable session')

    live = await openLive(recipe)
    let state
    for (let i = 0; i < 100; i++) {
      state = await live.eval(`({ hooked: !!(window.__appmod && __appmod.i18n), title: document.getElementById('title')?.textContent, buttons: document.querySelectorAll('.item [data-appmod-id="echo"]').length })`).catch(() => null)
      if (state?.hooked && state.buttons === 2) break
      await sleep(100)
    }
    assert.equal(state.hooked, true, 'i18next instance captured')
    assert.equal(state.title, 'Ayarlar', 'pack written over the base language before the app rendered')
    assert.equal(state.buttons, 2, 'one button per anchor, also when anchors share a parent')
    assert.equal(await live.eval(`document.getElementById('price').textContent`), 'Fiyat $$5 $&')
    await sleep(300)
    assert.equal(await live.eval(`document.getElementById('swap').textContent`), 'Start', 'mutual entries translate once and stay')
    assert.equal(await live.eval(`getComputedStyle(document.querySelector('.ad')).display`), 'none')
    assert.deepEqual(await live.eval(`__appmod.missing()`), ['hello'])
    assert.deepEqual(await live.eval(`__appmod.store.get('seen')`), { n: 1 })
    await live.eval(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'K', code: 'KeyK', ctrlKey: true, shiftKey: true, bubbles: true }))`)
    assert.equal(await live.eval(`document.body.dataset.hot`), '1')

    await live.eval(`document.querySelector('.item [data-appmod-id="echo"]').click()`)
    let echo
    for (let i = 0; i < 100 && !echo; i++) {
      echo = await live.eval(`document.querySelector('.item').dataset.echo || null`)
      if (!echo) await sleep(100)
    }
    assert.equal(echo, 'echo:One', 'action round trip')
    assert.deepEqual(await live.eval(`__appmod.errors`), [])

    // Another site in the same tab: no runtime, and a direct binding call must not run the action.
    await live.go(`http://localhost:${port}/other/`)
    let other
    for (let i = 0; i < 50; i++) {
      other = await live.eval(`({ path: location.pathname, runtime: typeof window.__appmod, binding: typeof window.__appmodAction })`).catch(() => null)
      if (other?.path === '/other/') break
      await sleep(100)
    }
    assert.deepEqual(other, { path: '/other/', runtime: 'undefined', binding: 'function' })
    await live.eval(`window.__appmodAction(JSON.stringify({ id: 7, name: 'echo', input: { text: 'evil' } }))`)
    await sleep(1500)
    assert.deepEqual(readFileSync(join(dir, 'features', 'calls.txt'), 'utf8').trim().split('\n'), ['One'], 'refused outside the recipe pages')

    // A second launch reuses the running one (new tab) instead of failing on the locked profile.
    const before = live.pages.length
    assert.deepEqual(await launch(recipe, { log: () => {} }), { reused: true })
    live.close()
    live = await openLive(recipe)
    assert.equal(live.pages.length, before + 1)

    await live.quit()
    const result = await within(running, 20000)
    assert.deepEqual(result, { reused: false }, 'launch returns once the browser is closed')
    assert.ok(!existsSync(recipe.sessionFile), 'session file removed')
  } finally {
    live?.close()
    server.close()
    await sleep(500)
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 })
  }
})
