# kofhafinance
managed excel gl into supabase

## Installable app (PWA)

Files: `KoFHA_Dashboard.html` (page markup), `css/app.css` (styles), `js/*.js` (core, overview, modules, designer, reports, salary-billing, ask, appearance, pwa), `manifest.webmanifest`, `sw.js` (service worker), `icons/`, `index.html` (opens the dashboard).
Hosting: GitHub Pages (Settings > Pages > Branch `main`, folder `/ (root)`), address `https://karachitimes.github.io/kofhafinance/`.

How updates reach users
- Change any own file (`KoFHA_Dashboard.html`, `css/`, `js/`) and upload it: users get it on the next open (own files are always read from the network first).
- Adding or removing a file: also list it in `SHELL` in `sw.js` and raise `VERSION`.
- Change `sw.js`, the icons, the manifest or a CDN library version: also raise `VERSION` in `sw.js` (e.g. `kofha-2026-11-20-1`).
  Users then see "A new version of KoFHA ERP is ready. Reload".
- Supabase changes (SQL, reports, matching) need nothing here: they are live at once.
- Supabase data and sign-in are never cached by the app.

Android APK (PWABuilder, Trusted Web Activity)
- The APK only opens this site, so every change above reaches the APK users too; no new APK is needed.
- A new APK is needed only to change the app name, icon, address or package; build it with the SAME signing key and a higher version code.
  Keep the signing key file and its password safe: without them the APK can never be updated (users would have to uninstall).

Offline
- Every report answer the app has received is kept on the device (IndexedDB) and shown when there is no internet, with "Offline: figures as of ...".
- Actions that change data (Match bank, Confirm / Reject, pushes) never run offline. Sign out clears the offline copies.
