# Recipe kinds

Every recipe has `app.kind`. The kind decides how appmod reads the target and how it applies a
change. Pick the kind from what the target actually is (references/new-app.md), not from the
user's wording.

| Kind | Target | Reads with | Applies by | Language | Features | Undo |
|---|---|---|---|---|---|---|
| `electron` | installed Electron app | `analyze` (asar, fuses), `inspect`, `live` | CDP injection at launch | i18next pack, text map | yes, plus actions | start the app normally |
| `web` | a website | `live`; optional `rea analyze-web-bundle` | CDP injection in a separate browser profile, or an unpacked extension | i18next pack, text map | yes; actions only with `launch` | close the window; delete the profile folder |
| `android` | an app on a device over ADB | `analyze` (ADB, `aapt2` shipped languages; `--code` adds REA + JADX) | official per-app language (Android 13+) | only languages the APK ships | no | `reset` |
| `native` | any other desktop app | `analyze` via REA (`inspect-desktop-application`) | official routes: files into folders the app loads, args, env for the launched process | via the app's own language files | no | `reset` |

## web

- `startUrl` opens in a Chrome/Edge window with its own profile
  (`%LOCALAPPDATA%/appmod/profiles/<id>`). The user's everyday browser is untouched and may keep
  running. If the site needs a login, the user signs in once in that window; never type their
  credentials.
- `matches` (Chrome match patterns) limit where the runtime runs. Even if the tab navigates to
  another site, the runtime stays inert there. Keep patterns as narrow as the task allows.
- `extension <id>` builds `dist/extension/` (Manifest V3, main world, `document_start`) for the
  user's normal browser. Actions do not work there: anything that needs a local command stays a
  `launch` feature, or calls a public API the site's CSP allows.
- Sites change their markup often. Prefer `aria-label`, `role`, `data-*` and semantic structure
  over class names; note the selectors and the date in NOTES.md.

## android

- No root, no injection: an installed app's UI cannot be changed from outside. Say so when the
  user asks for a button or a new feature on Android.
- `analyze` pulls the base APK into `analysis/` and lists shipped languages with the SDK's
  `aapt2`. If the requested language is not shipped, per-app language cannot add it; offer the
  system language or tell the user plainly.
- `launch` sets the per-app language (`cmd locale set-app-locales`) and starts the app;
  `reset` clears it. Launching shows the app on the device's screen: on a TV or a phone in use,
  ask before launching.
- `--code` runs REA's APK inspection. It needs a JADX jar (`REA_JADX_MCP_JAR`); without it the
  error is saved next to the report and the rest of the analysis stands.

## native

- appmod cannot inject into native code. Use only routes the app supports: a language folder,
  a plugin/theme folder, a documented switch or environment variable. Find them in the app's
  documentation, its own folders, or with `analyze` (REA) and `rea` commands.
- `install` copies files; an existing file is renamed to `*.appmod-backup` and restored by
  `reset`. Targets inside the app's install folder or system folders are refused unless the
  user agreed and you pass `--allow-app-dir` (updates may undo it, integrity checks may reject
  it).
- `env` and `args` apply only to the process appmod starts. They do not change the user's
  system environment.

## REA

appmod reads Electron apps itself. For native, .NET and APK code it calls REA
(github.com/morluto/rea, MIT): `APPMOD_REA` if set, `rea` on PATH, otherwise
`npx -y rea-agents@6.7.0` (downloads the pinned package once). Any REA command is available as
`node bin/appmod.mjs rea <command> ...`; `rea doctor --json` shows which REA providers
(Ghidra, JADX, apktool) are available. REA results are evidence; read them with the rules in
references/analysis.md.
