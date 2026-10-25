# Qoder (Alibaba) — recipe notes

Electron agent app, the white-logo `Qoder` (not the green `Qoder IDE`, which is a VS Code fork).
Ships only English and Chinese. Tested with 0.4.8 on Windows 11 (2026-10-21, re-checked
2026-10-25).

## What works

- i18next is bundled privately; the runtime catches it through the `translator` trap.
- Mode `override`: Turkish is written over the `en` bundle. Qoder's language menu only offers
  en/zh, so `add` mode would need menu work; override is simpler and survives restarts.
- `text/tr.json` covers strings that Qoder writes outside i18next (permission modes, plugin names).

## Pitfalls

- `app.asar` integrity validation is on (`EnableEmbeddedAsarIntegrityValidation`). Editing app
  files makes Qoder refuse to start. Never patch the asar.
- Qoder may restart itself once at startup (`--qoder-windows-startup-compatibility`) on a new
  debugging port. That is why this recipe uses `portFile` instead of a fixed port.
- Reloading the window before its first load finishes makes Qoder treat startup as failed and
  quit. `reloadDelayMs: 1500` waits after `readyState === "complete"`.
- Closing the window minimises Qoder to the tray. Quit it from the tray (or end `Qoder.exe`)
  before launching with the recipe, otherwise the arguments go to the running instance.
- Tray menu and native window menus belong to the main process and stay English.
- The UI Automation tree is empty: screen readers and UIA tools see nothing inside the window.

## After a Qoder update

`doctor qoder` shows the version. Launch, then `live qoder errors`: `missingKeys` counts
strings Qoder registers that the pack lacks. `live qoder missing` writes them to
`inspect/missing.tr.json` (and refreshes the strings dump); translate, merge into
`packs/tr.json`, `check`, launch again until `missingKeys` is 0. Update `tested` here when done.

2026-10-25: still 0.4.8, but the running app registered 446 keys the 2026-10-22 dump did not
have (settings, Dynamic Island, composer, extensions, error messages). Either they load
lazily or Qoder updated its renderer without a version bump; the runtime count catches both,
so check `missingKeys` after every launch that follows an update. All 446 were translated
(9,628 keys now), placeholders checked, Settings verified on screen.

## Related personal add-on (not part of this recipe)

Turkish dictation for Qoder's chat box (local faster-whisper, Qoder dev-extension) lives in a
separate project. Qoder's own voice input sends audio to its servers and has no language
setting. Qoder loads unsigned dev extensions from `~/.qoder/app/dev-extensions/<id>/` only when
`QODER_APP_PLUGIN_ALLOW_UNVERIFIED=true` is set.

## Not translated

- Month names in the usage chart (Nov, Dec, …) are formatted outside i18next.
- Workspace and task names are user content and stay as typed.
