// Dark theme for Hacker News, which has none of its own. A "◐" button in the top bar (and
// Alt+Shift+D) switches it; the choice is remembered. Only CSS: HN's own markup is untouched.
appmod.addStyle(`
  html.appmod-dark, html.appmod-dark body, html.appmod-dark #hnmain { background: #1c1c1a !important; }
  html.appmod-dark #hnmain td[bgcolor="#ff6600"] { background: #b34a00 !important; }
  html.appmod-dark, html.appmod-dark td, html.appmod-dark .title, html.appmod-dark .commtext,
  html.appmod-dark .appmod-tr-out { color: #d8d8d2 !important; }
  html.appmod-dark a:link, html.appmod-dark .titleline > a { color: #e6e6df !important; }
  html.appmod-dark a:visited, html.appmod-dark .titleline > a:visited { color: #8f8f88 !important; }
  html.appmod-dark .subtext, html.appmod-dark .subtext a, html.appmod-dark .comhead,
  html.appmod-dark .comhead a, html.appmod-dark .sitestr, html.appmod-dark .rank { color: #9a9a92 !important; }
  html.appmod-dark .pagetop, html.appmod-dark .pagetop a { color: #111 !important; }
  html.appmod-dark input, html.appmod-dark textarea { background: #2a2a27; color: #e6e6df; border: 1px solid #555; }
  html.appmod-dark .votearrow { filter: invert(0.7); }
  html.appmod-dark .appmod-tr { color: #aaa; border-color: #555; }
  [data-appmod-id="theme"] { margin-right: 6px; padding: 0 4px; font: inherit; color: inherit; background: none;
    border: 1px solid rgba(0, 0, 0, .35); border-radius: 3px; cursor: pointer; }
`)

const apply = dark => document.documentElement.classList.toggle('appmod-dark', dark)
const toggle = () => {
  const dark = !document.documentElement.classList.contains('appmod-dark')
  apply(dark)
  appmod.store.set('dark', dark)
}

// The feature runs before the document exists; apply the saved choice once it does.
appmod.whenReady(() => apply(appmod.store.get('dark', false)))
appmod.hotkey('alt+shift+d', toggle)
appmod.addButton({
  id: 'theme',
  near: 'td[style*="text-align:right"] > .pagetop',
  position: 'prepend',
  label: '◐',
  title: 'Dark theme (Alt+Shift+D)',
  onClick: toggle,
})
