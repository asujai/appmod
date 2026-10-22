# appmod — agent notes

- To change an app for a user, follow `skills/appmod/SKILL.md`.
- Never modify an app's own files; everything lives in `recipes/<id>/`.
- Zero npm dependencies; Node 22+ built-ins only (WebSocket, fetch, node:test).
- `runtime/runtime.js` runs inside app windows before their scripts: no imports, no top-level
  DOM access, every failure goes to `appmod.errors` instead of throwing.
- After changing `core/` or `runtime/`, run `npm test`, then one real `launch` of a recipe.
- `recipes/*/inspect/` and `*.log` are local output and stay out of git.
