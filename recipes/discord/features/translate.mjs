// Local action for the Discord translation feature. Reads { text, target } as JSON on stdin
// and writes { text, source, target } as JSON on stdout. Runs in Node, so Discord's CSP and
// renderer sandbox do not affect the request.
import { pathToFileURL } from 'node:url'

const ENDPOINT = 'https://translate.googleapis.com/translate_a/single'
const MAX_TEXT = 8000
const MAX_RESPONSE = 1_000_000
const TIMEOUT_MS = 15000

export function normalizeTarget(value) {
  return typeof value === 'string' && /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/.test(value) ? value : 'tr'
}

export function parseTranslation(data) {
  if (!Array.isArray(data) || !Array.isArray(data[0])) return null
  const text = data[0]
    .map(segment => (Array.isArray(segment) ? segment[0] : ''))
    .filter(part => typeof part === 'string')
    .join('')
    .trim()
  if (!text) return null
  return { text, source: typeof data[2] === 'string' ? data[2] : null }
}

function fail(message) {
  process.stderr.write(`translate: ${message}\n`)
  process.exit(1)
}

async function readInput() {
  let raw = ''
  for await (const chunk of process.stdin) raw += chunk
  try {
    return JSON.parse(raw || '{}')
  } catch {
    fail('invalid JSON input')
  }
}

async function main() {
  const input = await readInput()
  const text = typeof input?.text === 'string' ? input.text.trim() : ''
  if (!text) fail('empty text')
  if (text.length > MAX_TEXT) fail(`message too long (${text.length} > ${MAX_TEXT})`)
  const target = normalizeTarget(input?.target)

  let response
  try {
    response = await fetch(`${ENDPOINT}?client=gtx&sl=auto&tl=${encodeURIComponent(target)}&dt=t`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
        accept: 'application/json',
      },
      body: `q=${encodeURIComponent(text)}`,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (error) {
    fail(`network error: ${error.message}`)
  }
  if (!response.ok) fail(`service returned HTTP ${response.status}`)

  let raw
  try {
    raw = await response.text()
  } catch (error) {
    fail(`read error: ${error.message}`)
  }
  if (raw.length > MAX_RESPONSE) fail('response too large')

  let data
  try {
    data = JSON.parse(raw)
  } catch {
    fail('service returned invalid JSON (possibly rate limited)')
  }
  const parsed = parseTranslation(data)
  if (!parsed) fail('service returned no translation')
  process.stdout.write(`${JSON.stringify({ ...parsed, target })}\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
