// Runs the injected runtime against a fake i18next instance in a VM sandbox.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { join } from 'node:path'
import { buildBundle } from '../core/launcher.mjs'
import { loadRecipe, projectRoot } from '../core/recipe.mjs'

function fakeI18next(context) {
  // Mimics how i18next creates its store and assigns `translator` during init.
  return vm.runInContext(
    `(() => {
      const store = {
        data: { en: { translation: { settings: { title: 'Settings' }, hello: 'Hello {{name}}' } } },
        addResourceBundle(lng, ns, res, deep, overwrite) {
          const merge = (t, s) => { for (const [k, v] of Object.entries(s)) {
            if (v && typeof v === 'object') { t[k] = t[k] || {}; merge(t[k], v) } else t[k] = v } }
          this.data[lng] = this.data[lng] || {}
          this.data[lng][ns] = this.data[lng][ns] || {}
          merge(this.data[lng][ns], res)
        },
      }
      const i18n = { store, language: 'en', options: {}, isInitialized: true, changeLanguage(l) { this.language = l; return Promise.resolve() } }
      i18n.translator = {}
      return i18n
    })()`,
    context,
  )
}

function sandbox() {
  // The Qoder recipe limits the runtime to qoder-app: pages.
  const context = vm.createContext({ console: { log() {}, warn() {} }, queueMicrotask, location: { href: 'qoder-app://renderer/index.html' }, document: { body: null, addEventListener() {} } })
  context.window = context
  return context
}

test('override mode writes the pack over the base language and keeps originals', () => {
  const recipe = loadRecipe(join(projectRoot, 'recipes', 'qoder'))
  const context = sandbox()
  vm.runInContext(buildBundle(recipe, { withFeatures: false }), context)
  const i18n = fakeI18next(context)
  const appmod = context.__appmod
  assert.equal(appmod.i18n, i18n)
  assert.equal(appmod.original.en.translation.settings.title, 'Settings')
  // A later bundle load from the app is overridden again.
  i18n.store.addResourceBundle('en', 'translation', { dataDirectory: { title: 'Local data' } }, true, true)
  assert.equal(i18n.store.data.en.translation.dataDirectory.title, 'Yerel veriler')
  assert.equal(appmod.dumpOriginal('en', 'translation')['dataDirectory.title'], 'Local data')
})

test('inspect bundle (no language) captures without changing strings', () => {
  const recipe = loadRecipe(join(projectRoot, 'recipes', 'qoder'))
  const context = sandbox()
  vm.runInContext(buildBundle(recipe, { withLanguage: false, withFeatures: false }), context)
  const i18n = fakeI18next(context)
  assert.equal(i18n.store.data.en.translation.settings.title, 'Settings')
  assert.equal(context.__appmod.dumpOriginal('en', 'translation')['hello'], 'Hello {{name}}')
})

test('the runtime stays out of pages outside pageFilter.urlPrefix (login popups, embeds)', () => {
  const recipe = loadRecipe(join(projectRoot, 'recipes', 'qoder'))
  const context = sandbox()
  context.location.href = 'https://login.example.com/oauth'
  vm.runInContext(buildBundle(recipe), context)
  assert.equal(context.__appmod, undefined)
})

test('a regional target code keeps its pack when the app reloads that bundle', () => {
  const recipe = loadRecipe(join(projectRoot, 'recipes', 'qoder'))
  recipe.language = { ...recipe.language, code: 'pt-BR', i18n: { ...recipe.language.i18n, mode: 'add' } }
  const context = sandbox()
  vm.runInContext(buildBundle(recipe, { withFeatures: false }), context)
  const i18n = fakeI18next(context)
  i18n.store.addResourceBundle('pt-BR', 'translation', { dataDirectory: { title: 'Local data' } }, true, true)
  assert.equal(i18n.store.data['pt-BR'].translation.dataDirectory.title, 'Yerel veriler')
})

test('add mode registers a new language and switches to it', () => {
  const recipe = loadRecipe(join(projectRoot, 'recipes', 'qoder'))
  recipe.language = { ...recipe.language, i18n: { ...recipe.language.i18n, mode: 'add' } }
  const context = sandbox()
  vm.runInContext(buildBundle(recipe, { withFeatures: false }), context)
  const i18n = fakeI18next(context)
  assert.equal(i18n.language, 'tr')
  assert.equal(i18n.store.data.en.translation.settings.title, 'Settings')
  assert.ok(Object.keys(i18n.store.data.tr.translation).length > 0)
  assert.deepEqual(Array.from(i18n.options.fallbackLng), ['en'])
})
