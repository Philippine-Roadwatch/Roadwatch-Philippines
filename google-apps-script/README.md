# Google Apps Script CORS redeploy checklist

1. Open your Apps Script project and replace `Code.gs` with the version in this folder.
2. In **Project Settings > Script properties**, add:
   - `SPREADSHEET_ID=<your Google Sheet id>`
   - `SHEET_NAME=Reports` (or your preferred tab name)
3. Deploy as a **Web app**:
   - **Execute as**: Me
   - **Who has access**: Anyone
4. After deployment, copy the new `/exec` URL and update `API_URL` in `script.js` if the deployment ID changed.

## Verification from your deployed site

From `https://philippine-roadwatch.github.io`, verify:
- `GET /exec?action=getReports`
- `GET /exec?action=getReportByTracking&tracking=<tracking-number>`
- `POST /exec` (form submission)

Google Apps Script web app responses are served by Google infrastructure. In practice, CORS works when the web app is deployed with **Who has access: Anyone** and requests are made as simple GET/POST calls. `ContentService` does not provide a supported custom response-header API, so this template returns JSON and avoids unsupported header-setting code.

If you need broad origin access, keep client requests simple and avoid custom request headers that can force a preflight requirement.
