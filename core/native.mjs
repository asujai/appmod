// Native recipes: apps appmod cannot inject into. Supported changes are the app's own official
// routes: files copied into a folder the app loads from (language files, plugins, themes),
// environment variables and command-line arguments for the launched process only.
// Every copy is recorded so `reset` can remove it and restore what it replaced.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, copyFileSync, cpSync, statSync, readFileSync, writeFileSync, rmSync, renameSync } from 'node:fs'
import { join, dirname, resolve, sep } from 'node:path'

const manifestFile = recipe => join(recipe.root, '.appmod-installed.json')

// Writing inside the app's install folder or a system folder can break the app, trip integrity
// checks and is undone by updates. It needs an explicit --allow-app-dir from the user.
export function protectedTarget(recipe, target) {
  const t = resolve(target).toLowerCase()
  const roots = [dirname(recipe.app.exe), process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.SystemRoot, '/Applications', '/usr', '/opt']
  return roots.filter(Boolean).find(r => t === resolve(r).toLowerCase() || t.startsWith(resolve(r).toLowerCase() + sep)) || null
}

export function installFiles(recipe, { allowAppDir = false } = {}) {
  const done = existsSync(manifestFile(recipe)) ? JSON.parse(readFileSync(manifestFile(recipe), 'utf8')) : []
  for (const { from, to } of recipe.app.install) {
    const hit = protectedTarget(recipe, to)
    if (hit && !allowAppDir) throw new Error(`refusing to write into ${hit} (${to}). Re-run with --allow-app-dir only if the user agreed; updates may undo it.`)
    if (done.some(d => d.to === to)) continue
    let backup = null
    if (existsSync(to)) {
      backup = `${to}.appmod-backup`
      renameSync(to, backup)
    }
    mkdirSync(dirname(to), { recursive: true })
    if (statSync(from).isDirectory()) cpSync(from, to, { recursive: true })
    else copyFileSync(from, to)
    done.push({ to, backup, at: new Date().toISOString() })
    writeFileSync(manifestFile(recipe), JSON.stringify(done, null, 1))
  }
  return done
}

export function resetFiles(recipe) {
  if (!existsSync(manifestFile(recipe))) return []
  const done = JSON.parse(readFileSync(manifestFile(recipe), 'utf8'))
  for (const { to, backup } of done.reverse()) {
    rmSync(to, { recursive: true, force: true })
    if (backup && existsSync(backup)) renameSync(backup, to)
  }
  rmSync(manifestFile(recipe), { force: true })
  return done
}

export function startNative(recipe, extraArgs = []) {
  const { exe, args, env } = recipe.app
  if (recipe.app.unavailable) throw new Error(`cannot start ${recipe.id} here: ${recipe.app.unavailable}`)
  if (!existsSync(exe)) throw new Error(`app not found: ${exe}`)
  const child = spawn(exe, [...args, ...extraArgs], { detached: true, stdio: 'ignore', env: { ...process.env, ...env } })
  child.unref()
  return child.pid
}
