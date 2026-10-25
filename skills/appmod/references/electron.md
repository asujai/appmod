# How appmod reaches inside Electron and web-view apps

Electron windows, WebView2 controls and CEF browsers are Chromium pages. With a debugging port
they open a local Chrome DevTools Protocol (CDP) endpoint. The launcher (`core/launcher.mjs`):

1. If this recipe already runs (session file, endpoint answers): web recipes get a new tab,
   other kinds have their window brought to the front, and launch ends. If the endpoint
   answers but its launcher is gone, this launch takes over injecting.
2. If the app runs without the recipe: `--restart` (or yes in the shortcut's dialog) quits it
   politely, then by force after a few seconds; otherwise launch refuses.
3. Starts the exe with the port: `--remote-debugging-port=<port>` (electron, cef, web) or the
   `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` env var (webview2), plus `app.args` and `app.env`.
4. Connects to the browser endpoint, turns on target discovery and attaches to every target
   of `app.targetTypes` (default `page`) explicitly (`Target.attachToTarget`, flatten).
5. Per page: `Page.enable`, `Page.addScriptToEvaluateOnNewDocument` with the bundle (runtime +
   language data + features), `Runtime.enable`, `Runtime.addBinding('__appmodAction')`.
6. A page that loaded before we attached is reloaded once, after its load completes. With
   `reloadIfLate: false` the bundle is injected in place after load instead.
7. Action calls are checked: the calling frame's URL must belong to the recipe
   (`pageFilter.urlPrefix`, or `matches` for web), otherwise the call is refused and logged.
8. Keeps running until the app exits; reconnects if the app restarts itself.

Nothing is written into the app's folder. Starting the app from its own shortcut gives the
untouched app back.

## Port discovery

- Default: the launcher picks a free port and passes it.
- `portFile`: for apps that restart themselves at startup (new process, new port). Pass port 0
  and read `DevToolsActivePort` from the app's user-data folder (Electron writes it there):
  Windows `%APPDATA%/<app-name or appId>/DevToolsActivePort`, macOS
  `~/Library/Application Support/<name>/`, Linux `~/.config/<name>/`. The first line is the port.
- `startTimeoutMs` (default 60000): how long to wait for the port. If the started process
  exits and nothing answers within 20 s, launch stops early: the exe handed the start to
  another process (a running copy, an updater stub, a protocol handler).

## Known behaviour (learned the hard way)

- `addScriptToEvaluateOnNewDocument` silently does nothing until `Page.enable` was sent.
- `Target.setAutoAttach` with `waitForDebuggerOnStart` freezes some windows. Use discovery +
  explicit attach (what the launcher does).
- Reloading a window during its very first load can make an app think startup failed and
  quit. That is what `reloadDelayMs` is for; if a reload still aborts startup, use
  `reloadIfLate: false`.
- A renderer swap (`about:blank` -> remote URL) can drop the new-document script. With
  `reloadIfLate: false` the launcher waits for the real URL and injects after load; the
  script stays registered, so later reloads of that page still get the runtime.
- Single-instance apps forward new arguments to the running instance and exit. The app must be
  fully quit first.
- Apps started through an updater stub (Discord's `Update.exe`, Squirrel apps) need `exe` to
  point at the real binary, e.g. `%LOCALAPPDATA%/Discord/app-*/Discord.exe`. Some apps update
  themselves at start and come back without the port (Discord); launch again after the update.
- Some CEF apps relaunch through a protocol handler and lose the port (NVIDIA App). WinUI 3
  apps bundle WebView2 but their window is XAML (Intel Graphics Software).
- `pageFilter.urlPrefix` keeps the runtime and actions out of pages you do not want (login popups, web
  content views). Check the URLs in `live <id> pages` and the log.
- `<webview>` tags in Electron are separate targets of type `webview`; add `"webview"` to
  `targetTypes` only when the change belongs inside them.
- Main-process UI (tray menu, native menus, OS dialogs, notifications) is not reachable from a
  page. Say so to the user instead of promising it.
- Some apps disable DevTools in their own code, check for the debugging switch
  (`analyze` flags `debugSwitchChecked`) or close when a debugger attaches. If the port opens
  but pages never report `ready`, stop; do not try to defeat it.

## Security note for users

While running, the debugging port lets local programs control the app. It listens on
127.0.0.1 only and lasts as long as the app. Do not use appmod on a shared or untrusted machine.
