// Installs the appmod skill into the user's coding agents, so "change app X" just works.
// The skill folder is copied (not linked) and stamped with this checkout's location, because
// an installed skill no longer sits next to bin/appmod.mjs. Re-run after updating appmod.
import { existsSync, readFileSync, writeFileSync, mkdirSync, cpSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { createHash } from 'node:crypto'
import { projectRoot } from './recipe.mjs'

// User-level skill folders, from each tool's documentation (2026-10). One folder can serve
// several tools: Codex and Gemini CLI both read ~/.agents/skills.
export const AGENTS = {
  claude: { label: 'Claude Code', home: '.claude', dir: ['.claude', 'skills'] },
  agents: { label: 'Codex, Gemini CLI and other tools that read ~/.agents/skills', home: ['.codex', '.gemini', '.agents'], dir: ['.agents', 'skills'] },
  antigravity: { label: 'Antigravity (app and IDE)', home: '.gemini', dir: ['.gemini', 'config', 'skills'] },
}

const SOURCE = join(projectRoot, 'skills', 'appmod')
const MARKER = '.appmod-skill.json'
const sha = text => createHash('sha256').update(text).digest('hex').slice(0, 16)

// The skill text with this checkout's absolute path, so the agent finds the CLI.
export function stampedSkill(root = projectRoot) {
  const text = readFileSync(join(SOURCE, 'SKILL.md'), 'utf8')
  const where = `appmod is installed at \`${root}\`. Run every command as \`node "${join(root, 'bin', 'appmod.mjs')}" <command>\`; recipes live in \`${join(root, 'recipes')}\`.`
  // A replacer function: "$&" or "$$" in a folder name must stay literal.
  return text.replace(/^Location: .*$/m, () => `Location: ${where}`)
}

const detected = (home, agent) => [].concat(agent.home).some(h => existsSync(join(home, h)))

export function skillTargets({ home = homedir(), agents } = {}) {
  const names = agents?.length ? agents : Object.keys(AGENTS).filter(n => detected(home, AGENTS[n]))
  for (const n of names) if (!AGENTS[n]) throw new Error(`unknown agent "${n}" (use ${Object.keys(AGENTS).join(', ')})`)
  return names.map(n => ({ name: n, label: AGENTS[n].label, dir: join(home, ...AGENTS[n].dir, 'appmod') }))
}

export function installSkill({ home, agents, force = false } = {}) {
  const text = stampedSkill()
  const results = []
  for (const t of skillTargets({ home, agents })) {
    if (existsSync(t.dir) && !existsSync(join(t.dir, MARKER)) && !force) {
      results.push({ ...t, status: 'skipped: a different "appmod" skill is already there (use --force to replace it)' })
      continue
    }
    rmSync(t.dir, { recursive: true, force: true })
    mkdirSync(t.dir, { recursive: true })
    cpSync(SOURCE, t.dir, { recursive: true })
    writeFileSync(join(t.dir, 'SKILL.md'), text)
    writeFileSync(join(t.dir, MARKER), JSON.stringify({ source: projectRoot, hash: sha(text), installedAt: new Date().toISOString() }, null, 1))
    results.push({ ...t, status: 'installed' })
  }
  return results
}

export function removeSkill({ home, agents } = {}) {
  const all = agents?.length ? agents : Object.keys(AGENTS)
  return skillTargets({ home, agents: all })
    .filter(t => existsSync(join(t.dir, MARKER)))
    .map(t => {
      rmSync(t.dir, { recursive: true, force: true })
      return { ...t, status: 'removed' }
    })
}

// Where the skill is installed and whether each copy matches this checkout.
export function skillStatus({ home } = {}) {
  const current = sha(stampedSkill())
  return skillTargets({ home, agents: Object.keys(AGENTS) }).map(t => {
    const marker = join(t.dir, MARKER)
    if (!existsSync(marker)) return { ...t, status: existsSync(t.dir) ? 'other appmod skill' : 'not installed' }
    const info = JSON.parse(readFileSync(marker, 'utf8'))
    return { ...t, status: info.hash === current ? 'up to date' : 'outdated (run setup again)' }
  })
}
