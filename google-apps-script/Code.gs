const ALLOWED_ORIGIN = 'https://philippine-roadwatch.github.io';

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || '';
  if (action === 'getReports' || action === '') {
    const reports = readReports_();
    return buildJsonResponse_({ reports: reports, allowedOrigin: ALLOWED_ORIGIN }, e);
  }

  if (action === 'getReportByTracking') {
    const tracking = (e && e.parameter && e.parameter.tracking) || '';
    const report = readReportByTracking_(tracking);
    return buildJsonResponse_({ report: report, allowedOrigin: ALLOWED_ORIGIN }, e);
  }

  if (action === 'updateStatus') {
    const tracking = (e && e.parameter && e.parameter.tracking) || '';
    const status = (e && e.parameter && e.parameter.status) || '';
    const result = updateReportStatusByTracking_(tracking, status);

    return buildJsonResponse_({
      success: result.success,
      tracking: tracking,
      status: result.status,
      updated: result.updated,
      error: result.error || '',
      allowedOrigin: ALLOWED_ORIGIN
    }, e);
  }

  return buildJsonResponse_({ error: 'Unknown action.', allowedOrigin: ALLOWED_ORIGIN }, e);
}

function doPost(e) {
  const params = (e && e.parameter) || {};

  if (params.action === 'updateStatus') {
    const tracking = params.tracking || '';
    const status = params.status || '';
    const result = updateReportStatusByTracking_(tracking, status);

    return buildJsonResponse_({
      success: result.success,
      tracking: tracking,
      status: result.status,
      updated: result.updated,
      error: result.error || '',
      allowedOrigin: ALLOWED_ORIGIN
    }, e);
  }

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

  const appendResult = appendReport_(row);
  return buildJsonResponse_({
    success: true,
    duplicate: appendResult.duplicate,
    tracking: row.tracking,
    allowedOrigin: ALLOWED_ORIGIN
  }, e);
}

function updateReportStatusByTracking_(tracking, status) {
  const trackingValue = String(tracking || '').trim();
  const normalizedStatus = normalizeStatus_(status);

  if (!trackingValue) {
    return { success: false, updated: false, status: normalizedStatus, error: 'Tracking is required.' };
  }

  const sheet = getSheet_();
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) {
    return { success: false, updated: false, status: normalizedStatus, error: 'No reports found.' };
  }

  const headers = values[0].map(function (header) { return String(header || '').trim().toLowerCase(); });
  const trackingColumnIndex = headers.indexOf('tracking');
  const statusColumnIndex = headers.indexOf('status');

  if (trackingColumnIndex === -1 || statusColumnIndex === -1) {
    return {
      success: false,
      updated: false,
      status: normalizedStatus,
      error: 'Missing tracking or status column in sheet.'
    };
  }

  const targetTracking = trackingValue.toLowerCase();
  for (var rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
    var rowTracking = String(values[rowIndex][trackingColumnIndex] || '').trim().toLowerCase();
    if (rowTracking === targetTracking) {
      sheet.getRange(rowIndex + 1, statusColumnIndex + 1).setValue(normalizedStatus);
      return { success: true, updated: true, status: normalizedStatus };
    }
  }

  return { success: false, updated: false, status: normalizedStatus, error: 'Tracking number not found.' };
}

function normalizeStatus_(status) {
  const raw = String(status || '').trim().toLowerCase();
  if (raw === 'verified') return 'Verified';
  if (raw === 'in progress' || raw === 'inprogress') return 'In Progress';
  if (raw === 'repaired') return 'Repaired';
  return 'Pending';
}

function buildJsonResponse_(payload, e) {
  const safePayload = payload || {};
  const callback = sanitizeCallback_((e && e.parameter && e.parameter.callback) || '');

  if (callback) {
    return ContentService
      .createTextOutput(callback + '(' + JSON.stringify(safePayload) + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(JSON.stringify(safePayload))
    .setMimeType(ContentService.MimeType.JSON);
}

function sanitizeCallback_(callback) {
  const trimmed = String(callback || '').trim();
  if (!trimmed) return '';

  const callbackPattern = /^[a-zA-Z_$][0-9a-zA-Z_$\.]*$/;
  return callbackPattern.test(trimmed) ? trimmed : '';
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
  const columnCount = 13;
  const trackingValue = String(row.tracking || '').trim();
  const dataRowCount = Math.max(sheet.getLastRow() - 1, 0);
  const dataValues = dataRowCount > 0
    ? sheet.getRange(2, 1, dataRowCount, columnCount).getValues()
    : [];

  if (trackingValue) {
    const existingTrackings = dataValues
      .map(function (rowValues) { return String(rowValues[1] || '').trim(); })
      .filter(function (value) { return value !== ''; });

    if (existingTrackings.includes(trackingValue)) {
      return { duplicate: true };
    }
  }

  const valuesToWrite = [[
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
  ]];

  const firstAvailableIndex = dataValues.findIndex(function (rowValues) {
    return rowValues.every(function (value) { return String(value || '').trim() === ''; });
  });

  if (firstAvailableIndex !== -1) {
    sheet.getRange(firstAvailableIndex + 2, 1, 1, columnCount).setValues(valuesToWrite);
  } else {
    sheet.appendRow(valuesToWrite[0]);
  }

  return { duplicate: false };
}

function readReports_() {
  const sheet = getSheet_();
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];

  const headers = values[0];
  return values.slice(1)
    .filter(function (row) {
      return row.some(function (value) { return String(value || '').trim() !== ''; });
    })
    .map(function (row) {
      const item = {};
      headers.forEach(function (header, index) {
        item[String(header || '').trim()] = row[index];
      });
      return item;
    });
}

function readReportByTracking_(tracking) {
  const trackingValue = String(tracking || '').trim().toLowerCase();
  if (!trackingValue) return null;

  const reports = readReports_();
  for (var i = 0; i < reports.length; i += 1) {
    var rowTracking = String(reports[i].tracking || '').trim().toLowerCase();
    if (rowTracking === trackingValue) {
      return reports[i];
    }
  }

  return null;
}
