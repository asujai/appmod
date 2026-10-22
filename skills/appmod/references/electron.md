# How appmod reaches inside an Electron app

Electron windows are Chromium pages. Started with `--remote-debugging-port`, the app opens a
local Chrome DevTools Protocol (CDP) endpoint. The launcher (`core/launcher.mjs`):

1. Starts the exe with `--remote-debugging-port=<port>` plus `app.args`.
2. Connects to the browser endpoint, turns on target discovery and attaches to every `page`
   target explicitly (`Target.attachToTarget`, flatten).
3. Per page: `Page.enable`, then `Page.addScriptToEvaluateOnNewDocument` with the bundle
   (runtime + language data + features), `Runtime.enable`, `Runtime.addBinding('__appmodAction')`.
4. A page that already loaded before we attached is reloaded once, after its load completes.
   With `reloadIfLate: false` it gets the bundle injected in place after load instead.
5. Keeps running until the app exits; reconnects if the app restarts itself.

Nothing is written into the app's folder. Quitting the launcher-started app and starting it
from its own shortcut gives the untouched app back.

## Port discovery

- Default: the launcher picks a free port and passes it.
- `portFile`: for apps that restart themselves at startup (new process, new port). Pass port 0
  and read `DevToolsActivePort` from the app's user-data folder (Electron writes it there):
  Windows `%APPDATA%/<app-name or appId>/DevToolsActivePort`, macOS
  `~/Library/Application Support/<name>/`, Linux `~/.config/<name>/`. The first line is the port.

## Known Electron behaviour (learned the hard way)

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
  fully quit first; the launcher refuses to start when the exe is running (`--force` skips it).
- Apps started through an updater stub (Discord's `Update.exe`, Squirrel apps) need `exe` to
  point at the real binary, e.g. `%LOCALAPPDATA%/Discord/app-*/Discord.exe`. Arguments given to
  the stub are often not passed through.
- `pageFilter.urlPrefix` keeps the runtime out of pages you do not want (login popups, web
  content views). Check the URLs in `inspect/page-*.json` and the log.
- Main-process UI (tray menu, native menus, OS dialogs, notifications) is not reachable from a
  page. Say so to the user instead of promising it.
- Some apps disable DevTools in their own code or close when a debugger attaches. If the port
  opens but pages never report `ready`, check the log and stop; do not try to defeat it.

## Security note for users

While running, the debugging port lets any local program control the app. It listens on
127.0.0.1 only and lasts as long as the app. Do not use appmod on a shared or untrusted machine.
