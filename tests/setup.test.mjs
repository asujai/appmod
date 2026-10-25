// Installing the skill into agents' folders: detection, path stamping, removal, and never
// overwriting a different skill with the same name.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { installSkill, removeSkill, skillStatus, skillTargets, stampedSkill } from '../core/setup.mjs'
import { projectRoot } from '../core/recipe.mjs'

test('setup installs into detected agents with the checkout path, and removes only its own copies', () => {
  const home = mkdtempSync(join(tmpdir(), 'appmod-home-'))
  try {
    mkdirSync(join(home, '.claude'))
    mkdirSync(join(home, '.codex'))
    assert.deepEqual(skillTargets({ home }).map(t => t.name), ['claude', 'agents'])

    // A different skill already named appmod in the shared folder is left alone.
    mkdirSync(join(home, '.agents', 'skills', 'appmod'), { recursive: true })
    writeFileSync(join(home, '.agents', 'skills', 'appmod', 'SKILL.md'), 'someone else')
    const results = installSkill({ home })
    assert.equal(results.find(r => r.name === 'claude').status, 'installed')
    assert.match(results.find(r => r.name === 'agents').status, /skipped/)

    const skill = readFileSync(join(home, '.claude', 'skills', 'appmod', 'SKILL.md'), 'utf8')
    assert.ok(skill.includes(join(projectRoot, 'bin', 'appmod.mjs')), 'stamped with the CLI path')
    assert.match(skill, /^---\nname: appmod\n/, 'frontmatter kept')
    assert.ok(existsSync(join(home, '.claude', 'skills', 'appmod', 'references', 'kinds.md')), 'references copied')
    assert.equal(skillStatus({ home }).find(s => s.name === 'claude').status, 'up to date')

    writeFileSync(join(home, '.claude', 'skills', 'appmod', '.appmod-skill.json'), JSON.stringify({ hash: 'old' }))
    assert.match(skillStatus({ home }).find(s => s.name === 'claude').status, /outdated/)

    const removed = removeSkill({ home })
    assert.deepEqual(removed.map(r => r.name), ['claude'])
    assert.ok(!existsSync(join(home, '.claude', 'skills', 'appmod')))
    assert.equal(readFileSync(join(home, '.agents', 'skills', 'appmod', 'SKILL.md'), 'utf8'), 'someone else')
    assert.throws(() => installSkill({ home, agents: ['nope'] }), /unknown agent/)
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})

test('the install path is stamped literally, even with $ in it', () => {
  const root = String.raw`C:\tools\cost$&\appmod`
  const text = stampedSkill(root)
  assert.ok(text.includes(root))
  assert.equal(text.match(/^Location: /gm).length, 1)
})
