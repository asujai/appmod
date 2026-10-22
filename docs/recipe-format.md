# Recipe format (schema 1)

A recipe is a folder `recipes/<id>/`:

```
recipe.json        what to start and what to apply
NOTES.md           tested version, what works, pitfalls (required reading before editing)
packs/<code>.json  flat i18n translations: { "settings.title": "Ayarlar" }
text/<code>.json   exact on-screen text outside i18n: { "Auto-run": "Otomatik çalıştır" }
features/*.js      scripts injected into the page (docs/feature-api.md)
features/*.mjs     local scripts run by actions (optional)
inspect/           output of `inspect` and `check` (git-ignored)
```

## recipe.json

```jsonc
{
  "schema": 1,
  "id": "qoder",                       // kebab-case, same as the folder name
  "name": "Qoder",
  "tested": { "version": "0.4.8", "platform": "win32", "date": "2026-10-21" },  // or null
  "app": {
    "kind": "electron",                // only kind supported for now
    "exe": {                           // per platform; %VAR%, $VAR, ~ expanded; one * per segment
      "win32": "%LOCALAPPDATA%/Programs/Qoder/Qoder.exe"
    },
    "args": [],                        // extra arguments for the app
    "portFile": { "win32": "%APPDATA%/com.qoder.app.stable/DevToolsActivePort" },
                                       // optional: read the port the app writes (apps that restart themselves)
    "pageFilter": { "urlPrefix": "qoder-app:" },   // inject only into pages whose URL starts with this
    "reloadIfLate": true,              // reload a window that loaded before we attached
    "reloadDelayMs": 1500              // wait this long after load before that reload
  },
  "language": {                        // optional
    "code": "tr",
    "name": "Türkçe",
    "i18n": {
      "library": "i18next",            // "i18next" or "none" (text map only)
      "base": "en",                    // the language the pack is translated from
      "namespace": "translation",
      "mode": "override"               // "override" the base language, or "add" a new code
    },
    "pack": "packs/tr.json",           // optional
    "text": "text/tr.json"             // optional
  },
  "maxTextLength": 120,                // optional: longest text node the text map may replace
  "features": ["features/button.js"],  // optional, injected in order after the runtime
  "actions": {                         // optional: local commands features may call
    "transcribe": { "command": "node", "args": ["./features/transcribe.mjs"], "timeoutMs": 15000 }
  }
}
```

Paths in `language`, `features` and action args starting with `./` are relative to the recipe
folder. `"command": "node"` uses the Node that runs appmod.

Actions get the page's input as JSON on stdin and answer on stdout (JSON or text). A non-zero
exit code rejects the page's promise with stderr as the message.
