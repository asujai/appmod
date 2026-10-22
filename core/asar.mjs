// Read-only access to an Electron app's code: an app.asar archive or a plain resources/app folder.
// Nothing here writes into the app's directory.
import { openSync, readSync, closeSync, readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'

// asar layout: [u32 4][u32 headerPickleSize] then a pickle holding [u32 payload][u32 strLen][json].
// File data starts at 8 + headerPickleSize; each file's offset is relative to that.
export function openAsar(file) {
  const fd = openSync(file, 'r')
  try {
    const head = Buffer.alloc(16)
    readSync(fd, head, 0, 16, 0)
    const headerPickleSize = head.readUInt32LE(4)
    const jsonSize = head.readUInt32LE(12)
    const json = Buffer.alloc(jsonSize)
    readSync(fd, json, 0, jsonSize, 16)
    const header = JSON.parse(json.toString('utf8'))
    const dataStart = 8 + headerPickleSize
    const files = new Map()
    const walk = (node, prefix) => {
      for (const [name, entry] of Object.entries(node.files || {})) {
        const path = prefix ? `${prefix}/${name}` : name
        if (entry.files) walk(entry, path)
        else if (!entry.link) files.set(path, entry)
      }
    }
    walk(header, '')
    const unpackedDir = `${file}.unpacked`
    return {
      kind: 'asar',
      root: file,
      list: () => Array.from(files, ([path, e]) => ({ path, size: e.size, unpacked: !!e.unpacked })),
      has: path => files.has(path),
      read(path) {
        const entry = files.get(path)
        if (!entry) throw new Error(`not in archive: ${path}`)
        if (entry.unpacked) return readFileSync(join(unpackedDir, path))
        const buf = Buffer.alloc(entry.size)
        const fd2 = openSync(file, 'r')
        try {
          readSync(fd2, buf, 0, entry.size, dataStart + Number(entry.offset))
        } finally {
          closeSync(fd2)
        }
        return buf
      },
    }
  } finally {
    closeSync(fd)
  }
}

export function openFolder(dir) {
  const files = []
  const walk = (abs, rel) => {
    for (const name of readdirSync(abs)) {
      const a = join(abs, name)
      const r = rel ? `${rel}/${name}` : name
      const st = statSync(a)
      if (st.isDirectory()) walk(a, r)
      else files.push({ path: r, size: st.size, unpacked: false })
    }
  }
  walk(dir, '')
  const set = new Set(files.map(f => f.path))
  return { kind: 'folder', root: dir, list: () => files, has: p => set.has(p), read: p => readFileSync(join(dir, p)) }
}

// Finds the app code next to an Electron executable (Windows/Linux) or inside a .app bundle.
export function findAppSource(exe) {
  const candidates = []
  const dir = dirname(exe)
  candidates.push(join(dir, 'resources'))
  if (exe.includes('.app/')) candidates.push(join(exe.slice(0, exe.indexOf('.app/') + 4), 'Contents', 'Resources'))
  for (const resources of candidates) {
    if (existsSync(join(resources, 'app.asar'))) return { resources, source: openAsar(join(resources, 'app.asar')) }
    if (existsSync(join(resources, 'app', 'package.json'))) return { resources, source: openFolder(join(resources, 'app')) }
  }
  return { resources: candidates[0], source: null }
}

export const describeSource = s => (s ? `${s.kind} ${basename(s.root)} (${s.list().length} files)` : 'not found')
