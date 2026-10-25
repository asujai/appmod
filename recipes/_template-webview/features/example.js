// Example webview feature: same API as Electron recipes (docs/feature-api.md).
appmod.addStyle(`[data-appmod-id="example"] { margin-left: 6px; }`)
appmod.addButton({ id: 'example', near: 'h1', position: 'append', label: '✦', title: 'appmod example', onClick: () => alert('appmod is running') })
