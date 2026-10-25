---
name: appmod
description: Personalize an app or website the user already uses, for themselves, without touching its files. Add or fix the interface language, translate content on demand, change the look (theme, colors, font size, density), hide clutter, add a button, menu item or keyboard shortcut, automate a small step, or connect a local script. Works on desktop Electron, WebView2 and CEF apps, websites, Android apps over ADB, and other desktop apps through their official routes. Use whenever the user wants to change how an app or site looks or behaves for them.
---

# appmod

The user says what they want once. You deliver it working, checked on screen, behind one
desktop shortcut (or a browser extension), and leave a recipe that the next person reuses.

Location: the folder that contains `bin/appmod.mjs`. Run `node bin/appmod.mjs <command>` from there (Node 22+); `help` lists every command.

## 1. Understand the request once

- Find out yourself what you can: which apps are installed and running (names are often
  misheard or shared by two products), versions, what the app already offers. Then ask
  everything still unknown in one message, and work without further questions except the
  confirmations below.
- Sort the wish into one or more of: **language** (the interface in another language),
  **content translation** (messages, posts, on demand), **look** (theme, colors, fonts, size,
  spacing), **hide** (clutter), **control** (button, menu item, keyboard shortcut),
  **behaviour** (a default, a small automatic step), **local tool** (needs a program on the
  computer). One recipe holds all of them.
- Confirm before: working on an app whose terms forbid client modification (Discord is one; say
  it once and let the user decide); adding an action (runs local commands); sending the user's
  content to a third party (translation services); quitting an app that is running; env vars
  or files outside the started process; writing into an app or system folder.
- Never: accounts, payments, paywalls or paid features, DRM, anti-cheat, other people's data,
  actions toward other people (sending, posting, liking) the user did not trigger. Ad and
  tracker blocking belongs to a dedicated blocker, not a recipe.

## 2. Cheapest route first

Stop at the first one that works and tell the user where it is:

1. The app already does it: a setting, theme, shortcut editor, or a language it ships
   (`analyze` lists shipped locale files; the app's language menu may just be hidden).
2. An official route: the app's plugin or extension system, a documented switch (`--lang`),
   an env var, a language folder the app reads.
3. A recipe: the steps below.

## 3. Identify the target and its kind

`node bin/appmod.mjs analyze --exe "<exe>"` prints the kind of a desktop app with evidence.
Websites are `web`; apps on a phone or TV over ADB are `android`.

| kind | Target | Can change |
|---|---|---|
| `electron` | Electron apps (Discord, Slack, VS Code forks, Qoder) | everything in the window |
| `webview` | WebView2 apps (Tauri, Wails, web-UI Windows apps) and CEF apps | everything in the web view |
| `web` | websites | everything on the matched pages |
| `android` | installed apps over ADB | the app's language, only among languages it ships |
| `native` | anything else, including WinUI, WPF, Qt | only what the app supports: language files, plugins, args, env |

Say up front what the kind cannot do (no buttons on Android or native; WinUI/WPF/Qt windows
cannot be injected) and offer the nearest possible thing. Details: references/kinds.md.

## 4. The recipe

- `list`. If the app has a recipe, read its `NOTES.md` and run `doctor <id>`: installed vs.
  tested version, running state, and everything the recipe will run. Fix and reuse it.
- Otherwise `new <id> --kind <kind>` and fill `app` (docs/recipe-format.md).
- A recipe written by someone else: read the `doctor` list and its feature scripts before the
  first launch; actions run commands on this computer.

## 5. Read the target before changing it

- electron: `analyze <id>`, then `search` / `asar cat` for single questions
  (references/analysis.md).
- webview and web: `launch <id>` (web: add `--headless` to stay off the user's screen while
  exploring), then `live <id> anchors | text | html | eval` (references/live.md).
- android: `analyze <id>` (shipped languages). native: `analyze <id>` (calls REA).
- Desktop targets must be fully quit (tray and background too) before `launch`. `launch
  --restart` quits them for you; use it only after the user agreed.

## 6. Build

- language: references/language.md (`inspect`, translate in chunks, `check` until ok).
- look, hide, control, behaviour, content translation, local tool: references/features.md
  (patterns and the `appmod` API).
- `validate <id>` must print ok.

## 7. Verify on screen

Not seen working = not done. `launch <id>`, then:

- `live <id> errors`: no errors; `i18n: true` and `missingKeys: 0` for language packs;
  `injected` > 0 when you added controls.
- `live <id> shot <file>` of the main screen, settings, one dialog, and each new control
  after `live <id> click <css>`. Look at every screenshot.
- `recipes/<id>/appmod.log`: actions ok, nothing refused.
- Name what you could not check (tray, native menus, OS dialogs). Close what you started only
  for checking (`live <id> quit`) unless the user wants it open.

## 8. Deliver one click

- `shortcut <id>`: a desktop shortcut for every kind. Double-click starts the target with the
  recipe; if it is open without it, a dialog offers to restart it; if it already runs with
  it, it comes to the front.
- Websites in the user's everyday browser: `extension <id>` (no actions there).
- Tell the user plainly: what changed, the shortcut's name, how to undo (start the app
  normally, `reset <id>`, or remove the extension), what is not covered, and that after an
  app update `doctor <id>` shows what to redo.

## 9. Leave the recipe better

Update `tested` (version, platform, date). Write every pitfall, and every selector with the
reason it was chosen, into `NOTES.md`. That file saves the next person hours.

## After an app update

`doctor <id>` shows the version change. Launch, then `live <id> errors`: `missingKeys` counts
strings the pack lacks. `live <id> missing` writes them to `inspect/missing.<code>.json`;
translate, merge into the pack, `check`, launch again, and re-check every feature.

## When stuck

- Port never opens: a copy still runs (tray, background helper), the exe is an updater stub or
  hands off through a protocol handler (point `exe` at the real binary; `*` in a path segment
  picks the newest folder), the app restarts itself on a new port (set `portFile`,
  references/electron.md), or the window is not a web view at all.
- Strings stay in the original language: they are outside the i18n library (add them to the
  `text` map) or come from the main process (tray, native menus), which no recipe reaches.
- Window freezes or closes on launch: raise `reloadDelayMs`; if a reload aborts startup or the
  renderer is swapped, set `reloadIfLate: false`.
- The app blocks debugging or closes on attach: stop and tell the user. Never defeat it.
