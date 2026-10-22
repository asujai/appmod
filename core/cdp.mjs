// Minimal Chrome DevTools Protocol client over the browser-level WebSocket.
// Uses Node's built-in WebSocket (Node 22+), so the project has no dependencies.

export function connect(url) {
  const ws = new WebSocket(url)
  let nextId = 1
  const pending = new Map()
  const handlers = []

  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data)
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id)
      pending.delete(message.id)
      message.error ? reject(new Error(message.error.message)) : resolve(message.result)
    } else if (message.method) {
      for (const handler of handlers) handler(message)
    }
  })

  const closed = new Promise(resolve =>
    ws.addEventListener(
      'close',
      () => {
        for (const { reject } of pending.values()) reject(new Error('CDP connection closed'))
        pending.clear()
        resolve()
      },
      { once: true },
    ),
  )

  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      if (ws.readyState !== WebSocket.OPEN) return reject(new Error('CDP connection is not open'))
      const id = nextId++
      pending.set(id, { resolve, reject })
      ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
    })

  const opened = new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', reject, { once: true })
  })

  return { url, send, on: handler => handlers.push(handler), opened, closed, close: () => ws.close() }
}

export async function browserUrl(port) {
  const version = await fetch(`http://127.0.0.1:${port}/json/version`).then(r => r.json())
  return version.webSocketDebuggerUrl
}

// Evaluates an expression in a page session and returns its value (or throws).
export async function evaluate(cdp, sessionId, expression, { awaitPromise = false } = {}) {
  const result = await cdp.send(
    'Runtime.evaluate',
    { expression, returnByValue: true, awaitPromise },
    sessionId,
  )
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
  }
  return result.result.value
}
