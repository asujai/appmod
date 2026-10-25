# Identifying a target and what is possible

Start with what is installed and running, not with the name the user said: two products can
share a name, and voice input mishears names. Then run
`node bin/appmod.mjs analyze --exe "<exe>"`: it prints the kind and the evidence.

| Signs | kind | What to tell the user |
|---|---|---|
| `resources/app.asar` or `resources/app/` next to the exe (Windows/Linux), `Electron Framework.framework` (macOS) | `electron` | Everything in the window can change. |
| `WebView2Loader.dll` next to the exe, or the exe links WebView2 (Tauri, Wails) | `webview`, engine `webview2` | Everything in the web view can change; quit every copy first. |
| `libcef.dll` next to the exe | `webview`, engine `cef` | Possible if the app keeps remote debugging on and starts directly. |
| WinUI 3 (`Microsoft.UI.Xaml.*`), WPF, WinForms, Qt (`Qt*.dll`), native macOS | `native` | The window cannot be injected. Only official routes: language files the app loads (`.qm`, `.resx`, `.lproj`), plugins, documented switches. |
| A website | `web` | Changes live in a separate browser window (one-click shortcut) or an extension for the everyday browser. |
| An app on a phone or TV | `android` | Only the app's language, among languages it ships (Android 13+). No buttons. |
| Games with anti-cheat or DRM, banking or payment apps | — | Do not touch. |

## Before starting

- Read the app's own language list and settings first: the requested language or option may
  already exist. For Electron, `analyze` lists shipped locale files and `asar list locales`
  shows them.
- The Electron version is in `inspect/page-*.json` → `userAgent` (`Electron/x.y.z`).
- A launcher or updater exe (`Update.exe`, Squirrel apps, protocol handlers) is not the real
  app: point `app.exe` at the real binary (`*` in a path segment picks the newest folder).

If no clean path exists, say so plainly. Do not fake a result.
