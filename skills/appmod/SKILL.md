---
name: appmod
description: Add a language to an installed desktop app's interface, or add a small personal feature (a button, a shortcut, a hook to a local script), without modifying the app's files. Use when the user asks to translate an app's UI into their language, add a missing language, or add/change something in an app's interface for personal use. Electron apps are supported; check other kinds with references/new-app.md first.
---

# appmod

You change how an installed app looks and behaves for one user, at launch, without editing its
files. Every app gets a **recipe** folder (`recipes/<id>/`) that holds everything: how to start
the app, the language pack, feature scripts and the pitfalls found on the way. The next person
asking for the same app reuses the recipe instead of starting over.

Project root: the folder containing `bin/appmod.mjs`. Commands below run from there with
`node bin/appmod.mjs <command>` (Node 22+).

## Ground rules

- Never modify, repack or re-sign the app's own files (asar, binaries, resources). Many apps
  verify their integrity and refuse to start; updates would also undo it.
- Never touch accounts, payments, telemetry, DRM or anti-cheat. Never automate actions the user
  did not ask for.
- If the app has an official language pack or setting for the requested language, use that and
  stop. Tell the user where the setting is.
- Some apps forbid client modification in their terms (Discord is one). Say so once before you
  start and let the user decide. This tool is for personal use on the user's own machine.
- Ask before adding any `actions` (they run local commands) and before changing system or user
  environment variables.
- Personal changes only last until the app updates. After an update, re-run inspect and check.

## Workflow

1. **Identify the app.** Find what is actually installed and running; do not guess from a name
   (two apps can share one). Record exe path, version and whether it is Electron
   (`resources/app.asar` or `resources/app/` next to the exe). Non-Electron: read
   references/new-app.md and tell the user what is and isn't possible before doing anything.
2. **Reuse or create a recipe.** `node bin/appmod.mjs list`. If `recipes/<id>` exists, read its
   `NOTES.md` first and compare `tested.version` with the installed version. Otherwise
   `node bin/appmod.mjs new <id>` and fill `app` in `recipe.json` (format: docs/recipe-format.md).
3. **Analyze before touching anything.** `node bin/appmod.mjs analyze <id>` reads the shipped
   code without running it: fuses (is the asar hash-checked?), i18n library, locale files the
   app already ships, env vars and switches (plugin/dev folders, `--lang`), the app's own
   extension system, IPC, obfuscation. Read `analysis/report.md`, then follow single questions
   with `search` and `asar cat`. An official route found here (a shipped language, `--lang`,
   a plugin folder) beats injection. How to read the evidence: references/analysis.md.
4. **Inspect.** The user must quit the app completely first (including the tray). Run
   `node bin/appmod.mjs inspect <id>`. Read `inspect/page-*.json`: which i18n library was found,
   which languages/namespaces exist, and how many strings were dumped. Details and failure
   cases: references/electron.md.
5. **Language** (if asked): follow references/language.md: choose `override` or `add`, translate
   the dumped strings in chunks (sub-agents for large packs), keep keys and placeholders, then
   `node bin/appmod.mjs check <id>` until it prints `ok`.
6. **Features** (if asked): follow references/features.md: find stable selectors in the live
   app (`live <id> anchors`, `live <id> html <css>`), write a feature script with the `appmod` API (docs/feature-api.md), and declare
   `actions` for anything that needs to run outside the page.
7. **Launch and verify.** Quit the app, run `node bin/appmod.mjs launch <id>`, and check in the
   real window with `live`: `live <id> shot`, `live <id> text`, `live <id> errors`, and for a
   feature `live <id> click <css>` then `shot` again (references/live.md). Check main screen,
   settings, one dialog and each new feature, plus `recipes/<id>/appmod.log`. Not verified on
   screen = not done.
8. **Shortcut.** `node bin/appmod.mjs shortcut <id>` (Windows) creates a desktop shortcut. The
   app's original shortcut keeps starting it unmodified.
9. **Leave the recipe better.** Update `tested` (version, platform, date) and write every
   pitfall you hit into `NOTES.md`. That file is what saves the next person hours.

## Tools at a glance

| Need | Command |
|---|---|
| What is this app made of, what can be hooked | `analyze <id>` (or `analyze --exe <path>` before a recipe exists) |
| Where is X in the code | `search <id> <regex> [--files part] [--context n]` |
| Read one shipped file | `asar <id> list [part]`, `asar <id> cat <path>` |
| The app's strings | `inspect <id>` then `check <id>` |
| What is on screen now, which selectors | `live <id> text`, `live <id> anchors`, `live <id> html <css>` |
| A value the code hides (obfuscated) | `live <id> eval <expression>` |
| Proof for the user | `live <id> shot <file.png>` |

Native code (C/C++, Rust, Go, .NET, games, IL2CPP, firmware, Android) is out of scope: appmod
reads Electron/JavaScript apps only. Say so instead of guessing.

## When stuck

- Debugging port never opens: the app is still running (tray), uses a launcher/updater exe
  (point `exe` at the real binary, `*` in a path segment picks the newest folder), or restarts
  itself on a new port (set `portFile`, references/electron.md).
- Strings stay in the original language: they are not in the i18n library. Add them to the
  `text` map (exact on-screen text), or they come from the main process (menus, tray), which
  this tool does not reach.
- Window freezes or closes on launch: increase `reloadDelayMs`; if a reload aborts startup or
  the renderer is swapped at launch, set `reloadIfLate: false` (inject after load).
