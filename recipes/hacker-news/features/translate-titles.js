// Adds a small "TR" button after every story title and comment on Hacker News. Clicking it
// translates the text through the shared "translate" action and shows it underneath.
const TARGET = (appmod.language && appmod.language.code) || 'tr'
const LABEL = TARGET.toUpperCase()

appmod.addStyle(`
  .appmod-tr { margin-left: 6px; padding: 0 4px; font: 10px Verdana, Geneva, sans-serif; color: #828282;
    background: none; border: 1px solid #c8c8c8; border-radius: 3px; cursor: pointer; vertical-align: 1px; }
  .appmod-tr:hover { color: #000; border-color: #828282; }
  .appmod-tr[disabled] { cursor: progress; opacity: .6; }
  .appmod-tr-out { display: block; margin: 3px 0 2px; padding: 2px 6px; border-left: 2px solid #ff6600;
    color: #333; font-size: 9pt; white-space: pre-wrap; }
`)

function attach(source, placeAfter) {
  appmod.addButton({
    id: `tr-${source.replace(/[^a-z]/g, '')}`,
    near: source,
    position: 'after',
    label: LABEL,
    title: `${LABEL}: translate`,
    className: 'appmod-tr',
    async onClick(event, anchor) {
      const button = event.currentTarget
      const host = placeAfter(anchor)
      const open = host.nextElementSibling && host.nextElementSibling.classList.contains('appmod-tr-out')
      if (open) return host.nextElementSibling.remove()
      button.disabled = true
      try {
        const result = await appmod.action('translate', { text: anchor.innerText, target: TARGET })
        const out = document.createElement('span')
        out.className = 'appmod-tr-out'
        out.textContent = result.text
        host.after(out)
      } catch (error) {
        button.title = `failed: ${error.message}`
      } finally {
        button.disabled = false
      }
    },
  })
}

// Story titles: the button goes after the title link, the translation under the whole line.
attach('.titleline > a', anchor => anchor.closest('.titleline'))
// Comments: the button goes after the comment body.
attach('.commtext', anchor => anchor)
