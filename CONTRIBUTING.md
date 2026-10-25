# Contributing a recipe

A recipe is useful to others when it works and says honestly what it was tested on.

1. Create it with your agent (`skills/appmod`) or by hand: `node bin/appmod.mjs new <id> --kind <kind>`.
2. `NOTES.md`: app version, platform, date; what works; every pitfall; the selectors you used
   and why. Say what you could not test.
3. `recipe.json` `tested`: `{ "version", "platform", "date" }`.
4. `node bin/appmod.mjs validate <id>` prints ok, and `npm test` passes.
5. Keep it personal-use: no accounts, payments, paid features, DRM, anti-cheat, telemetry
   changes or actions toward other people. Actions must be declared and explained in NOTES.md.
6. Do not commit `inspect/`, `analysis/`, `dist/`, logs, screenshots or anything private
   (they are git-ignored). Language packs contain the app's strings translated, nothing else.

Changes to `core/` or `runtime/` need a test in `tests/` and one real `launch` of a recipe;
`runtime/runtime.js` runs inside app windows, so it must never throw at load and must not touch
the DOM at the top level.
