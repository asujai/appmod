# appmod

**Your language and your small tweaks, in the desktop apps you already use.**

appmod adds a missing interface language, or a small personal feature (a button, a shortcut, a
hook to a local script), to an installed Electron app. It never edits the app's files: it
starts the app with a local debugging port and injects the changes into its windows at launch.
Start the app from its normal shortcut and you get the untouched original back.

Everything an agent needs is in this one repository: it **reads** the app (asar, Electron fuses,
i18n libraries, env vars, switches, plugin folders, IPC), **observes and drives** the running
app (text, selectors, clicks, screenshots), and **changes** it (language packs, features,
local actions). No other reverse-engineering tool has to be installed.

It is built for AI coding agents (Claude Code, Codex, Gemini/Antigravity and others). The
`skills/appmod` skill tells the agent exactly what to check, where strings live, how to
translate safely and how to verify. Every app gets a **recipe** that records what worked and
what broke, so the next person does not start from zero.

[Türkçe](README.tr.md)

## What a request looks like

> "Qoder only has English and Chinese. Add Turkish."
>
> "Add a button next to the send button that pastes my clipboard as a code block."

The agent finds or creates `recipes/<app>/`, analyzes the shipped code, inspects the running
app, translates the dumped strings, checks placeholders, launches the app with the recipe,
verifies on screen and leaves a desktop shortcut.

## Requirements

- Node.js 22 or newer (no npm dependencies)
- An Electron app (VS Code forks, Qoder, Cursor, Slack, Obsidian, Notion, Discord, …).
  Other app types: see `skills/appmod/references/new-app.md`.
- Windows is tested. macOS and Linux paths are supported in recipes but untested so far.

## Quick start

```bash
node bin/appmod.mjs list                 # recipes in this repo
node bin/appmod.mjs analyze qoder        # read the shipped code: fuses, i18n, hooks (app need not run)
node bin/appmod.mjs search qoder "PLUGIN_DEV"   # find a literal in the code, with context
node bin/appmod.mjs inspect qoder        # quit the app first; dumps its strings
node bin/appmod.mjs check qoder          # pack vs. app: missing keys, broken placeholders
node bin/appmod.mjs launch qoder         # start the app with the recipe
node bin/appmod.mjs shortcut qoder       # desktop shortcut (Windows)
node bin/appmod.mjs live qoder text      # what the running window shows
node bin/appmod.mjs live qoder shot a.png # screenshot of the running window
node bin/appmod.mjs new my-app           # new recipe from the template
```

`node bin/appmod.mjs help` lists every command.

## Use it with your agent

Copy or link `skills/appmod` into your agent's skills folder (for example
`~/.claude/skills/appmod`, or `.agents/skills/appmod` in a project) and keep this repository
where the skill can find `bin/appmod.mjs`. Then just ask for the change.

## How it works

```
launcher ──starts──▶ App.exe --remote-debugging-port
    │                         │
    └── CDP: for every window, before its scripts run:
          runtime.js   captures the app's i18next instance, applies the language pack,
                       replaces exact on-screen text the i18n library does not own
          features/*   your buttons, shortcuts, styles
          binding      lets features call declared local actions (run a script, get JSON back)
```

```
analyze / search / asar   read app.asar (or resources/app) and the exe's fuses; never write there
live                      CDP to the running app: pages, text, anchors, html, eval, click, shot
```

Details: `skills/appmod/references/electron.md`, `analysis.md`, `live.md`; recipe format:
`docs/recipe-format.md`; feature API: `docs/feature-api.md`.

## Limits

- Changes last until the app updates; re-run `inspect` and `check`, translate what is new.
- Main-process UI (tray, native menus, OS dialogs) stays in the original language.
- Dates and numbers formatted by the app with a fixed locale stay as they are.
- Electron/JavaScript apps only. Native binaries, .NET, games and Android need a disassembler
  (for example [REA](https://github.com/morluto/rea)); appmod does not cover them.
- While the app runs this way, its debugging port (127.0.0.1 only) lets local programs control
  it. Do not use appmod on shared or untrusted machines.

## Recipes

| App | Language | Features | Tested |
|---|---|---|---|
| [Qoder](recipes/qoder/NOTES.md) | Turkish (9,182 keys + 209 texts) | — | 0.4.8, Windows 11 |
| [Discord](recipes/discord/NOTES.md) | — | Message translation button (Turkish default) | 1.0.9264, Windows 11 |

Contributions welcome: a recipe folder with a `NOTES.md` that says what you tested.

## Disclaimer

For personal use on your own machine. Some apps' terms of service forbid client modification;
you are responsible for respecting them. appmod does not touch accounts, payments, DRM or
anti-cheat, and recipes must not either. Language packs contain translations of the apps'
interface strings; app names and trademarks belong to their owners. Not affiliated with any of
the apps listed.

MIT licensed. Analysis guidance adapted from REA (MIT); see `THIRD_PARTY_NOTICES.md`.
