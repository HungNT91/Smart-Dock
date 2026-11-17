/**
 * =========================================================================
 * GOOGLE APPS SCRIPT: HỆ THỐNG ĐIỀU PHỐI DOCK & HÀNG ĐỢI GIAO HÀNG (WMS)
 * =========================================================================
 * Chuẩn hóa 100% theo 3 bảng tính thực tế của người dùng:
 * 1. Sheet "Thông Tin Giao Hàng": Đăng ký mới, hàng đợi ngoài bãi và gọi xe vào dock
 * 2. Sheet "Ưu Tiên": Gọi các xe giao hàng ưu tiên (cùng cấu trúc cột) không làm xáo trộn hàng đợi trước đó
 * 3. Sheet "Lịch sử giao hàng": Lưu vết xe đã vào dock / hoàn tất giao hàng
 */

export const APPS_SCRIPT_CODE_GS = `/**
 * =========================================================================
 * GOOGLE APPS SCRIPT: ĐIỀU PHỐI DOCK & HÀNG ĐỢI GIAO HÀNG (WMS REALTIME)
 * =========================================================================
 * Ba bảng tính hoạt động liên kết:
 * - "Thông Tin Giao Hàng": Tiếp nhận đăng ký, hàng đợi, gọi xe vào cửa dock
 * - "Ưu Tiên": Gọi xe giao hàng ưu tiên (cùng cấu trúc cột)
 * - "Lịch sử giao hàng": Chuyển dữ liệu khi xe xác nhận đã đến cửa / hoàn tất
 */

const SHEET_ACTIVE = 'Thông Tin Giao Hàng';
const SHEET_PRIORITY = 'Ưu Tiên';
const SHEET_HISTORY = 'Lịch sử giao hàng';

function normalizeVNText(str) {
  return String(str || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ');
}

function findSheetByNameFlexible(ss, targetName) {
  const exact = ss.getSheetByName(targetName);
  if (exact) return exact;
  const targetNorm = normalizeVNText(targetName);
  const sheets = ss.getSheets();
  for (let i = 0; i < sheets.length; i++) {
    if (normalizeVNText(sheets[i].getName()) === targetNorm) {
      return sheets[i];
    }
  }
  return null;
}

function findColumnIndexByHeader(headers, keywords, fallbackIdx) {
  for (let c = 0; c < headers.length; c++) {
    const h = normalizeVNText(headers[c]);
    if (!h) continue;
    for (let k = 0; k < keywords.length; k++) {
      if (h === keywords[k] || h.indexOf(keywords[k]) !== -1) {
        return c;
      }
    }
  }
  return fallbackIdx;
}

/**
 * 1. KHỞI TẠO BẢNG TÍNH MẪU CHUẨN (Chạy 1 lần trong Apps Script Editor)
 * Tự động tạo 2 sheet với đúng các cột theo ảnh thực tế.
 */
function setupInitialSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // -------------------------------------------------------------
  // Sheet 1: "Thông Tin Giao Hàng"
  // -------------------------------------------------------------
  let sheetActive = ss.getSheetByName(SHEET_ACTIVE);
  if (!sheetActive) {
    sheetActive = ss.insertSheet(SHEET_ACTIVE);
  }
  sheetActive.clear();
  
  const headersActive = [
    'Dấu thời gian',
    'Biển Số Xe',
    'Loại Xe',
    'Số lần gọi',
    'cửa',
    'ghi chú',
    'ưu tiên',
    'Sl Xe',
    'Vị Trí'
  ];
  
  sheetActive.getRange(1, 1, 1, headersActive.length).setValues([headersActive]);
  sheetActive.getRange(1, 1, 1, headersActive.length)
    .setBackground('#3b1d5e')
    .setFontColor('#ffffff')
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');
  sheetActive.setRowHeight(1, 38);
  
  // Dữ liệu mẫu bảng Thông Tin Giao Hàng
  const sampleActive = [
    ['04/11/2026 13:36:55', '50H59561', 'Xe Con, Xe Van', 1, 'A11', '', '', 1, '15m'],
    ['07/11/2026 09:14:11', '63C14368', 'Xe Tải 8 Tấn', '', '', '', '', 2, '10m'],
    ['07/11/2026 11:25:58', '50H33208', 'Xe Tải 1-5 Tấn', '', '', '', '', 3, '24m'],
    ['07/11/2026 11:57:17', '50H94008', 'Xe Tải 1-5 Tấn', '', '', '', '', 2, '19m'],
    ['07/11/2026 12:44:14', '51E30585', 'Xe Con, Xe Van', '', '', '', '', 1, '25m'],
    ['07/11/2026 12:59:02', '50H44017', 'Xe Tải 1-5 Tấn', '', '', '', '', 1, '10m'],
    ['07/11/2026 14:03:48', '78B01184', 'Xe Tải 1-5 Tấn', '', '', '', '', 1, '24m']
  ];
  sheetActive.getRange(2, 1, sampleActive.length, headersActive.length).setValues(sampleActive);
  
  // Validation Loại Xe
  const ruleType = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Xe Con, Xe Van', 'Xe Tải 1-5 Tấn', 'Xe Tải 8 Tấn', 'Xe Tải 15 Tấn'], true)
    .build();
  sheetActive.getRange('C2:C500').setDataValidation(ruleType);
  
  // Validation Cửa Dock (16 cửa: A1-A12, B1-B4)
  const dockList = [
    '',
    'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9', 'A10', 'A11', 'A12',
    'B1', 'B2', 'B3', 'B4'
  ];
  const ruleDock = SpreadsheetApp.newDataValidation()
    .requireValueInList(dockList, true)
    .build();
  sheetActive.getRange('E2:E500').setDataValidation(ruleDock);
  
  // Validation Ưu tiên
  const rulePriority = SpreadsheetApp.newDataValidation()
    .requireValueInList(['', 'Ưu tiên'], true)
    .build();
  sheetActive.getRange('G2:G500').setDataValidation(rulePriority);

  sheetActive.getRange('A2:A500').setHorizontalAlignment('center');
  sheetActive.getRange('B2:B500').setHorizontalAlignment('center');
  sheetActive.getRange('C2:C500').setHorizontalAlignment('center');
  sheetActive.getRange('D2:D500').setHorizontalAlignment('center');
  sheetActive.getRange('E2:E500').setHorizontalAlignment('center');
  sheetActive.getRange('G2:G500').setHorizontalAlignment('center');
  sheetActive.getRange('H2:H500').setHorizontalAlignment('center');
  sheetActive.getRange('I2:I500').setHorizontalAlignment('center');
  
  sheetActive.autoResizeColumns(1, headersActive.length);
  sheetActive.setColumnWidth(1, 160);
  sheetActive.setColumnWidth(2, 130);
  sheetActive.setColumnWidth(3, 140);
  
  // -------------------------------------------------------------
  // Sheet 2: "Lịch sử giao hàng"
  // -------------------------------------------------------------
  let sheetHist = ss.getSheetByName(SHEET_HISTORY);
  if (!sheetHist) {
    sheetHist = ss.insertSheet(SHEET_HISTORY);
  }
  sheetHist.clear();
  
  const headersHist = [
    'dấu thời gian',
    'biển số xe',
    'loại xe',
    'số lần gọi',
    'cửa',
    'ghi chú',
    'ưu tiên',
    'intime',
    'Sl Xe',
    'Vị Trí'
  ];
  
  sheetHist.getRange(1, 1, 1, headersHist.length).setValues([headersHist]);
  sheetHist.getRange(1, 1, 1, headersHist.length)
    .setBackground('#3b1d5e')
    .setFontColor('#ffffff')
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');
  sheetHist.setRowHeight(1, 38);
  
  const sampleHist = [
    ['03/11/2026 15:02:33', '62H04615', 'Xe Tải 1-5 Tấn', 1, 'A7', 'ĐÃ GIAO HÀNG', '', '03/11/2026 17:35:52', 1, '15m'],
    ['03/11/2026 16:05:44', '51D29892', 'Xe Tải 1-5 Tấn', 1, 'A2', 'ĐÃ GIAO HÀNG', '', '03/11/2026 17:36:52', 1, '20m'],
    ['03/11/2026 16:24:08', '51H78986', 'Xe Con, Xe Van', 1, 'A5', 'ĐÃ GIAO HÀNG', '', '03/11/2026 18:20:31', 1, '18m'],
    ['03/11/2026 16:27:22', '60C46789', 'Xe Tải 1-5 Tấn', 1, 'A2', 'ĐÃ GIAO HÀNG', '', '03/11/2026 18:21:03', 1, '13m'],
    ['07/11/2026 06:00:03', '51M54188', 'Xe Tải 15 Tấn', 1, 'B3', 'ĐÃ GIAO HÀNG', '', '07/11/2026 08:19:09', 1, '5m'],
    ['07/11/2026 06:00:35', '50H92454', 'Xe Tải 1-5 Tấn', 1, 'A5', 'ĐÃ GIAO HÀNG', 'Ưu tiên', '07/11/2026 08:20:09', 4, '13m'],
    ['07/11/2026 06:00:04', '70H03800', 'Xe Tải 1-5 Tấn', 1, 'A4', 'ĐÃ GIAO HÀNG', '', '07/11/2026 08:21:07', 8, '13m'],
    ['07/11/2026 06:46:08', '51B24015', 'Xe Tải 8 Tấn', 1, 'A6', 'ĐÃ GIAO HÀNG', 'Ưu tiên', '07/11/2026 08:24:21', 7, '26m']
  ];
  sheetHist.getRange(2, 1, sampleHist.length, headersHist.length).setValues(sampleHist);
  
  sheetHist.autoResizeColumns(1, headersHist.length);
  sheetHist.setColumnWidth(1, 160);
  sheetHist.setColumnWidth(2, 130);
  sheetHist.setColumnWidth(8, 160);

  // -------------------------------------------------------------
  // Sheet 3: "Ưu Tiên" (cấu trúc cột giống "Thông Tin Giao Hàng")
  // -------------------------------------------------------------
  let sheetPriority = ss.getSheetByName(SHEET_PRIORITY);
  if (!sheetPriority) {
    sheetPriority = ss.insertSheet(SHEET_PRIORITY);
    sheetPriority.getRange(1, 1, 1, headersActive.length).setValues([headersActive]);
    sheetPriority.getRange(1, 1, 1, headersActive.length)
      .setBackground('#b45309')
      .setFontColor('#ffffff')
      .setFontWeight('bold')
      .setHorizontalAlignment('center')
      .setVerticalAlignment('middle');
    sheetPriority.setRowHeight(1, 38);
    sheetPriority.getRange('C2:C500').setDataValidation(ruleType);
    sheetPriority.getRange('E2:E500').setDataValidation(ruleDock);
    sheetPriority.getRange('G2:G500').setDataValidation(rulePriority);
    sheetPriority.autoResizeColumns(1, headersActive.length);
    sheetPriority.setColumnWidth(1, 160);
    sheetPriority.setColumnWidth(2, 130);
    sheetPriority.setColumnWidth(3, 140);
  }

  SpreadsheetApp.getActiveSpreadsheet().toast('Đã khởi tạo thành công 3 sheet: Thông Tin Giao Hàng, Ưu Tiên & Lịch sử giao hàng', 'Hoàn tất', 5);
}

/**
 * 2. WEB APP HANDLER (HTMLService & API JSON)
 */
function doGet(e) {
  // Trả về JSON khi có tham số action=getDockData
  if (e && e.parameter && e.parameter.action === 'getDockData') {
    const data = getDockData();
    return ContentService.createTextOutput(JSON.stringify(data))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  // Mặc định: Phục vụ màn hình web bằng HTMLService
  const template = HtmlService.createTemplateFromFile('Index');
  return template.evaluate()
    .setTitle('Màn hình Điều phối Dock & Hàng đợi Giao hàng')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}

function doPost(e) {
  try {
    const contents = JSON.parse(e.postData.contents);
    const action = contents.action;
    
    if (action === 'callTruck') {
      const res = callTruckToDock(contents.plate, contents.dock);
      return ContentService.createTextOutput(JSON.stringify(res)).setMimeType(ContentService.MimeType.JSON);
    } else if (action === 'confirmArrival') {
      const res = confirmTruckAtDockOrComplete(contents.plate);
      return ContentService.createTextOutput(JSON.stringify(res)).setMimeType(ContentService.MimeType.JSON);
    } else if (action === 'registerTruck') {
      const res = registerNewTruck(contents);
      return ContentService.createTextOutput(JSON.stringify(res)).setMimeType(ContentService.MimeType.JSON);
    }
    
    return ContentService.createTextOutput(JSON.stringify({ success: false, message: 'Action không hợp lệ' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function readQueueSheetTrucks(sheet, sourceSheet) {
  if (!sheet || sheet.getLastRow() <= 1) return [];
  const lastRow = sheet.getLastRow();
  const lastCol = Math.max(9, sheet.getLastColumn());
  const allRows = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  const headers = allRows[0] || [];

  const idxTime = findColumnIndexByHeader(headers, ['dau thoi gian', 'thoi gian', 'timestamp'], 0);
  const idxPlate = findColumnIndexByHeader(headers, ['bien so', 'plate'], 1);
  const idxType = findColumnIndexByHeader(headers, ['loai xe', 'vehicletype'], 2);
  const idxCalls = findColumnIndexByHeader(headers, ['so lan goi', 'lan goi', 'call'], 3);
  const idxDock = findColumnIndexByHeader(headers, ['cua', 'dock'], 4);
  const idxNotes = findColumnIndexByHeader(headers, ['ghi chu', 'note'], 5);
  const idxPrio = findColumnIndexByHeader(headers, ['uu tien', 'priority'], 6);
  const idxCarCount = findColumnIndexByHeader(headers, ['sl xe', 'so luong'], 7);
  const idxPos = findColumnIndexByHeader(headers, ['vi tri', 'position'], 8);

  const result = [];
  for (let i = 1; i < allRows.length; i++) {
    const row = allRows[i];
    const plate = String(row[idxPlate] || '').trim();
    if (!plate) continue;

    result.push({
      rowIndex: i + 1,
      timestamp: formatTimestamp(row[idxTime]),
      plate: plate,
      vehicleType: String(row[idxType] || 'Xe Tải 1-5 Tấn').trim(),
      callCount: Number(row[idxCalls]) || 0,
      dock: String(row[idxDock] || '').trim(),
      notes: String(row[idxNotes] || '').trim(),
      priority: String(row[idxPrio] || (sourceSheet === 'priority' ? 'Ưu tiên' : '')).trim(),
      carCount: (row[idxCarCount] === '' || row[idxCarCount] === null || row[idxCarCount] === undefined) ? 1 : (Number(row[idxCarCount]) || 0),
      waitingPosition: String(row[idxPos] || '').trim(),
      sourceSheet: sourceSheet
    });
  }
  return result;
}

/**
 * 3. ĐỌC DỮ LIỆU THỜI GIAN THỰC TỪ GOOGLE SHEETS
 */
function getDockData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheetActive = findSheetByNameFlexible(ss, SHEET_ACTIVE);
  if (!sheetActive) {
    setupInitialSheet();
    sheetActive = findSheetByNameFlexible(ss, SHEET_ACTIVE);
  }

  const trucks = readQueueSheetTrucks(sheetActive, 'active');

  // Đọc danh sách từ sheet "Ưu Tiên" (tìm tên sheet linh hoạt, không phân biệt hoa thường/khoảng trắng)
  const sheetPriority = findSheetByNameFlexible(ss, SHEET_PRIORITY);
  const priorityTrucks = readQueueSheetTrucks(sheetPriority, 'priority');

  // Đọc danh sách lịch sử gần nhất (từ cuối bảng để luôn lấy các lượt mới nhất)
  const history = [];
  const sheetHist = findSheetByNameFlexible(ss, SHEET_HISTORY);
  if (sheetHist && sheetHist.getLastRow() > 1) {
    const lastHistCol = Math.max(10, sheetHist.getLastColumn());
    const histHeaders = sheetHist.getRange(1, 1, 1, lastHistCol).getValues()[0] || [];
    const idxHTime = findColumnIndexByHeader(histHeaders, ['dau thoi gian', 'thoi gian', 'timestamp'], 0);
    const idxHPlate = findColumnIndexByHeader(histHeaders, ['bien so', 'plate'], 1);
    const idxHType = findColumnIndexByHeader(histHeaders, ['loai xe', 'vehicletype'], 2);
    const idxHCalls = findColumnIndexByHeader(histHeaders, ['so lan goi', 'lan goi', 'call'], 3);
    const idxHDock = findColumnIndexByHeader(histHeaders, ['cua', 'dock'], 4);
    const idxHNotes = findColumnIndexByHeader(histHeaders, ['ghi chu', 'note'], 5);
    const idxHPrio = findColumnIndexByHeader(histHeaders, ['uu tien', 'priority'], 6);
    const idxHInTime = findColumnIndexByHeader(histHeaders, ['intime', 'in time', 'gio vao'], 7);
    const idxHCarCount = findColumnIndexByHeader(histHeaders, ['sl xe', 'so luong'], 8);
    const idxHPos = findColumnIndexByHeader(histHeaders, ['vi tri', 'position'], 9);

    const totalHistRows = sheetHist.getLastRow() - 1;
    const count = Math.min(totalHistRows, 50);
    const startRow = Math.max(2, sheetHist.getLastRow() - count + 1);
    const histVals = sheetHist.getRange(startRow, 1, count, lastHistCol).getValues();
    histVals.forEach((row) => {
      const plate = String(row[idxHPlate] || '').trim();
      if (!plate) return;
      history.push({
        timestamp: formatTimestamp(row[idxHTime]),
        plate: plate,
        vehicleType: String(row[idxHType] || '').trim(),
        callCount: Number(row[idxHCalls]) || 1,
        dock: String(row[idxHDock] || '').trim(),
        notes: String(row[idxHNotes] || '').trim(),
        priority: String(row[idxHPrio] || '').trim(),
        inTime: formatTimestamp(row[idxHInTime]),
        carCount: Number(row[idxHCarCount]) || 1,
        waitingPosition: String(row[idxHPos] || '').trim()
      });
    });
  }
  
  return {
    success: true,
    trucks: trucks,
    priorityTrucks: priorityTrucks,
    history: history,
    timestamp: new Date().toISOString()
  };
}

/**
 * 4. ĐĂNG KÝ XE MỚI VÀO CỔNG (Ghi vào "Thông Tin Giao Hàng")
 */
function registerNewTruck(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_ACTIVE);
  if (!sheet) {
    setupInitialSheet();
    sheet = ss.getSheetByName(SHEET_ACTIVE);
  }
  
  const now = new Date();
  const timeStr = Utilities.formatDate(now, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss');
  
  sheet.appendRow([
    data.timestamp || timeStr,
    String(data.plate || '').trim().toUpperCase(),
    data.vehicleType || 'Xe Tải 1-5 Tấn',
    data.callCount || '',
    data.dock || '',
    data.notes || '',
    data.priority || '',
    Number(data.carCount) || 1,
    data.waitingPosition || '15m'
  ]);
  
  return { success: true, plate: data.plate };
}

/**
 * 5. GỌI XE VÀO CỬA DOCK
 * - Cột "cửa" được điền cửa dock gọi vào (ví dụ "A11", "A2", "B3"...)
 * - Cột "Số lần gọi" tự động tăng dần (+1)
 */
function callTruckToDock(plate, dockName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetsToCheck = [
    findSheetByNameFlexible(ss, SHEET_PRIORITY),
    findSheetByNameFlexible(ss, SHEET_ACTIVE),
  ].filter(Boolean);
  if (sheetsToCheck.length === 0) throw new Error('Không tìm thấy sheet: ' + SHEET_ACTIVE);

  for (let s = 0; s < sheetsToCheck.length; s++) {
    const sheet = sheetsToCheck[s];
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) continue;

    const lastCol = Math.max(9, sheet.getLastColumn());
    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0] || [];
    const idxPlate = findColumnIndexByHeader(headers, ['bien so', 'plate'], 1);
    const idxCalls = findColumnIndexByHeader(headers, ['so lan goi', 'lan goi', 'call'], 3);
    const idxDock = findColumnIndexByHeader(headers, ['cua', 'dock'], 4);

    const values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
    for (let i = 0; i < values.length; i++) {
      if (String(values[i][idxPlate]).trim().toUpperCase() === String(plate).trim().toUpperCase()) {
        const foundRow = i + 2;
        const currentCalls = Number(values[i][idxCalls]) || 0;
        const nextCalls = currentCalls + 1;
        sheet.getRange(foundRow, idxCalls + 1).setValue(nextCalls);
        sheet.getRange(foundRow, idxDock + 1).setValue(dockName);
        return {
          success: true,
          message: 'Đã gọi xe ' + plate + ' vào cửa ' + dockName + ' (Lần gọi thứ ' + nextCalls + ')',
          callCount: nextCalls,
          dock: dockName
        };
      }
    }
  }
  
  return { success: false, message: 'Không tìm thấy biển số: ' + plate };
}

/**
 * 6. XÁC NHẬN ĐÃ ĐẾN CỬA / HOÀN TẤT GIAO HÀNG
 * - Chuyển toàn bộ dữ liệu dòng từ "Thông Tin Giao Hàng" hoặc "Ưu Tiên" sang "Lịch sử giao hàng"
 * - Ghi nhận intime thời điểm xác nhận
 * - Đánh dấu ghi chú: "ĐÃ GIAO HÀNG"
 * - Xóa dòng khỏi sheet nguồn
 */
function confirmTruckAtDockOrComplete(plate) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetHist = findSheetByNameFlexible(ss, SHEET_HISTORY);
  if (!sheetHist) throw new Error('Không tìm thấy sheet Lịch sử giao hàng');

  const sheetsToCheck = [
    findSheetByNameFlexible(ss, SHEET_PRIORITY),
    findSheetByNameFlexible(ss, SHEET_ACTIVE),
  ].filter(Boolean);
  for (let s = 0; s < sheetsToCheck.length; s++) {
    const sheetSource = sheetsToCheck[s];
    const lastRow = sheetSource.getLastRow();
    if (lastRow <= 1) continue;

    const lastCol = Math.max(9, sheetSource.getLastColumn());
    const headers = sheetSource.getRange(1, 1, 1, lastCol).getValues()[0] || [];
    const idxTime = findColumnIndexByHeader(headers, ['dau thoi gian', 'thoi gian', 'timestamp'], 0);
    const idxPlate = findColumnIndexByHeader(headers, ['bien so', 'plate'], 1);
    const idxType = findColumnIndexByHeader(headers, ['loai xe', 'vehicletype'], 2);
    const idxCalls = findColumnIndexByHeader(headers, ['so lan goi', 'lan goi', 'call'], 3);
    const idxDock = findColumnIndexByHeader(headers, ['cua', 'dock'], 4);
    const idxPrio = findColumnIndexByHeader(headers, ['uu tien', 'priority'], 6);
    const idxCarCount = findColumnIndexByHeader(headers, ['sl xe', 'so luong'], 7);
    const idxPos = findColumnIndexByHeader(headers, ['vi tri', 'position'], 8);

    const values = sheetSource.getRange(2, 1, lastRow - 1, lastCol).getValues();
    for (let i = 0; i < values.length; i++) {
      if (String(values[i][idxPlate]).trim().toUpperCase() === String(plate).trim().toUpperCase()) {
        const rowData = values[i];
        const now = new Date();
        const inTimeStr = Utilities.formatDate(now, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss');

        sheetHist.appendRow([
          rowData[idxTime],
          rowData[idxPlate],
          rowData[idxType],
          rowData[idxCalls] || 1,
          rowData[idxDock] || '',
          'ĐÃ GIAO HÀNG',
          rowData[idxPrio] || '',
          inTimeStr,
          rowData[idxCarCount] || 1,
          rowData[idxPos] || ''
        ]);

        sheetSource.deleteRow(i + 2);
        return {
          success: true,
          message: 'Đã xác nhận và chuyển xe ' + plate + ' sang sheet Lịch sử giao hàng',
          plate: plate
        };
      }
    }
  }
  
  return { success: false, message: 'Không tìm thấy xe ' + plate + ' trong hàng đợi' };
}

function formatTimestamp(val) {
  if (!val) return '';
  if (val instanceof Date) {
    return Utilities.formatDate(val, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss');
  }
  return String(val);
}
`;

