# appmod

**Your language and your small tweaks, in the apps and sites you already use.**

appmod is an open standard and toolkit for changing apps you don't own, for yourself: add a
missing interface language, or a small personal feature (a button, a shortcut, a hook to a
local script). It never edits the app's files. Every change lives in a **recipe**, and every
recipe records what worked and what broke, so the next person does not start from zero.

It is built for AI coding agents (Claude Code, Codex, Gemini/Antigravity and others). The
`skills/appmod` skill tells the agent what to check, how to read the target, how to apply a
change safely and how to verify it on screen.

[Türkçe](README.tr.md)

## What it covers

| Kind | Example | How it reads | How it changes | Undo |
|---|---|---|---|---|
| `electron` | Qoder, Discord, Slack, VS Code forks | asar, fuses, i18n, env vars, IPC (built in) | injects at launch over CDP | start the app normally |
| `web` | any website | live DOM (built in) | separate browser profile, or an unpacked extension | close it / remove the extension |
| `android` | apps on a phone or TV over ADB | shipped languages via `aapt2`; code via REA | official per-app language (Android 13+) | `reset` |
| `native` | other desktop apps | REA | the app's official routes: language/plugin folders, args, env | `reset` |

appmod reads Electron apps and websites itself. For native, .NET and APK code it calls
[REA](https://github.com/morluto/rea) on demand (installed, or fetched once by `npx`), so you
only ever run appmod. REA understands targets; appmod adds the part REA deliberately does not
do: applying and sharing changes.

## What a request looks like

> "Qoder only has English and Chinese. Add Turkish."
>
> "Put a translate button next to every Hacker News title."
>
> "Make this Android TV app use Turkish."

The agent finds or creates `recipes/<app>/`, analyzes the target, applies the change, verifies
it on screen and writes down the pitfalls.

## Requirements

- Node.js 22 or newer (no npm dependencies)
- Web recipes: Chrome or Edge. Android recipes: `adb` (and Android SDK build-tools for `aapt2`).
- Windows is tested. macOS and Linux paths are supported in recipes but untested so far.

## Quick start

```bash
node bin/appmod.mjs list                         # recipes and their kinds
node bin/appmod.mjs new my-app --kind web        # new recipe from a template
node bin/appmod.mjs analyze qoder                # read the target without running it
node bin/appmod.mjs search qoder "PLUGIN_DEV"    # find a literal in an Electron app's code
node bin/appmod.mjs inspect qoder                # dump an Electron app's strings
node bin/appmod.mjs check qoder                  # pack vs. app: missing keys, broken placeholders
node bin/appmod.mjs launch hacker-news           # apply the recipe and start the target
node bin/appmod.mjs live hacker-news shot a.png  # see what the running target shows
node bin/appmod.mjs extension hacker-news        # web: unpacked extension for your own browser
node bin/appmod.mjs reset my-android-app         # android/native: undo
node bin/appmod.mjs rea doctor --json            # run any REA command through appmod
```

`node bin/appmod.mjs help` lists every command.

## Use it with your agent

Copy or link `skills/appmod` into your agent's skills folder (for example
`~/.claude/skills/appmod`, or `.agents/skills/appmod` in a project) and keep this repository
where the skill can find `bin/appmod.mjs`. Then just ask for the change.

## How it works

```
electron / web:  launcher ──starts──▶ App.exe or browser --remote-debugging-port
                     └── CDP, for every matching window, before its scripts run:
                           runtime.js   i18next capture + language pack, exact-text map
                           features/*   buttons, shortcuts, styles
                           binding      features call declared local actions (script -> JSON)
android:         adb ── cmd locale set-app-locales <package> <code>
native:          copy declared files (with backup) ── start exe with args/env
analysis:        asar + fuses + live CDP built in; REA for native, .NET, APK code
```

Details: `skills/appmod/references/` (kinds, electron, analysis, live, language, features);
recipe format: `docs/recipe-format.md`; feature API: `docs/feature-api.md`.

## Limits

- Changes last until the app updates; re-run `analyze`/`inspect`/`check` and fix what moved.
- Electron main-process UI (tray, native menus, OS dialogs) stays as it is.
- Android and native recipes cannot add buttons: no injection without root or the app's own
  plugin system. Android per-app language only selects languages the app ships.
- While an app runs under `launch`, its debugging port (127.0.0.1 only) lets local programs
  control it. Do not use appmod on shared or untrusted machines.

## Recipes

| Recipe | Kind | Language | Features | Tested |
|---|---|---|---|---|
| [Qoder](recipes/qoder/NOTES.md) | electron | Turkish (9,182 keys + 209 texts) | — | 0.4.8, Windows 11 |
| [Discord](recipes/discord/NOTES.md) | electron | — | message translation button | 1.0.9264, Windows 11 |
| [Hacker News](recipes/hacker-news/NOTES.md) | web | — | translate button on titles and comments | 2026-10-22, Chrome, Windows 11 |

Templates for every kind: `recipes/_template*`. Contributions welcome: a recipe folder with a
`NOTES.md` that says what you tested.

## Disclaimer

For personal use on your own devices. Some apps' terms of service forbid client modification;
you are responsible for respecting them. appmod does not touch accounts, payments, DRM or
anti-cheat, does not unlock paid features, and recipes must not either. Language packs contain
translations of the apps' interface strings; app names and trademarks belong to their owners.
Not affiliated with any of the apps listed or with REA.

MIT licensed. Analysis guidance adapted from REA (MIT); see `THIRD_PARTY_NOTICES.md`.
