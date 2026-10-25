// Example action. Reads the page's input as JSON on stdin and prints a JSON result on stdout.
let input = ''
for await (const chunk of process.stdin) input += chunk
const { from } = JSON.parse(input || '{}')
console.log(JSON.stringify({ message: `Hello from a local script (called from ${from})` }))
