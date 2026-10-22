# Observing and driving the running app

`appmod launch` leaves a session file (`recipes/<id>/.appmod-session.json`); `live` connects
through it. For a recipe with `portFile`, `live` also works when the app was started by an
older launcher or a shortcut that passes a debugging port.

| Command | Does |
|---|---|
| `live <id> pages` | Lists windows; `*` marks the one used. `--page <part>` picks another. |
| `live <id> text [css]` | Visible text of the page or one element. Good for "is it translated?". |
| `live <id> anchors [css]` | Elements with stable attributes (`data-*`, `aria-label`, `role`) and their text: candidates for feature selectors. |
| `live <id> html <css>` | Markup of one element, to design an injected button that matches. |
| `live <id> eval <js>` | Evaluates in the page and prints the JSON result (promises are awaited). |
| `live <id> click <css>` | Clicks one element (scrolls it into view first). |
| `live <id> shot [file]` | PNG screenshot of the window. |
| `live <id> errors` | `window.__appmod.errors`, whether the runtime and i18n hook are present. |

## Who acts

- Reading (`pages`, `text`, `anchors`, `html`, `errors`, `shot`) is passive. Use it freely.
- `click` and `eval` act in the user's real app with the user's account. Do only what the task
  needs: clicking your own injected button, opening Settings to check translations. Never send
  messages, change account settings, buy, delete or accept anything. Tell the user which
  actions you performed.
- Screenshots can contain private content. Keep them in the recipe's `analysis/` folder
  (git-ignored), do not commit or publish them, and delete them when done unless the user wants
  them.

## Useful evaluations

```js
// Which i18n instance and language are active
({ lng: __appmod.i18n?.language, langs: Object.keys(__appmod.original) })
// Resolve a value hidden by obfuscation: read it where the app exposes it
Object.keys(window).filter(k => /store|state|config/i.test(k))
// Check a feature without clicking
document.querySelectorAll('[data-appmod-id]').length
```

## Verify like this

1. `live <id> errors` is empty and `i18n` is true for language recipes.
2. `live <id> text` shows the target language on the main screen; open Settings (`click`) and
   check again.
3. For a feature: `anchors` to confirm the button exists, `click` it, `shot` to see the result.
4. Report what you checked and what you could not (menus, tray, dialogs owned by the OS).
