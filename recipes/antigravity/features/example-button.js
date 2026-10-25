// Example feature. Runs inside every matching window; `appmod` is window.__appmod.
// Replace the selector with one found in the real app (see skills/appmod/references/features.md).
appmod.addStyle(`
  [data-appmod-id="example-hello"] { margin-left: 6px; padding: 2px 8px; border-radius: 6px; cursor: pointer; }
`)

appmod.addButton({
  id: 'example-hello',
  near: 'button[type="submit"]',
  position: 'after',
  label: 'Hello',
  title: 'appmod example: runs a local script',
  async onClick() {
    const result = await appmod.action('example-hello', { from: location.href })
    alert(result.message)
  },
})
