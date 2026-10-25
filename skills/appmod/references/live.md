# Observing and driving the running target

`appmod launch` leaves a session file (`recipes/<id>/.appmod-session.json`); `live` connects
through it. For a recipe with `portFile`, `live` also works when the app was started by an
older launcher or a shortcut that passes a debugging port.

| Command | Does |
|---|---|
| `live <id> pages` | Lists windows or tabs; `*` marks the one used. `--page <part>` picks another. |
| `live <id> text [css]` | Visible text of the page or one element. Good for "is it translated?". |
| `live <id> anchors [css]` | Elements with stable attributes (`data-*`, `aria-label`, `role`, ids) and their text: candidates for feature selectors. |
| `live <id> html <css>` | Markup of one element, to design an injected control that matches. |
| `live <id> eval <js>` | Evaluates in the page and prints the JSON result (promises are awaited). |
| `live <id> click <css>` | Clicks one element (scrolls it into view first). |
| `live <id> go <url>` | Opens a URL in the current tab (web: check another page of the site). |
| `live <id> shot [file]` | PNG screenshot of the window. |
| `live <id> errors` | `errors`, `i18n` (hook caught the app), `missingKeys` (strings the pack lacks), `injected` (controls added). |
| `live <id> missing [file]` | Writes the strings the pack lacks, read from the running app, to `inspect/missing.<code>.json` and refreshes the strings dump. |
| `live <id> quit` | Closes the app or the recipe's browser. |

## Who acts

- Reading (`pages`, `text`, `anchors`, `html`, `errors`, `shot`, `missing`) is passive. Use
  it freely.
- `click`, `eval` and `go` act in the user's real app with the user's account. Do only what
  the task needs: clicking your own injected control, opening Settings to check translations.
  Never send messages, change account settings, buy, delete or accept anything. Tell the user
  which actions you performed.
- Screenshots and `text` can contain private content (messages, file names). Keep screenshots
  in the recipe's `analysis/` folder (git-ignored) or a temp folder, do not commit, publish or
  quote that content, and delete screenshots when done unless the user wants them.

## Useful evaluations

```js
// Which i18n instance and language are active
({ lng: __appmod.i18n?.language, langs: Object.keys(__appmod.original) })
// The app's theme variables, to restyle everything at once
Array.from(document.styleSheets).flatMap(s => { try { return Array.from(s.cssRules) } catch { return [] } }).filter(r => r.selectorText === ':root').map(r => r.cssText.slice(0, 400))
// Resolve a value hidden by obfuscation: read it where the app exposes it
Object.keys(window).filter(k => /store|state|config/i.test(k))
```

## Verify like this

1. `live <id> errors`: empty `errors`; for language recipes `i18n: true` and `missingKeys: 0`;
   for features `injected` > 0.
2. `live <id> text` shows the target language on the main screen; open Settings (`click`) and
   check again.
3. For a feature: `click` it, `shot`, and look at the screenshot.
4. Report what you checked and what you could not (menus, tray, dialogs owned by the OS).