export const APPS_SCRIPT_INDEX_HTML = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>Màn hình Điều phối Dock & Hàng đợi Giao hàng</title>
  <link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #0b0f19;
      --panel: #131c2e;
      --ink: #f1f5f9;
      --mute: #94a3b8;
      --line: #1e293b;
      --accent: #3b82f6;
      --success: #10b981;
      --warn: #f59e0b;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--ink);
      font-family: 'Be Vietnam Pro', sans-serif;
      overflow: hidden;
      width: 100vw;
      height: 100vh;
      display: flex;
      flex-direction: column;
    }
    header {
      position: absolute;
      top: 12px;
      right: 16px;
      z-index: 50;
      display: flex;
      gap: 8px;
    }
    .btn {
      padding: 6px 12px;
      border-radius: 8px;
      background: rgba(19, 28, 46, 0.85);
      border: 1px solid var(--line);
      color: var(--ink);
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      backdrop-filter: blur(8px);
    }
    .btn-sync {
      background: rgba(16, 185, 129, 0.9);
      color: white;
      border: none;
    }
    #viewport {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    svg {
      width: 100%;
      height: 100%;
    }
    .toast {
      position: fixed;
      top: 16px;
      left: 16px;
      background: #1e293b;
      color: white;
      padding: 10px 16px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      border: 1px solid #334155;
      display: none;
      z-index: 100;
      box-shadow: 0 10px 25px rgba(0,0,0,0.5);
    }
  </style>
</head>
<body>
  <div id="toast" class="toast"></div>
  
  <header>
    <button class="btn btn-sync" onclick="syncFromGoogleSheet()">Đồng bộ Sheet</button>
  </header>

  <div id="viewport">
    <div style="text-align: center; color: var(--mute); font-size: 14px;">
      Đang tải dữ liệu từ Google Sheets: <b>Thông Tin Giao Hàng</b>...
    </div>
  </div>

  <script>
    function showToast(msg) {
      var t = document.getElementById('toast');
      t.innerText = msg;
      t.style.display = 'block';
      setTimeout(function() { t.style.display = 'none'; }, 3500);
    }

    function syncFromGoogleSheet() {
      if (typeof google !== 'undefined' && google.script && google.script.run) {
        google.script.run
          .withSuccessHandler(function(res) {
            showToast('Đã đồng bộ ' + (res.trucks ? res.trucks.length : 0) + ' xe trong hàng đợi');
          })
          .withFailureHandler(function(err) {
            showToast('Lỗi: ' + err.message);
          })
          .getDockData();
      } else {
        showToast('Mở trong Google Apps Script Web App để đồng bộ trực tiếp');
      }
    }

    setInterval(syncFromGoogleSheet, 5000);
  </script>
</body>
</html>
`;
