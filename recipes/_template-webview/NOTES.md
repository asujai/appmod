# App Name (WebView2 / CEF) — recipe notes

Engine (`analyze --exe` prints it), version tested, platform, date. Where the UI comes from
(local files next to the exe, embedded, or a web URL: see `live <id> pages`).

## What works

## Pitfalls

Background helpers or a tray copy that keep the WebView2/CEF browser alive (the debugging
port then never opens), pages that must not be reloaded, strings outside any i18n library.

## After an app update

`doctor <id>` shows the version change. Check every feature with `live`, update `tested`.
