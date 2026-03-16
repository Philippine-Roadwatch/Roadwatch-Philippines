# Google Apps Script CORS redeploy checklist

1. Open your Apps Script project and replace `Code.gs` with the version in this folder.
2. In **Project Settings > Script properties**, add:
   - `SPREADSHEET_ID=<your Google Sheet id>`
   - `SHEET_NAME=Reports` (or your preferred tab name)
3. Deploy as a **Web app**:
   - **Execute as**: Me
   - **Who has access**: Anyone
4. After deployment, copy the new `/exec` URL and update `API_URL` in `script.js` if the deployment ID changed.
5. Validate from `https://philippine-roadwatch.github.io`:
   - `GET /exec?action=getReports`
   - `POST /exec`
   - `OPTIONS /exec` (preflight should include CORS headers)

`Code.gs` sets `Access-Control-Allow-Origin` to `https://philippine-roadwatch.github.io`. If you need wider access, change `ALLOWED_ORIGIN` to `*`.
