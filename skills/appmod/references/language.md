# Adding a language

## 1. Find where the strings live

After `inspect`, `page-*.json` → `found` and `namespaces` tell you:

- **i18next found** (most common in Electron apps): `strings.<lng>.<ns>.json` holds the app's
  original strings as flat `"a.b.c": "text"` pairs. Set `language.i18n.library: "i18next"`,
  `base` to the source language (usually `en`) and `namespace` to the one with the UI strings.
  If several namespaces matter, pick the largest first and note the rest in NOTES.md.
- **Nothing found**: the app hard-codes text or uses a library appmod has no adapter for. Use
  the `text` map only (`library: "none"`): `page-*.json` → `visibleText` is a starting list.
  Walk through the main screens, re-run inspect where needed, and say clearly that coverage
  will be partial. Writing a new adapter belongs in `runtime/runtime.js` with a test.
- **The app has its own language menu**: check whether the requested language is simply not
  offered or genuinely absent. If present, stop and point the user to the setting.

## 2. override or add

- `override` (default, most robust): writes the translation over the base language. The app
  keeps thinking it shows English; its menu is unchanged. Choose this unless the user needs to
  switch back and forth inside the app.
- `add`: registers a new language code and switches to it at startup; missing keys fall back
  to `base`. The app's own language picker will not list it unless a feature script adds it
  (references/features.md, "language menu entry"). Apps that validate the language against a
  fixed list may reset it; then use `override`.

## 3. Translate

- Input: `inspect/strings.<base>.<ns>.json` (or `inspect/missing.<code>.json` after an update).
- Split into chunks of roughly 400–800 keys and translate them in parallel with sub-agents.
  Give each the same short glossary (product terms that stay in English, the formality level,
  how to translate recurring words like Settings, Workspace, Agent) so chunks stay consistent.
- Keep every key exactly. Translate values only. Keep placeholders and markup untouched:
  `{{name}}`, `{count}`, `%s`, `%1$d`, `$t(other.key)`, `<0>…</0>`, `<b>`, `\n`.
- Keep plural suffix keys (`_one`, `_other`, `_few`, `_many`) the target language needs; for
  languages without plural forms, `_one` and `_other` may carry the same text.
- Keep UI strings short; buttons must fit. Brand and product names stay as they are.
- Merge the chunks into `packs/<code>.json` (flat, UTF-8, keys sorted for stable diffs).

## 4. Check and fix

`node bin/appmod.mjs check <id>` reports missing keys (written to `inspect/missing.<code>.json`),
placeholder mismatches, empty values and keys that no longer exist in the app. Fix until `ok`.
"same as source" counts are fine for brand names and codes; scan them for forgotten strings.

## 5. Strings outside i18n

Whatever is still in the base language on screen after launch goes into `text/<code>.json` as
exact visible text → translation (whole text node or `placeholder`/`title`/`aria-label`
value). Keep it to short UI labels; never map sentences that could appear in user content.
