# Reading an app before changing it

`analyze`, `search` and `asar` read the shipped code. They never run it and never write into
the app's folder. Use them to answer one question at a time: where do the strings come from,
what does the app already offer, and what is the least invasive way in.

The evidence rules below are adapted from REA's evidence discipline
(github.com/morluto/rea, MIT). They keep reports honest.

## Evidence rules

- A static match is an observation, not behaviour. "`process.env.X_PLUGIN_DEV_DIRS` appears
  in electronMain.js" is true; "setting it loads plugins" is a hypothesis until you see it
  happen (log, UI, file access).
- Absence in a scan is not absence in the app. Check `coverage` and `unknowns` first: skipped
  files, obfuscated files and remote UI code (`remoteUi`) are blind spots.
- Pair IPC sender and handler only on a unique exact literal channel name. Built or dynamic
  names stay unresolved.
- Minified names (`e`, `t`, `L(34912,30553)`) are not identities and change every build. Quote
  string literals and file paths instead, and re-find them after an update.
- Version comparison: analyze both versions, then compare literals (strings, env vars,
  switches, channels). "Removed" needs full coverage on both sides; otherwise say unknown.
- Report to the user with the file and a short snippet, plus what remains unknown.

## Reading the report

| Field | Use it for |
|---|---|
| `fuses` | `EnableEmbeddedAsarIntegrityValidation=on` means the asar is hash-checked: injection only. `EnableNodeCliInspectArguments=off` means the main process is unreachable; renderer windows still are. |
| `i18n.libraries` | Picks the adapter. `i18next` is supported. Others: text map or a new adapter in `runtime/runtime.js` (with a test). |
| `i18n.localeFiles` | Languages the app ships. If the requested one is there, look for the setting or `--lang` before translating. |
| `hooks.envVarsOfInterest` | Official switches (plugin dev folders, debug, feature toggles). Ask before setting any; never use them to unlock paid or server-gated features. |
| `hooks.switches` | Command-line switches the app reads. Candidates for `app.args`. |
| `hooks.pluginPaths` | Signs of an own extension/plugin system. An official extension is sturdier than injection. |
| `hooks.exposed`, `hooks.ipcMain` | What the page can call into the main process. Useful to understand features; do not call IPC that changes accounts or data the user did not ask about. |
| `flags.remoteUi` | UI code is downloaded at runtime (Discord, Slack): static results cover only the shell; study the UI with `live`. |
| `obfuscated` | String literals hidden in lookup arrays. Read the resolved values at runtime with `live <id> eval`. |

## Following one question

1. Start from a literal you saw on screen or in the report: a label, an env var, a route
   (`#/settings/...`), a channel name.
2. `search <id> "<escaped literal>" --context 200` to see the surrounding code.
3. Widen with nearby literals from that snippet. Stop when the question is answered; do not
   map the whole app.
4. If code is obfuscated or remote, switch to `live`: read the value or the DOM directly.

## Limits

- Electron/JavaScript only. Native binaries, .NET, games (Unity/IL2CPP, Unreal), Android and
  firmware need a disassembler or decompiler (REA, Ghidra and similar). Say so.
- Bundles larger than 64 MB are skipped and listed in `unknowns`.
- Source maps, if shipped, are listed by `asar list .map`; reading them is fine, but they are
  rarely shipped.
