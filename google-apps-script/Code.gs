const ALLOWED_ORIGIN = 'https://philippine-roadwatch.github.io';

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || '';
  if (action === 'getReports' || action === '') {
    const reports = readReports_();
    return buildJsonResponse_({ reports: reports, allowedOrigin: ALLOWED_ORIGIN });
  }

  return buildJsonResponse_({ error: 'Unknown action.', allowedOrigin: ALLOWED_ORIGIN });
}

function doPost(e) {
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
    lng: params.lng || '',
    photo: params.photo || '',
    status: params.status || 'Pending'
  };

  appendReport_(row);
  return buildJsonResponse_({ success: true, tracking: row.tracking, allowedOrigin: ALLOWED_ORIGIN });
}

function buildJsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload || {}))
    .setMimeType(ContentService.MimeType.JSON);
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
      'lng',
      'photo',
      'status'
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
    row.lng,
    row.photo,
    row.status
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
