# Looks, controls and behaviour

A feature is a plain script in `recipes/<id>/features/`, listed in `recipe.json` `features`. It
runs in every matching window, before the app's own code, with `appmod` in scope (API:
docs/feature-api.md). Keep each feature to one job and one file; an error in one is recorded in
`appmod.errors` and does not stop the others.

## Find stable anchors

1. Launch (web: `--headless`) and read the live DOM: `live <id> anchors [css]`,
   `live <id> html <css>`, `live <id> eval <js>`.
2. Prefer, in order: `data-testid` and other `data-*`, `aria-label` and `role`, element ids the
   app builds from its own data (Discord's `message-content-<id>`), structure from a stable
   container. Avoid generated class names (`css-1x2y3z`, `_a1b2c3`, `contents_c19a55`): they
   change every build.
3. If text is the only anchor, match the original-language text and remember a language pack
   may change it.

## Patterns

Do not remove or move nodes the app's framework owns (React, Vue): it will crash or undo it.
Change looks with CSS, add your own nodes next to the app's, and react with `observe`.

| Wish | How |
|---|---|
| Theme, colors, font size, spacing | `appmod.addStyle(css)`. First look for the app's CSS variables (`live <id> eval "getComputedStyle(document.documentElement).getPropertyValue('--background-primary')"`) and override those on `:root` or the theme class; it reaches every screen at once. Check light and dark themes. |
| Hide clutter | `appmod.hide(selector)` (CSS `display: none`, the app's nodes stay). |
| Rename a label | the `text` map (`text/<code>.json`, exact visible text), even without a language pack. |
| Button next to something | `appmod.addButton({ id, near, position, label, onClick })`. It reappears when the app re-renders and never doubles. Copy the look of a neighbouring button (`live html`) so it fits. |
| Keyboard shortcut | `appmod.hotkey('mod+shift+k', fn)` (`mod` is Cmd on macOS, Ctrl elsewhere). Check the app does not already use the combination. |
| Remember a choice or toggle | `appmod.store.get(key, fallback)` / `appmod.store.set(key, value)`. |
| A small automatic step (expand, pick a default) | `appmod.observe(selector, el => ...)`: runs once per matching element as it appears. Only steps the user asked for, never actions toward other people. |
| Text into the app's input | focus it, then `document.execCommand('insertText', false, text)`; frameworks see a real input event, setting `.value` is often ignored. |
| Translate content on demand | button per message calling the shared action `"translate": { "command": "node", "args": ["@appmod/shared/actions/translate.mjs"] }` with `{ text, target }`; show the result next to the original (see recipes/discord, recipes/hacker-news). Tell the user the text goes to Google. |
| Something the page cannot do (run a program, read a file, call a local model) | declare an action in `recipe.json` and `await appmod.action(name, input)`. The action gets `input` as JSON on stdin and prints JSON or text on stdout. Only declared actions run, only from the recipe's own pages. Ask before adding one. |
| Language menu entry (`add` mode) | clone one item of the app's language list with `observe`, label it, and call `appmod.i18n.changeLanguage(code)` on click. Fragile; note it in NOTES.md. |

Do not read the DOM at the top level of a feature; use `whenReady`, `observe` or `addButton`,
so the feature works whether it runs before the page or after it (`reloadIfLate: false`).

## Verify

Click the feature in the real window (`live <id> click <css>`), take a screenshot, check
`live <id> errors` and the log. Write the selector choice and why into NOTES.md.
