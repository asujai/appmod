# Recipe kinds

Every recipe has `app.kind`. The kind decides how appmod reads the target and how it applies a
change. Pick it from what the target is (`analyze --exe`, references/new-app.md), not from the
user's wording.

| Kind | Target | Reads with | Applies by | Language | Features | One click | Undo |
|---|---|---|---|---|---|---|---|
| `electron` | Electron app | `analyze` (asar, fuses), `inspect`, `live` | CDP injection at launch | i18next pack, text map | yes, plus actions | `shortcut` | start the app normally |
| `webview` | WebView2 or CEF app | `analyze` (engine, UI files), `inspect`, `live` | CDP injection at launch | i18next pack, text map | yes, plus actions | `shortcut` | start the app normally |
| `web` | website | `live` (after `launch --headless`) | injection in a separate browser profile, or an extension | i18next pack, text map | yes; actions only with `launch` | `shortcut` or `extension` | close it / remove the extension |
| `android` | app on a device over ADB | `analyze` (`aapt2`; `--code` adds REA + JADX) | official per-app language (Android 13+) | only languages the APK ships | no | `shortcut` (sets it and opens the app) | `reset` |
| `native` | any other desktop app | `analyze` via REA | official routes: files into folders the app loads, args, env | via the app's own language files | no | `shortcut` | `reset` |

## electron

Everything in the window can change: language, look, controls, behaviour. The main process
(tray, native menus, OS dialogs, notifications) cannot. references/electron.md.

## webview

Windows apps whose window is a WebView2 control (Tauri, Wails, many vendor tools) and apps on
the Chromium Embedded Framework (CEF). Set `app.engine`:

- `webview2`: `launch` puts `--remote-debugging-port` into `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS`
  for the started process only; WebView2 appends it to the app's own arguments. A WebView2
  browser already running for that app (tray copy, background helper) ignores it: quit every
  copy first.
- `cef`: `launch` passes `--remote-debugging-port`. CEF apps can switch remote debugging off in
  code, and some relaunch themselves through a protocol handler or a service, which drops the
  argument (NVIDIA App does). If no port opens, there is no supported route; say so.
- WinUI 3, WPF and WinForms apps often bundle WebView2 for a single page; their main window is
  native and cannot be injected. `analyze --exe` reports WinUI 3 as `native`; for WPF/WinForms
  hosts, `live <id> pages` after launch shows which parts are web.
- macOS and Linux Tauri apps use the system WebKit, which has no debugging port: no route.

## web

- `startUrl` opens in Chrome or Edge with its own profile
  (`%LOCALAPPDATA%/appmod/profiles/<id>`). The everyday browser is untouched and may keep
  running. If the site needs a login, the user signs in once in that window; never type their
  credentials.
- `matches` (Chrome match patterns) limit where the runtime and actions work. A pattern
  without a port matches every port. Navigating elsewhere leaves the runtime out, and a page
  outside `matches` that calls the action binding is refused. Keep patterns narrow.
- `launch <id> --headless` runs the browser without a window: use it to explore and check
  without taking over the user's screen. The user's shortcut runs it with a window.
- `extension <id>` builds `dist/extension/` (Manifest V3, main world, `document_start`) for the
  everyday browser: chrome://extensions, Developer mode, Load unpacked. Actions do not work
  there: anything that needs a local command stays a `launch` feature or calls a public API
  the site's CSP allows.
- Sites change their markup often. Prefer `aria-label`, `role`, `data-*` and semantic structure
  over class names; note the selectors and the date in NOTES.md.

## android

- No root, no injection: an installed app's UI cannot be changed from outside. Say so when the
  user asks for a button or a new feature on Android.
- `analyze` pulls the base APK into `analysis/` and lists shipped languages with the SDK's
  `aapt2`. If the requested language is not shipped, per-app language cannot add it; offer the
  system language or tell the user plainly.
- `launch` sets the per-app language (`cmd locale set-app-locales`) and starts the app;
  `reset` clears it. Launching shows the app on the device: on a TV or a phone in use, ask
  before launching.
- `--code` runs REA's APK inspection. It needs a JADX jar (`REA_JADX_MCP_JAR`); without it the
  error is saved next to the report and the rest of the analysis stands.

## native

- appmod cannot inject into native code. Use only routes the app supports: a language folder,
  a plugin or theme folder, a documented switch or environment variable. Find them in the
  app's documentation, its own folders, or with `analyze` (REA) and `rea` commands.
- `install` copies files; an existing file is renamed to `*.appmod-backup` and restored by
  `reset`. Targets inside the app's install folder or system folders are refused unless the
  user agreed and you pass `--allow-app-dir` (updates may undo it, integrity checks may reject
  it).
- `env` and `args` apply only to the process appmod starts, so a running copy must be quit
  first (`launch --restart` after the user agreed). Nothing changes system-wide.

## REA

appmod reads Electron and web-view apps itself. For native, .NET and APK code it calls REA
(github.com/morluto/rea, MIT): `APPMOD_REA` if set, `rea` on PATH, otherwise
`npx -y rea-agents@6.7.0` (downloads the pinned package once). Any REA command is available as
`node bin/appmod.mjs rea <command> ...`; `rea doctor --json` shows which REA providers
(Ghidra, JADX, apktool) are available. REA results are evidence; read them with the rules in
references/analysis.md.
