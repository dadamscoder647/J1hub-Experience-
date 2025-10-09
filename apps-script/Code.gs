function doPost(e) {
  var response;
  try {
    var payload = parsePayload_(e);
    if (!payload || payload.type !== 'checkin') {
      return respond_(false, 'Invalid payload type');
    }
    if (!payload.event || !payload.user) {
      return respond_(false, 'Missing required fields');
    }

    var sheet = resolveSheet_();
    var headers = (e && e.headers) || {};
    var requestUserAgent = headers['User-Agent'] || headers['user-agent'] || '';
    var userAgent = payload.userAgent || requestUserAgent;
    var clientIp = (e && e.context && e.context.clientIp) || '';

    sheet.appendRow([
      new Date(),
      payload.event,
      payload.user,
      userAgent,
      clientIp
    ]);

    response = respond_(true);
  } catch (error) {
    response = respond_(false, error && error.message ? error.message : 'Unexpected error');
  }
  return response;
}

function parsePayload_(e) {
  if (!e || !e.postData || !e.postData.contents) {
    throw new Error('Missing request body');
  }
  var contents = e.postData.contents;
  return JSON.parse(contents);
}

function resolveSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error('No active spreadsheet');
  }
  var sheet = ss.getSheetByName('Check-ins');
  if (!sheet) {
    sheet = ss.insertSheet('Check-ins');
    sheet.appendRow(['Timestamp', 'Event', 'User', 'User Agent', 'IP']);
  }
  return sheet;
}

function respond_(ok, message) {
  var payload = { ok: ok };
  if (!ok && message) {
    payload.error = message;
  }
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}
