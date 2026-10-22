// Example web feature: runs only on the recipe's "matches" sites, in the page's own context.
appmod.addStyle(`[data-appmod-id="example"] { margin-left: 6px; }`)
appmod.addButton({ id: 'example', near: 'h1', position: 'append', label: '✦', title: 'appmod example', onClick: () => alert('appmod is running') })
