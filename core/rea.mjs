// Bridge to REA (github.com/morluto/rea, MIT) for targets appmod does not read itself: native
// executables, .NET, Android packages. appmod never bundles REA; it runs it on demand.
// Resolution order: APPMOD_REA (path to rea.mjs or a command), `rea` on PATH, then
// `npx -y rea-agents@<pinned>` (downloads the pinned package into npm's cache on first use).
import { spawnSync, execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'

export const REA_VERSION = '6.7.0'
const isWin = process.platform === 'win32'

function onPath(cmd) {
  try {
    execFileSync(isWin ? 'where' : 'which', [cmd], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

export function reaCommand() {
  const custom = process.env.APPMOD_REA
  if (custom) {
    if (custom.endsWith('.mjs') || custom.endsWith('.js')) {
      if (!existsSync(custom)) throw new Error(`APPMOD_REA points to a missing file: ${custom}`)
      return { cmd: process.execPath, pre: [custom], how: `APPMOD_REA (${custom})` }
    }
    return { cmd: custom, pre: [], how: `APPMOD_REA (${custom})`, shell: isWin }
  }
  if (onPath('rea')) return { cmd: 'rea', pre: [], how: 'rea on PATH', shell: isWin }
  return { cmd: isWin ? 'npx.cmd' : 'npx', pre: ['-y', `rea-agents@${REA_VERSION}`], how: `npx rea-agents@${REA_VERSION}`, shell: isWin, downloads: true }
}

// Runs one REA CLI command. With json: true, asks for JSON and parses it.
export function runRea(args, { json = false, timeoutMs = 10 * 60 * 1000 } = {}) {
  const rea = reaCommand()
  const full = [...rea.pre, ...args, ...(json ? ['--format', 'json'] : [])]
  const quoted = rea.shell ? full.map(a => (/[\s"&|<>^]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a)) : full
  const res = spawnSync(rea.cmd, quoted, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, timeout: timeoutMs, shell: rea.shell })
  if (res.error) throw new Error(`REA could not start via ${rea.how}: ${res.error.message}`)
  if (res.status !== 0) throw new Error(`REA (${rea.how}) exited with ${res.status}: ${(res.stderr || res.stdout).trim().slice(0, 2000)}`)
  if (!json) return { how: rea.how, output: res.stdout }
  try {
    return { how: rea.how, output: JSON.parse(res.stdout) }
  } catch {
    return { how: rea.how, output: res.stdout }
  }
}
