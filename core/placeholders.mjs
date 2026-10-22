// Finds interpolation tokens a translation must keep: {{name}}, {name}/ICU args, %s / %1$d,
// $t(key) nesting, <tag> / </tag> / <0>, and \n line breaks.
const PATTERNS = [
  /\{\{\s*[^{}]+?\s*\}\}/g,
  /\$t\([^)]*\)/g,
  /%(?:\d+\$)?[sdifoOjc%]/g,
  /<\/?[A-Za-z0-9][\w-]*\s*\/?>/g,
  /\\n|\n/g,
]
const ICU_ARG = /\{\s*([A-Za-z0-9_]+)\s*(?:,[^{}]*)?\}/g

export function placeholders(text) {
  if (typeof text !== 'string') return []
  const found = []
  let rest = text
  for (const re of PATTERNS) {
    rest = rest.replace(re, m => {
      found.push(m.replace(/\s+/g, ''))
      return ' '
    })
  }
  // ICU / single-brace args: compare the argument name only (plural bodies get translated).
  for (const m of rest.matchAll(ICU_ARG)) found.push(`{${m[1]}}`)
  return found.sort()
}

export function samePlaceholders(source, translation) {
  const a = placeholders(source)
  const b = placeholders(translation)
  return a.length === b.length && a.every((x, i) => x === b[i])
}
