# Recipe format (schema 1)

A recipe is a folder `recipes/<id>/`:

```
recipe.json        what to start and what to apply
NOTES.md           tested version, what works, pitfalls (required reading before editing)
packs/<code>.json  flat i18n translations: { "settings.title": "Ayarlar" }
text/<code>.json   exact on-screen text outside i18n: { "Auto-run": "Otomatik çalıştır" }
features/*.js      scripts injected into the page (docs/feature-api.md)
features/*.mjs     local scripts run by actions (optional)
files/             files a native recipe installs (optional)
inspect/, analysis/, appmod.log   local output, git-ignored
```

`node bin/appmod.mjs validate <id>` checks a recipe statically; `doctor <id>` checks it against
this machine and lists everything it will run.

## recipe.json

```jsonc
{
  "schema": 1,
  "id": "qoder",                       // kebab-case, same as the folder name
  "name": "Qoder",
  "tested": { "version": "0.4.8", "platform": "win32", "date": "2026-10-21" },  // or null
  "app": {
    "kind": "electron",                // electron | webview | web | android | native
    "exe": {                           // per platform; %VAR%, $VAR, ~ expanded; one * per segment
      "win32": "%LOCALAPPDATA%/Programs/Qoder/Qoder.exe"
    },
    "args": [],                        // extra arguments for the app
    "env": {},                         // extra environment for the started process only
    "portFile": { "win32": "%APPDATA%/com.qoder.app.stable/DevToolsActivePort" },
                                       // optional: read the port the app writes (apps that restart themselves)
    "pageFilter": { "urlPrefix": "qoder-app:" },   // runtime and actions only in pages whose URL starts with this
                                       // (up to a / ? # boundary: "https://a.com" never covers "https://a.com.evil")
    "targetTypes": ["page"],           // optional: CDP target types to inject into ("webview" for <webview> tags)
    "reloadIfLate": true,              // reload a window that loaded before we attached
                                       // false: inject in place after load instead
    "reloadDelayMs": 1500,             // wait this long after load before that reload
    "startTimeoutMs": 60000            // optional: how long to wait for the debugging port
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
folder; `@appmod/` is this repository (shared actions such as
`@appmod/shared/actions/translate.mjs`). `"command": "node"` uses the Node that runs appmod.

Use `reloadIfLate: false` for apps that swap renderers during startup or treat an early reload
as a failed launch. The launcher then waits for the page's own URL and injects the bundle after
load. Features still work because they use `whenReady`/`observe`; the i18n hook only captures
what is initialized afterwards, so language packs normally keep `reloadIfLate: true`.

Actions get the page's input as JSON on stdin and answer on stdout (JSON or text). A non-zero
exit code rejects the page's promise with stderr as the message. Calls from pages outside
`pageFilter.urlPrefix` (web: `matches`) are refused.

## Other kinds

What each kind can do: `skills/appmod/references/kinds.md`.
`node bin/appmod.mjs new <id> --kind <kind>` starts from the matching template.

```jsonc
// webview: WebView2 (Windows) or CEF apps; everything else as for electron
"app": { "kind": "webview", "engine": "webview2", "exe": { "win32": "%LOCALAPPDATA%/Programs/App/App.exe" } }

// web
"app": {
  "kind": "web",
  "browser": "auto",                         // or a Chromium-based browser path per platform
  "startUrl": "https://news.ycombinator.com/",
  "matches": ["https://news.ycombinator.com/*"],   // Chrome match patterns; no port = any port
  "profile": "%LOCALAPPDATA%/appmod/profiles/hn"   // optional; default per recipe
}

// android (no features; language = official per-app language, Android 13+)
"app": { "kind": "android", "package": "com.example.app", "device": "192.168.1.13:5555", "adb": "adb" },
"language": { "code": "tr", "mode": "app-locale" }

// native (no features; official routes only)
"app": {
  "kind": "native",
  "exe": { "win32": "%PROGRAMFILES%/App/App.exe" },
  "args": ["--lang=tr"],
  "env": { "APP_PLUGIN_DIR": "%APPDATA%/App/plugins" },          // for the launched process only
  "install": [{ "from": "files/tr.xml", "to": { "win32": "%APPDATA%/App/lang/tr.xml" } }]
}
```

`install` targets inside the app's folder or system folders need `launch --allow-app-dir`;
`reset` removes installed files and restores backups.
