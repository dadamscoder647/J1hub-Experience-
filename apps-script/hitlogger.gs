const SHEET_NAME = 'Hits';
const TRANSPARENT_GIF_BASE64 = 'R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';

function doGet(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(5000);
  } catch (error) {
    return createPixelResponse();
  }

  try {
    const sheet = getSheet();
    const parameters = (e && e.parameter) || {};
    const headers = (e && e.headers) || {};
    const context = (e && e.context) || {};

    const timestamp = parseTimestamp(parameters.ts);
    const path = sanitize(parameters.p);
    const prop = sanitize(parameters.prop);
    const lang = sanitize(parameters.lang);
    const userAgent = sanitize(headers['User-Agent'] || headers['user-agent']);
    const ip = sanitize(context.clientIp);

    appendRow(sheet, [timestamp, path, prop, lang, userAgent, ip]);
  } finally {
    lock.releaseLock();
  }

  return createPixelResponse();
}

function getSheet() {
  const spreadsheet = SpreadsheetApp.getActive();
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_NAME);
  }

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['timestamp', 'path', 'prop', 'lang', 'userAgent', 'ip']);
  }

  return sheet;
}

function appendRow(sheet, values) {
  sheet.appendRow(values);
}

function parseTimestamp(rawTs) {
  const ts = Number(rawTs);
  if (!rawTs || Number.isNaN(ts)) {
    return new Date();
  }
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) {
    return new Date();
  }
  return date;
}

function sanitize(value) {
  if (!value) {
    return '';
  }
  const stringValue = String(value).trim();
  if (!stringValue) {
    return '';
  }
  return stringValue.slice(0, 256);
}

function createPixelResponse() {
  const pixelBytes = Utilities.base64Decode(TRANSPARENT_GIF_BASE64);
  return ContentService.createTextOutput(pixelBytes).setMimeType(ContentService.MimeType.GIF);
}
