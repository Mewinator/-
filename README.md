# Isolated Web App (IWA)

Opens a website of your choice in its own app window. Pages load in a
`<controlledframe>`, which only works inside an Isolated Web App.

On first launch the app asks for a title, an icon, and a website URL. After
that it opens straight to that site, using that title and icon.

Press **Ctrl+Shift+Alt+Enter** to switch to the built-in browser, and again to
go back. The browser is styled after Chrome:

- Chrome tabs (from [chrome-tabs](https://github.com/adamschwartz/chrome-tabs)),
  draggable, with favicons and a loading spinner.
- Address bar with search, and a ⋮ menu.
- Bookmarks: the star in the address bar (Ctrl+D), a bookmarks bar
  (Ctrl+Shift+B) with a » overflow menu, and right-click to open, edit or
  delete.
- Settings at `portal://settings`: title, icon, website, search engine, and
  new tab page.

Ctrl+L focuses the address bar. The shortcuts work even while a page has focus.

The window is frameless: the tabs share the top row with the window buttons
(Chrome's window controls overlay). If you see a normal title bar instead,
click the ⌄ button next to the window buttons to hide it. In the app view,
a thin title bar with your title and icon stays at the top so the window can
still be moved.

The window title and favicon follow your settings. The name and icon Windows
shows for the installed app (Start menu, taskbar) come from
`.well-known/manifest.webmanifest` and `icon.png`, and only change when you
rebuild and reinstall.

## Chrome setup (once)

Turn these on in `chrome://flags`, then restart Chrome:

- `#enable-isolated-web-apps`
- `#enable-isolated-web-app-dev-mode`
- `#enable-controlled-frame` (if your Chrome version lists it)

## Run while developing

```sh
npm install
npm run dev            # serves http://localhost:8080
```

In `chrome://iwa-dev`, click **Install**, choose **Dev Mode Proxy**, and enter
`http://localhost:8080`. (Before Chrome 156 these tools were in
`chrome://web-app-internals`.)

## Build a signed bundle

```sh
npm run keygen         # once; writes keys/private.pem
npm run build          # writes dist/portal.swbn
```

Install `dist/portal.swbn` from `chrome://iwa-dev` → **Install** → **Signed
Bundle**. Opening the `.swbn` file directly uses Chrome's regular installer,
which rejects self-signed apps with "contact the app developer". The key decides the app's `isolated-app://`
origin, so back up `keys/private.pem` and reuse it. Bump `version` in
`.well-known/manifest.webmanifest` for each release.

## Releases and updates

`npm run build` also adds the current version to `update.json` (the IWA update
manifest) and copies it to `dist/`. For each release:

1. Bump `version` in `.well-known/manifest.webmanifest`.
2. Run `npm run build` and commit the updated `update.json`.
3. Create a GitHub release tagged `v<version>` with `dist/portal.swbn` and
   `dist/update.json` attached:

   ```sh
   gh release create v1.1.0 dist/portal.swbn dist/update.json
   ```

The update manifest URL is always the latest release's copy:

```
https://github.com/Mewinator/-/releases/latest/download/update.json
```

Use it with **Install** → **Update Manifest** in `chrome://iwa-dev`, or as the
`update_manifest_url` in Chrome's `IsolatedWebAppInstallForceList` policy.
