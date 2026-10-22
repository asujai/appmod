# Identifying an app and what is possible

## Is it Electron?

- Windows: next to the exe (or in `app-<version>/`), look for `resources/app.asar` or
  `resources/app/`, plus `chrome_100_percent.pak`, `LICENSES.chromium.html`, `ffmpeg.dll`.
- macOS: `App.app/Contents/Frameworks/Electron Framework.framework`.
- Linux: `resources/app.asar` next to the binary.
- The Electron version is in `inspect/page-*.json` → `userAgent` (`Electron/x.y.z`).

Read the app's own language list (settings, `locales/` folder in resources, i18n files inside
the asar can be listed with `npx @electron/asar list`, read-only) to learn whether the
requested language already exists.

## Not Electron

| Kind | Signs | What to tell the user |
|---|---|---|
| Other Chromium shells (CEF, WebView2) | `libcef.dll`, `msedgewebview2.exe` children | Often possible with the same CDP approach if the app accepts a debugging flag (CEF: `--remote-debugging-port`; WebView2: env `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS`). Not supported by the launcher yet; treat as an experiment. |
| Tauri | small exe, WebView2 on Windows, WebKit on macOS | Windows: WebView2 env var as above may work. macOS/Linux: no supported path. |
| Qt, WPF, WinForms, native macOS | `Qt*.dll`, `.NET` assemblies | Many ship translation files (`.qm`, `.resx` satellite assemblies, `.lproj`) that the app loads by itself; a new language may be added as a new file in the app's language folder. That modifies the install, so ask first and warn it is lost on update. |
| Games / apps with anti-cheat or DRM | — | Do not touch. |

If no clean path exists, say so plainly. Do not fake a result.
