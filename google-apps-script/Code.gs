const ALLOWED_ORIGIN = 'https://philippine-roadwatch.github.io';

function doGet(e) {
  if (isPreflight_(e)) return buildCorsResponse_({ ok: true });

  const action = (e && e.parameter && e.parameter.action) || '';
  if (action === 'getReports' || action === '') {
    const reports = readReports_();
    return buildCorsResponse_({ reports: reports });
  }

  return buildCorsResponse_({ error: 'Unknown action.' }, 400);
}

function doPost(e) {
  if (isPreflight_(e)) return buildCorsResponse_({ ok: true });

  const params = (e && e.parameter) || {};
  const row = {
    timestamp: new Date().toISOString(),
    tracking: params.tracking || '',
    lastname: params.lastname || '',
    firstname: params.firstname || '',
    mi: params.mi || '',
    email: params.email || '',
    phone: params.phone || '',
    location: params.location || '',
    issue: params.issue || '',
    lat: params.lat || '',
    lng: params.lng || ''
  };

  appendReport_(row);
  return buildCorsResponse_({ success: true, tracking: row.tracking });
}

// Google Apps Script web apps do not route OPTIONS to a dedicated handler.
// Check for preflight markers in doGet/doPost so preflight requests get CORS headers.
function isPreflight_(e) {
  if (!e) return false;

  const method =
    (e.parameter && e.parameter._method) ||
    (e.headers && (e.headers['X-HTTP-Method-Override'] || e.headers['x-http-method-override'])) ||
    '';

  return String(method).toUpperCase() === 'OPTIONS';
}

function buildCorsResponse_(payload, statusCode) {
  const output = ContentService
    .createTextOutput(JSON.stringify(payload || {}))
    .setMimeType(ContentService.MimeType.JSON);

  // Set CORS headers for browser calls from the published site.
  output.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  output.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  output.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  output.setHeader('Access-Control-Max-Age', '3600');

  if (statusCode) {
    output.setHeader('X-Status-Code', String(statusCode));
  }

  return output;
}

function getSheet_() {
  const spreadsheetId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!spreadsheetId) throw new Error('Missing SPREADSHEET_ID script property.');

  const sheetName = PropertiesService.getScriptProperties().getProperty('SHEET_NAME') || 'Reports';
  const ss = SpreadsheetApp.openById(spreadsheetId);
  const sheet = ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);

  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      'timestamp',
      'tracking',
      'lastname',
      'firstname',
      'mi',
      'email',
      'phone',
      'location',
      'issue',
      'lat',
      'lng'
    ]);
  }

  return sheet;
}

function appendReport_(row) {
  const sheet = getSheet_();
  sheet.appendRow([
    row.timestamp,
    row.tracking,
    row.lastname,
    row.firstname,
    row.mi,
    row.email,
    row.phone,
    row.location,
    row.issue,
    row.lat,
    row.lng
  ]);
}

function readReports_() {
  const sheet = getSheet_();
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];

  const headers = values[0];
  return values.slice(1).map(function (row) {
    const item = {};
    headers.forEach(function (header, index) {
      item[String(header || '').trim()] = row[index];
    });
    return item;
  });
}
