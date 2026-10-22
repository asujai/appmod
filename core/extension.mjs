// Builds an unpacked Manifest V3 extension from a web recipe, for use in the user's everyday
// browser (chrome://extensions -> Developer mode -> Load unpacked). The same bundle that
// `launch` injects runs in the page's main world at document_start, so it sees the site's own
// i18next instance. Actions need the launcher and do not work from the extension.
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { buildBundle } from './launcher.mjs'

export function buildExtension(recipe) {
  if (recipe.kind !== 'web') throw new Error('extension builds are for web recipes')
  const dir = join(recipe.root, 'dist', 'extension')
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  const manifest = {
    manifest_version: 3,
    name: `${recipe.name} (appmod)`,
    description: `appmod recipe ${recipe.id}${recipe.language ? `: ${recipe.language.name || recipe.language.code}` : ''}`,
    version: '1.0.0',
    content_scripts: [{ matches: recipe.app.matches, js: ['appmod.js'], run_at: 'document_start', world: 'MAIN', all_frames: false }],
  }
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2))
  writeFileSync(join(dir, 'appmod.js'), buildBundle(recipe))
  const warnings = Object.keys(recipe.actions).length
    ? [`actions (${Object.keys(recipe.actions).join(', ')}) run local commands and only work with \`appmod launch\`, not in the extension.`]
    : []
  return { dir, warnings }
}
