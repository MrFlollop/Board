# BOARD (alpha 0.1.0)

Sunday Treat's own project board. Single-file front end (`index.html`) on GitHub Pages, Google Apps Script backend bound to the BOARD Database sheet.

## Repo layout
- `index.html` built app (this is what Pages serves)
- `src/` source parts (`core.js`, `views.js`, `panels.js`, `style.css`), `build.py` joins them into `index.html`
- `backend/Code.gs`, `backend/appsscript.json` Apps Script backend
- `assets/logo-black.png`, `assets/logo-white.png` Sunday Treat logo (black for light mode, white for dark)
- `mock/` Node test harness for the backend (`node mock/test-backend.js`)

## Deploy the backend
1. Open the sheet "BOARD. Database" > Extensions > Apps Script.
2. Project Settings > tick "Show appsscript.json", paste `backend/appsscript.json` over it.
3. Replace the contents of `Code.gs` with `backend/Code.gs`.
4. Run `setup()` once. Approve the permissions (Sheets, Mail, Code Generator sheet). Check Executions for the read-only key it logs.
5. Deploy > New deployment > Web app. Execute as: Me. Who has access: Anyone. Copy the `/exec` URL.

## Deploy the front end
1. Paste the URL into `API_URL` at the top of `src/core.js` (or directly in `index.html`), then `python3 build.py` if you edited the source.
2. Add the two logo PNGs to `assets/`.
3. Push to a new private GitHub repo, Settings > Pages > deploy from main.

## Alpha notes
- Login: leave user and password blank to get in as Oli (`ALPHA_OPEN`). Switch it off before sharing: Settings > System, or set `ALPHA_OPEN` to false in Script Properties. Set a passcode for Oli first (Settings > People > Set).
- Read-only live view: `index.html?view=live&k=READONLY_KEY`. Budget, notes, closeout and project codes are stripped server side. Rotate the key in Settings > System.
- Run `signEveryoneOut()` in Apps Script to invalidate every session.
- Department colours are provisional. Edit them in Settings > Departments.
- Projects holds live and Out Processing. Archived history sits in the Archive tab (grouped by FY); the Closeout "Archive" button moves a project there.
