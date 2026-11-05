# Isolated Web App (IWA)

Opens a website of your choice in its own app window. Pages load in a
`<controlledframe>`, which only works inside an Isolated Web App.

On first launch the app asks for a title, an icon, and a website URL. After
that it opens straight to that site, using that title and icon.

Press **Ctrl+Shift+Alt+Enter** to switch to the built-in browser (tabs, a
search/address bar, and a settings menu for changing the title, icon, website,
search engine, and new tab page). Press it again to go back.

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

In `chrome://web-app-internals`, under **Isolated Web Apps**, enter
`http://localhost:8080` in **Install IWA via Dev Mode Proxy**.

## Build a signed bundle

```sh
npm run keygen         # once; writes keys/private.pem
npm run build          # writes dist/portal.swbn
```

Install `dist/portal.swbn` with **Install IWA from Signed Web Bundle** in
`chrome://web-app-internals`. The key decides the app's `isolated-app://`
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
   gh release create v1.0.1 dist/portal.swbn dist/update.json
   ```

The update manifest URL is always the latest release's copy:

```
https://github.com/Mewinator/-/releases/latest/download/update.json
```

Use it with **Install IWA via Update Manifest** in `chrome://web-app-internals`
(together with the app's Web Bundle ID, printed by `npm run build`), or as the
`update_manifest_url` in Chrome's `IsolatedWebAppInstallForceList` policy.
