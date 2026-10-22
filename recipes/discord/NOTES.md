# Discord — recipe notes

Stable Discord desktop (Electron), tested with 1.0.9264 on Windows 11. Only the stable install is
covered (`%LOCALAPPDATA%/Discord/app-*`); PTB and Canary use different folders but the same UI.

## What works

- Feature `features/translate.js`: a small globe button next to every rendered message, incoming
  and outgoing. Clicking it shows the Turkish translation under the message; clicking again
  hides it.
- The target language comes from `language.code` (`tr` here); change it in `recipe.json` to
  translate into another language. `language.name` is only used in the panel caption.
- `features/translate.mjs` is a local action (Node, zero dependencies) that calls Google
  Translate's free `translate_a/single` endpoint (`client=gtx`, `sl=auto`, `tl=<code>`,
  `dt=t`). The 8,000-character message cap and 15 s fetch timeout fit inside the 20 s action
  timeout.
- Message text is anchored by `id="message-content-<messageId>"`. Discord generates that id in
  its webpack bundle (`message-content-${t.id}`), so it is stable across builds; the id comes
  from the message itself. The button is appended inside the content element, the panel is a
  sibling after it, so React layout and message text are untouched.
- A MutationObserver restores buttons and open panels after Discord re-renders a message list.
  Edited messages drop their old translation (`shown` state is keyed to the current text).
- Google returns the detected source language; the panel caption reads e.g. `Türkçe · en → tr`.
  If the source equals the target it says the message is already Turkish and does not translate.
- Cache: last 400 translations in memory. No disk writes, no message text in logs.

## Pitfalls

- Discord updates itself on launch. During the first test, 1.0.9261 was replaced by 1.0.9264:
  the appmod-started process died and the updated one started without `--remote-debugging-port`.
  Quit Discord completely (tray) and run `launch` again after an update. The `app-*` exe glob and
  the `tested` field then point at the new build.
- The app is single-instance and closing the window only hides it to the tray. Quit from the tray
  (or end `Discord.exe`) before launching with the recipe, otherwise the arguments go to the
  running instance and no debugging port opens.
- The window starts at `about:blank` and swaps its renderer to `https://discord.com/app...`,
  which drops `Page.addScriptToEvaluateOnNewDocument`. `reloadIfLate: false` makes the launcher
  wait for the real URL and inject the bundle after load. Do not switch it back to `true`; the
  early reload risks Discord treating startup as failed, and it is not needed here.
- `pageFilter` must be `https://discord.com`, not `/channels/`: the first URL is `/app?...` and
  the SPA navigates to `/channels/@me` afterwards.
- Discord's CSP blocks fetching `translate.googleapis.com` from the page, which is why the
  translation runs in a local action instead of in the feature.
- Theme colors: do not hardcode `#f2f3f5` or `--text-normal` for the panel. In the tested build
  the message content anchor renders dark text while its parent (`contents_c19a55`) computes a
  near-white color, so inherited and hardcoded colors both made the panel faint. `showPanel`
  copies `getComputedStyle(content).color` into `--appmod-translate-color`; `sync()` refreshes
  it for open panels and an observer on `<html class>` repaints after a theme change. The
  button lives inside the content anchor, so `color: inherit` matches the message text.
- Do not add `color` to the button's CSS transition. The icon starts at the old (faint) color
  and Chromium can throttle transitions while the window is occluded, which made the color
  probe and the visible icon stay light. Transition only `opacity` and `background-color`.
- A full page reload (Ctrl+R) is safe: the registered new-document script injects the runtime
  again and the buttons come back. Open translation panels and the in-memory cache reset.
- Translating sends the visible message text to Google. The endpoint is unofficial, needs no key
  and may be rate-limited or changed. Only send messages you are comfortable sending to a third
  party. The action never logs the text it receives.
- Only text in the message body is translated. Embeds, attachments, replies' quoted content,
  reactions, images and stickers are outside the anchor and have no button. Panel text is plain;
  formatting (inline code, links) is lost in the translation. Mentions and custom emoji tokens
  may come out mangled.
- Tray menu, native context menus and OS notifications come from the main process and stay in
  the app's own language.
- Discord ships only English and Chinese; its UI language is not changed by this recipe
  (`language.i18n.library: "none"`). `language.code` is the message-translation target only.

## After a Discord update

Click the globe on one visible message and confirm the panel appears; update `tested` here and
in `recipe.json`. There is no language pack to re-extract, so `inspect`/`check` are not needed
for the translation feature. If the icon disappears, check the live DOM for the
`message-content-` id and update `CONTENT_SELECTOR` in `features/translate.js`.

## Shortcut

`node bin/appmod.mjs shortcut discord --name "Discord (Çeviri)"` creates a hidden desktop
launcher (`%LOCALAPPDATA%\appmod\launch-discord.vbs`). The copy on this machine also checks for
a running `Discord.exe` and offers to restart it, because `launch` refuses to start while
Discord is open. Re-running `shortcut` overwrites the VBS with the plain version; quit Discord
first or re-add the check.

## Privacy and terms

Personal use only. The app files are never modified; appmod injects at launch through the local
debugging port. Discord's terms may not allow client modification, and the user is responsible
for respecting them. The debugging port is open to local programs while Discord runs this way.
