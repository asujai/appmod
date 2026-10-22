# App Name — recipe notes

Version tested, platform, date. What the app ships (languages, i18n library).

## What works

## Pitfalls

Anything that cost time: restarts, ports, integrity checks, windows that must not be reloaded,
strings outside i18n, single-instance behaviour, tray.

## After an app update

Run `inspect`, then `check`, translate `inspect/missing.<code>.json`, merge, update `tested`.
