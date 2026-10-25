# appmod

[![tests](https://github.com/asujai/appmod/actions/workflows/test.yml/badge.svg)](https://github.com/asujai/appmod/actions/workflows/test.yml)

**Your language, your look and your small tweaks, in the apps and sites you already use. Ask
your AI agent once; get a desktop shortcut that opens the app your way.**

appmod is an open standard and toolkit for changing apps you don't own, for yourself: add a
missing interface language, restyle a screen, hide clutter, add a button or a keyboard
shortcut, translate messages on demand, or connect a local script. It never edits the app's
files. Every change lives in a **recipe**, and every recipe records what worked and what broke,
so the next person does not start from zero.

It is built for AI coding agents (Claude Code, Codex, Gemini CLI, Antigravity and others). The
`skills/appmod` skill tells the agent how to understand the wish, find the cheapest route, read
the target, apply the change safely, verify it on screen and hand over one shortcut.

[Türkçe](README.tr.md)

## Install (once)

```bash
git clone https://github.com/asujai/appmod.git
node appmod/bin/appmod.mjs setup
```

`setup` copies the skill into every coding agent it finds (Claude Code `~/.claude/skills`,
Codex and Gemini CLI `~/.agents/skills`, Antigravity `~/.gemini/config/skills`) with this
folder's location written in. Needs Node.js 22+, nothing else. `node appmod/bin/appmod.mjs
doctor` shows what this machine has. Re-run `setup` after `git pull`.

Or let the agent do it: *"Install appmod from github.com/asujai/appmod and run its setup."*

## Use it

Ask your agent in your own words:

> "Qoder only has English and Chinese. Make it Turkish."
>
> "Give Discord a translate button on every message."
>
> "Put a translate button next to every Hacker News title."
>
> "Make this site's text bigger and hide the sidebar."
>
> "Make this Android TV app use Turkish."

The agent finds or creates `recipes/<app>/`, applies the change, checks it on screen and puts a
shortcut on your desktop. **Double-click it** and the app opens with your changes. If the app is
already open without them, it asks to restart it; if it already runs with them, it comes to the
front. The app's own shortcut still opens it unchanged.

## What it covers

| Kind | Examples | Can change | How | One click | Undo |
|---|---|---|---|---|---|
| `electron` | Qoder, Discord, Slack, VS Code forks | everything in the window | injection at launch over a local debugging port | desktop shortcut | start the app normally |
| `webview` | WebView2 apps (Tauri, Wails, web-UI Windows tools), CEF apps | everything in the web view | same, port via `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` or a switch | desktop shortcut | start the app normally |
| `web` | any website | everything on the matched pages | separate browser profile, or an extension for your browser | desktop shortcut or extension | close it / remove the extension |
| `android` | apps on a phone or TV over ADB | the app's language (languages it ships) | official per-app language (Android 13+) | desktop shortcut | `reset` |
| `native` | WinUI, WPF, Qt and other desktop apps | what the app supports | its official routes: language and plugin folders, switches, env vars | desktop shortcut | `reset` |

appmod reads Electron apps, web views and websites itself. For native, .NET and APK code it
calls [REA](https://github.com/morluto/rea) on demand (installed, or fetched once by `npx`).

## Commands

```bash
node bin/appmod.mjs setup                        # install the skill into your agents
node bin/appmod.mjs doctor [recipe]              # machine check; recipe: version, state, what it runs
node bin/appmod.mjs list                         # recipes
node bin/appmod.mjs new my-app --kind web        # new recipe from a template
node bin/appmod.mjs analyze --exe "C:/.../App.exe"  # what kind of app is this, what can be hooked
node bin/appmod.mjs analyze qoder                # read an Electron app without running it
node bin/appmod.mjs inspect qoder                # dump an app's strings
node bin/appmod.mjs check qoder                  # pack vs. app: missing keys, broken placeholders
node bin/appmod.mjs validate --all               # static checks of every recipe
node bin/appmod.mjs launch hacker-news           # start the target with the recipe
node bin/appmod.mjs launch hacker-news --headless   # same, no window (checks, CI)
node bin/appmod.mjs live hacker-news shot a.png  # see what the running target shows
node bin/appmod.mjs live qoder missing           # after an app update: strings the pack lacks
node bin/appmod.mjs shortcut qoder               # desktop shortcut (Windows, macOS, Linux)
node bin/appmod.mjs extension hacker-news        # web: unpacked extension for your own browser
node bin/appmod.mjs reset my-android-app         # android/native: undo
```

`node bin/appmod.mjs help` lists every command and option.

## How it works

```
electron / webview / web:
  launcher ──starts──▶ App.exe or browser with a debugging port (127.0.0.1 only)
     └── CDP, for every matching window, before its scripts run:
           runtime.js   i18next capture + language pack, exact-text map
           features/*   styles, hidden elements, buttons, shortcuts, small behaviours
           binding      features call declared local actions (only from the recipe's pages)
android:  adb ── cmd locale set-app-locales <package> <code>
native:   copy declared files (with backup) ── start exe with args/env
analysis: asar + fuses + kind detection + live CDP built in; REA for native, .NET, APK code
```

Details: `skills/appmod/references/`; recipe format: `docs/recipe-format.md`; feature API:
`docs/feature-api.md`.

## Limits

- Changes last until the app updates. `doctor <recipe>` shows the version change and
  `live <recipe> missing` the new strings; the agent redoes what moved.
- Main-process UI (tray, native menus, OS dialogs) stays as it is. WinUI, WPF and Qt windows
  cannot be injected; only their official routes work. Android cannot get new buttons.
- While an app runs under appmod, its debugging port (127.0.0.1 only) lets local programs
  control it. Do not use appmod on shared or untrusted machines.
- Tested by hand on Windows 11. The CI workflow runs the test suite on Windows, macOS and
  Linux; shortcuts and desktop apps there have not been tried by hand yet.

## Recipes

| Recipe | Kind | Change | Tested |
|---|---|---|---|
| [Qoder](recipes/qoder/NOTES.md) | electron | Turkish interface (9,628 keys + 209 texts) | 0.4.8, Windows 11, 2026-10-25 |
| [Discord](recipes/discord/NOTES.md) | electron | translate button on every message | 1.0.9264, Windows 11 |
| [Hacker News](recipes/hacker-news/NOTES.md) | web | translate button on titles and comments, dark theme | Chrome, Windows 11, 2026-10-25 |

Templates for every kind: `recipes/_template*`. New recipes are welcome: see
[CONTRIBUTING.md](CONTRIBUTING.md).

## Disclaimer

For personal use on your own devices. Some apps' terms of service forbid client modification;
you are responsible for respecting them. appmod does not touch accounts, payments, DRM or
anti-cheat, does not unlock paid features, and recipes must not either. Language packs contain
translations of the apps' interface strings; app names and trademarks belong to their owners.
Not affiliated with any of the apps listed or with REA.

MIT licensed. Analysis guidance adapted from REA (MIT); see `THIRD_PARTY_NOTICES.md`.
