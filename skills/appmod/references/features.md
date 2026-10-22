# Adding a small feature

A feature is a plain script in `recipes/<id>/features/` listed in `recipe.json` `features`. It
runs in every matching window, before the app's own code, with `appmod` in scope
(API: docs/feature-api.md). Keep each feature to one job and one file.

## Find stable anchors

1. Launch with the recipe (or inspect) and look at the live DOM over CDP:
   `document.querySelectorAll(...)`, `outerHTML` of the area, `aria-label`s, `data-*`
   attributes, `role`s.
2. Prefer, in order: `data-testid`/`data-*`, `aria-label`/`role`, structural paths from a stable
   container. Avoid generated class names (`css-1x2y3z`, `_a1b2c3`); they change every build.
3. If text is the only anchor, match the original-language text and remember the language pack
   may change it.

## Patterns

- **Button next to an element**: `appmod.addButton({ id, near, position, label, onClick })`.
  Buttons survive re-renders because `observe` re-adds them when the anchor reappears.
- **Keyboard shortcut**: `document.addEventListener('keydown', e => { ... }, true)` inside
  `appmod.whenReady`. Check the app does not already use the combination.
- **Style tweak**: `appmod.addStyle(css)`.
- **Something the page cannot do** (run a program, read a file, call a local model): declare an
  action in `recipe.json` and call `await appmod.action(name, input)`. The action receives
  `input` as JSON on stdin and prints its result (JSON or text) on stdout. Only declared
  actions can run. Ask the user before adding one.
- **Language menu entry** (`add` mode): find the app's language list in the DOM, clone one
  item with `observe`, set its label to the new language and on click call
  `appmod.i18n.changeLanguage(code)`. Fragile; note it in NOTES.md.
- **Putting text into the app's input**: focus the element and use
  `document.execCommand('insertText', false, text)`; frameworks then see a real input event.
  Setting `.value` directly is often ignored by React.

## Verify

Click the feature in the real window and confirm the effect, check `window.__appmod.errors`
and the log. Write the selector choice and why into NOTES.md.
