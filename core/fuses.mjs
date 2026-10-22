// Reads Electron fuses from an executable. Fuses are build-time switches stored after a fixed
// sentinel: [sentinel][wire version byte][fuse count byte][one byte per fuse].
// Byte values: '0' disabled, '1' enabled, 'r' removed. Names follow Electron's @electron/fuses
// (V1 order); the same list is used by REA (github.com/morluto/rea, MIT).
import { openSync, readSync, closeSync, fstatSync } from 'node:fs'

const SENTINEL = Buffer.from('dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX', 'ascii')
const NAMES = [
  'RunAsNode',
  'EnableCookieEncryption',
  'EnableNodeOptionsEnvironmentVariable',
  'EnableNodeCliInspectArguments',
  'EnableEmbeddedAsarIntegrityValidation',
  'OnlyLoadAppFromAsar',
  'LoadBrowserProcessSpecificV8Snapshot',
  'GrantFileProtocolExtraPrivileges',
  'WasmTrapHandlers',
]

// What each state means for someone modifying the app without touching its files.
const MEANING = {
  EnableEmbeddedAsarIntegrityValidation: {
    on: 'app.asar is hash-checked: editing it makes the app refuse to start. Use runtime injection only.',
    off: 'app.asar is not hash-checked (still: never edit it, updates overwrite it).',
  },
  OnlyLoadAppFromAsar: { on: 'the app ignores a resources/app folder; only app.asar is loaded.' },
  EnableNodeCliInspectArguments: {
    on: '--inspect works: the main process can be debugged (main-process changes are possible).',
    off: '--inspect is blocked: only renderer windows are reachable (via --remote-debugging-port).',
  },
  RunAsNode: { on: 'ELECTRON_RUN_AS_NODE works: the exe can run plain Node scripts.' },
  EnableNodeOptionsEnvironmentVariable: { on: 'NODE_OPTIONS is honoured (e.g. --require a preload).' },
}

export function readFuses(exe) {
  const fd = openSync(exe, 'r')
  try {
    const size = fstatSync(fd).size
    const chunk = Buffer.alloc(8 * 1024 * 1024)
    const tail = SENTINEL.length + 64
    for (let pos = 0; pos < size; pos += chunk.length - tail) {
      const n = readSync(fd, chunk, 0, chunk.length, pos)
      const i = chunk.subarray(0, n).indexOf(SENTINEL)
      if (i !== -1) {
        const header = Buffer.alloc(2 + NAMES.length + 16)
        readSync(fd, header, 0, header.length, pos + i + SENTINEL.length)
        const version = header[0]
        const count = header[1]
        const fuses = {}
        for (let k = 0; k < count && k < header.length - 2; k++) {
          const c = String.fromCharCode(header[2 + k])
          const state = c === '1' ? 'on' : c === '0' ? 'off' : c === 'r' ? 'removed' : `unknown(${c})`
          fuses[NAMES[k] || `fuse${k}`] = state
        }
        const notes = Object.entries(fuses)
          .map(([name, state]) => MEANING[name]?.[state])
          .filter(Boolean)
        return { found: true, wireVersion: version, fuses, notes }
      }
      if (n < chunk.length) break
    }
    return { found: false, fuses: {}, notes: ['No fuse sentinel: not Electron, or an Electron older than v12.'] }
  } finally {
    closeSync(fd)
  }
}
