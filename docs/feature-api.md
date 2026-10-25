# Feature API (`window.__appmod`)

Feature scripts run inside the app window with `appmod` in scope. An exception in one feature
is caught and recorded in `appmod.errors`; it does not break the others. Patterns for common
wishes: `skills/appmod/references/features.md`.

| Call | What it does |
|---|---|
| `appmod.whenReady(fn)` | Runs `fn` once `document.body` exists. |
| `appmod.observe(selector, fn)` | Calls `fn(element)` once for each matching element, now and whenever new ones appear. All observers share one MutationObserver. |
| `appmod.addButton({ id, near, position, label, html, title, className, style, onClick })` | Adds a button next to every `near` match. `position`: `before`, `after` (default), `prepend`, `append`. `onClick(event, anchor)` may be async. `id` is required; each anchor gets at most one button with that id. |
| `appmod.addStyle(css)` | Adds a `<style>` element. |
| `appmod.hide(selector)` | Hides matching elements with CSS (`display: none !important`); the app's nodes stay in place. |
| `appmod.hotkey(combo, fn, { inInputs })` | Keyboard shortcut such as `'ctrl+shift+k'` or `'mod+k'` (`mod` = Cmd on macOS, Ctrl elsewhere). Ignored while typing in a field unless `inInputs: true`. |
| `appmod.store.get(key, fallback)`, `appmod.store.set(key, value)` | Small JSON values in the page's `localStorage`, namespaced per recipe. |
| `await appmod.action(name, input)` | Runs the action `name` declared in `recipe.json`; resolves with its stdout (parsed JSON when possible). Works only on the recipe's own pages and only with `appmod launch`. |
| `appmod.t(key, options)` | Translates through the app's captured i18next instance. |
| `appmod.i18n` | The captured i18next instance, or `null`. |
| `appmod.language` | `{ code, name, i18n }` from the recipe, or `null`. |
| `appmod.original[lng][ns]` | The app's original strings as it registered them. |
| `appmod.missing()` | Keys the app has in the base language that the pack lacks. |
| `appmod.errors` | Errors from the runtime and features (strings). |
| `appmod.log(...)` | `console.log` with an `[appmod]` prefix. |

Inspection helpers (used by `inspect`): `appmod.detect()`, `appmod.dumpOriginal(lng, ns)`,
`appmod.visibleText()`.

Features normally run before the app's own scripts. With `reloadIfLate: false` the bundle is
injected after load instead (see `docs/recipe-format.md`). Do not read the DOM at the top
level; use `whenReady` or `observe` so a feature works in both cases. On web recipes the
runtime and features stay out of pages outside `matches`.
