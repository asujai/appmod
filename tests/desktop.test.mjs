// Shortcut files for each platform: quoting must survive spaces, quotes and $ in paths.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { windowsLauncher, linuxDesktopEntry, macShellCommand, macAppleScript, safeName } from '../core/desktop.mjs'

const recipe = { id: 'my-app', name: 'My "App"', root: '/home/u/app mod/recipes/my $app' }

test('Windows launcher doubles quotes and passes --gui', () => {
  const vbs = windowsLauncher({ ...recipe, root: 'C:\\Users\\a b\\appmod\\recipes\\my-app' }, 'C:\\Program Files\\nodejs\\node.exe')
  assert.ok(vbs.includes('"""C:\\Program Files\\nodejs\\node.exe""'))
  assert.ok(vbs.includes('launch ""C:\\Users\\a b\\appmod\\recipes\\my-app"" --gui", 0, False'))
  assert.ok(vbs.includes('My ""App""'))
})

test('Linux desktop entry escapes Exec arguments', () => {
  const entry = linuxDesktopEntry(recipe, 'My App', '/usr/bin/node')
  assert.ok(entry.startsWith('[Desktop Entry]\n'))
  assert.ok(entry.includes('Exec="/usr/bin/node" "'))
  assert.ok(entry.includes(' launch "/home/u/app mod/recipes/my \\$app" --gui\n'))
  assert.ok(entry.includes('\nTerminal=false\n'))
})

test('macOS command runs in the background and quotes for sh and AppleScript', () => {
  const sh = macShellCommand(recipe, '/opt/node')
  assert.ok(sh.startsWith("nohup '/opt/node' '"))
  assert.ok(sh.endsWith(" launch '/home/u/app mod/recipes/my $app' --gui >/dev/null 2>&1 &"))
  const script = macAppleScript({ ...recipe, root: '/a"b' }, '/opt/node')
  assert.ok(script.startsWith('do shell script "nohup '))
  assert.ok(script.includes(`'/a\\"b'`))
})

test('shortcut names drop characters file systems reject', () => {
  assert.equal(safeName('Qoder: Türkçe / test?'), 'Qoder Türkçe test')
  assert.equal(safeName('***'), 'appmod')
})
