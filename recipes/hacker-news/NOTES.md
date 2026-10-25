# Hacker News — recipe notes

Web recipe. Tested 2026-10-22 with Chrome on Windows 11, no login needed.

## What works

- A small `TR` button after every story title (`.titleline > a`) and comment (`.commtext`).
  Clicking it translates through the shared `translate` action
  (`shared/actions/translate.mjs`, Google's unofficial endpoint) and shows the result under the
  line; clicking again hides it.
- Verified: 30 buttons on the front page, first title translated, log `action translate: ok`,
  `appmod.errors` empty. Navigating the same tab to example.com left the runtime unloaded
  there (`matches` guard).
- 2026-10-25, `launch hacker-news --headless`: same results without a window. On example.com a
  direct call of the action binding was refused (`action translate: refused on
  https://example.com/`); before this check a foreign page in the recipe's tab could run
  declared actions.

- Feature `features/theme.js`: dark theme (HN has none). A `◐` button at the right of the top
  bar (`td[style*="text-align:right"] > .pagetop`, the cell that holds login) and Alt+Shift+D
  toggle it; `appmod.store` remembers the choice across reloads. CSS only: `#hnmain` and the
  orange header carry `bgcolor` attributes, which author CSS overrides. Verified 2026-10-25:
  `#hnmain` turns `rgb(28, 28, 26)`, one button, choice kept after reload, translations stay
  readable. (Alt+D is Chrome's address bar, hence Alt+Shift+D.)

## Pitfalls

- Feature scripts run before the document exists: touching `document.documentElement` at the
  top level threw `Cannot read properties of null`. Apply DOM changes in `whenReady`.

- HN markup is stable but plain; class names (`titleline`, `commtext`) are the only anchors.
- The text sent for translation goes to Google. Do not use it for private content.

## Extension

`extension hacker-news` builds an unpacked extension, but the translate button needs the local
action, so in the extension the button reports an error. Use `launch` for this recipe.
