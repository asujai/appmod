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

## Pitfalls

- HN markup is stable but plain; class names (`titleline`, `commtext`) are the only anchors.
- The text sent for translation goes to Google. Do not use it for private content.

## Extension

`extension hacker-news` builds an unpacked extension, but the translate button needs the local
action, so in the extension the button reports an error. Use `launch` for this recipe.
