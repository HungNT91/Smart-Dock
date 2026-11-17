import { Truck, Dock, SheetRowData, HistoryRowData, SyncConfig, VehicleTypeKey } from '../types';
import { VEHICLE_CONFIGS, mapTypeNameToKey } from '../utils/isoMath';

const STORAGE_KEY_TRUCKS = 'wms_trucks_v3';
const STORAGE_KEY_PRIORITY_TRUCKS = 'wms_priority_trucks_v1';
const STORAGE_KEY_DOCKS = 'wms_docks_v3';
const STORAGE_KEY_HISTORY = 'wms_history_v3';
const STORAGE_KEY_CONFIG = 'wms_sync_config_v3';
const STORAGE_KEY_LAST_RESET_21H = 'wms_last_reset_21h_date_v1';
const STORAGE_KEY_LAST_SESSION_DATE = 'wms_last_session_date_v1';
const STORAGE_KEY_DISMISSED_21H = 'wms_dismissed_21h_calls_v1';

export interface DismissedCallEntry {
  plate: string;
  dock: string;
  callCount: number;
  resetDate: string;
}

export function getLocalDateKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Parses timestamps in "dd/MM/yyyy HH:mm:ss", "d/M/yyyy H:m:s", "yyyy-MM-dd...", or ISO strings.
 */
export function parseSheetDateTime(value?: string): Date | null {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  // If ISO string includes an explicit timezone (e.g. Z or +07:00), let Date.parse convert to local time
  if (/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw)) {
    const ts = Date.parse(raw);
    if (!isNaN(ts)) return new Date(ts);
  }

  const applyMeridiem = (hour: number, meridiem?: string) => {
    if (!meridiem) return hour;
    const m = meridiem.toUpperCase();
    if ((m === 'PM' || m === 'CH') && hour < 12) return hour + 12;
    if ((m === 'AM' || m === 'SA') && hour === 12) return 0;
    return hour;
  };

  // Match yyyy-MM-dd or yyyy/MM/dd optionally followed by time
  const isoYmd = raw.match(
    /^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})(?:[\sT,]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?(?:\s*(AM|PM|SA|CH))?)?/i
  );
  if (isoYmd) {
    const year = parseInt(isoYmd[1], 10);
    const month = parseInt(isoYmd[2], 10);
    const day = parseInt(isoYmd[3], 10);
    const rawHour = isoYmd[4] ? parseInt(isoYmd[4], 10) : 0;
    const hour = applyMeridiem(rawHour, isoYmd[7]);
    const min = isoYmd[5] ? parseInt(isoYmd[5], 10) : 0;
    const sec = isoYmd[6] ? parseInt(isoYmd[6], 10) : 0;
    const parsed = new Date(year, month - 1, day, hour, min, sec);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  // Match dd/MM/yyyy HH:mm:ss (Google Apps Script format)
  const dmy = raw.match(
    /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:[\sT,]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?(?:\s*(AM|PM|SA|CH))?)?/i
  );
  if (dmy) {
    const part1 = parseInt(dmy[1], 10);
    const part2 = parseInt(dmy[2], 10);
    const year = parseInt(dmy[3], 10);
    const rawHour = dmy[4] ? parseInt(dmy[4], 10) : 0;
    const hour = applyMeridiem(rawHour, dmy[7]);
    const min = dmy[5] ? parseInt(dmy[5], 10) : 0;
    const sec = dmy[6] ? parseInt(dmy[6], 10) : 0;

    // Default dd/MM/yyyy; fallback to MM/dd/yyyy only if second part > 12
    const day = part2 > 12 ? part2 : part1;
    const month = part2 > 12 ? part1 : part2;
    const parsed = new Date(year, month - 1, day, hour, min, sec);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  // Only treat remaining strings as full timestamps if they contain a 4-digit year
  if (/\d{4}/.test(raw)) {
    const ts = Date.parse(raw);
    if (!isNaN(ts)) {
      return new Date(ts);
    }
  }
  return null;
}

/**
 * Returns true only if `dateStr` falls on the same local calendar day as `now`
 * and both `now` and `dateStr` are strictly before `cutoffHour` (21:00).
 */
export function isTodayBeforeCutoff(
  dateStr?: string,
  now: Date = new Date(),
  cutoffHour = 21
): boolean {
  if (now.getHours() >= cutoffHour) return false;
  const parsed = parseSheetDateTime(dateStr);
  if (!parsed) return false;
  return getLocalDateKey(parsed) === getLocalDateKey(now) && parsed.getHours() < cutoffHour;
}

/**
 * Checks a history record's `inTime` (with fallback to `timestamp` if `inTime` is empty or time-only)
 */
export function isHistoryEntryTodayBeforeCutoff(
  inTime?: string,
  timestamp?: string,
  now: Date = new Date(),
  cutoffHour = 21
): boolean {
  if (now.getHours() >= cutoffHour) return false;
  const parsedIn = parseSheetDateTime(inTime);
  if (parsedIn) {
    return getLocalDateKey(parsedIn) === getLocalDateKey(now) && parsedIn.getHours() < cutoffHour;
  }
  const parsedTs = parseSheetDateTime(timestamp);
  if (parsedTs) {
    return getLocalDateKey(parsedTs) === getLocalDateKey(now) && parsedTs.getHours() < cutoffHour;
  }
  return false;
}

export function getStoredReset21hDate(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(STORAGE_KEY_LAST_RESET_21H);
  } catch {
    return null;
  }
}

export function setStoredReset21hDate(dateKey: string) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY_LAST_RESET_21H, dateKey);
  } catch {
    // ignore storage errors
  }
}

export function getStoredSessionDate(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(STORAGE_KEY_LAST_SESSION_DATE);
  } catch {
    return null;
  }
}

export function setStoredSessionDate(dateKey: string) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY_LAST_SESSION_DATE, dateKey);
  } catch {
    // ignore storage errors
  }
}

export function loadDismissed21hCalls(): DismissedCallEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY_DISMISSED_21H);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveDismissed21hCalls(entries: DismissedCallEntry[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY_DISMISSED_21H, JSON.stringify(entries));
  } catch {
    // ignore storage errors
  }
}

export const DOCK_DEFINITIONS: { id: string; group: 'A' | 'B' }[] = [
  // Cửa A1 đến A12 (12 cửa)
  { id: 'A1', group: 'A' },
  { id: 'A2', group: 'A' },
  { id: 'A3', group: 'A' },
  { id: 'A4', group: 'A' },
  { id: 'A5', group: 'A' },
  { id: 'A6', group: 'A' },
  { id: 'A7', group: 'A' },
  { id: 'A8', group: 'A' },
  { id: 'A9', group: 'A' },
  { id: 'A10', group: 'A' },
  { id: 'A11', group: 'A' },
  { id: 'A12', group: 'A' },
  // Cửa B1 đến B4 (4 cửa)
  { id: 'B1', group: 'B' },
  { id: 'B2', group: 'B' },
  { id: 'B3', group: 'B' },
  { id: 'B4', group: 'B' },
];

export const INITIAL_DOCKS: Dock[] = DOCK_DEFINITIONS.map((def, i) => ({
  index: i,
  id: def.id,
  group: def.group,
  cx: 30 + i * 58,
  status: 'free',
  currentTruck: null,
  since: 0,
}));

/**
 * Parses both "A11", "A2", "Dock A2", "A02", "B3", "Dock B03"
 */
export function findDockIndexById(dockString: string): number | null {
  if (!dockString) return null;
  const clean = dockString
    .replace(/dock/i, '')
    .replace(/cửa/i, '')
    .replace(/cua/i, '')
    .trim()
    .toUpperCase();
  const exact = DOCK_DEFINITIONS.findIndex((d) => d.id === clean);
  if (exact !== -1) return exact;

  if (clean.startsWith('A')) {
    const num = parseInt(clean.slice(1), 10);
    if (!isNaN(num) && num >= 1 && num <= 12) {
      const normalized = `A${num}`;
      return DOCK_DEFINITIONS.findIndex((d) => d.id === normalized);
    }
  } else if (clean.startsWith('B')) {
    const num = parseInt(clean.slice(1), 10);
    if (!isNaN(num) && num >= 1 && num <= 4) {
      const normalized = `B${num}`;
      return DOCK_DEFINITIONS.findIndex((d) => d.id === normalized);
    }
  } else {
    const num = parseInt(clean, 10);
    if (!isNaN(num) && num >= 1 && num <= 12) {
      const normalized = `A${num}`;
      return DOCK_DEFINITIONS.findIndex((d) => d.id === normalized);
    }
  }
  return null;
}

/**
 * Format dock display: "A11", "A02" -> "A2", "B03" -> "B3"
 */
export function formatDockId(dockId: string | null | undefined): string {
  if (!dockId) return '';
  const idx = findDockIndexById(dockId);
  if (idx !== null) return DOCK_DEFINITIONS[idx].id;
  return dockId.replace(/dock/i, '').trim().toUpperCase();
}

/**
 * Active trucks in sheet "Thông Tin Giao Hàng"
 */
export const INITIAL_TRUCKS: Truck[] = [
  {
    id: 'TRK-50H59561',
    plate: '50H59561',
    type: 'van',
    supplier: 'Nhà cung cấp A',
    pallets: 5,
    assignedDock: 'A11',
    dockId: 10,
    checkInTime: '13:36',
    arrivalTimeMs: Date.now() - 35 * 60 * 1000,
    status: 'busy',
    since: Date.now() - 15 * 60 * 1000,
    unloadedPallets: 3,
    timestamp: '04/11/2026 13:36:55',
    callCount: 1,
    priority: '',
    carCount: 1,
    waitingPosition: '15m',
    notes: '',
    sheetRowIndex: 2,
  },
  {
    id: 'TRK-63C14368',
    plate: '63C14368',
    type: 'big',
    supplier: 'DKSH Logistics',
    pallets: 16,
    assignedDock: null,
    dockId: null,
    checkInTime: '09:14',
    arrivalTimeMs: Date.now() - 28 * 60 * 1000,
    status: 'waiting',
    spot: 0,
    timestamp: '07/11/2026 9:14:11',
    callCount: undefined,
    priority: '',
    carCount: 2,
    waitingPosition: '10m',
    notes: '',
    sheetRowIndex: 3,
  },
  {
    id: 'TRK-50H33208',
    plate: '50H33208',
    type: 'small',
    supplier: 'Zuellig Pharma',
    pallets: 8,
    assignedDock: null,
    dockId: null,
    checkInTime: '11:25',
    arrivalTimeMs: Date.now() - 22 * 60 * 1000,
    status: 'waiting',
    spot: 1,
    timestamp: '07/11/2026 11:25:58',
    callCount: undefined,
    priority: '',
    carCount: 3,
    waitingPosition: '24m',
    notes: '',
    sheetRowIndex: 4,
  },
  {
    id: 'TRK-50H94008',
    plate: '50H94008',
    type: 'small',
    supplier: 'Sanofi-Aventis',
    pallets: 6,
    assignedDock: null,
    dockId: null,
    checkInTime: '11:57',
    arrivalTimeMs: Date.now() - 18 * 60 * 1000,
    status: 'waiting',
    spot: 2,
    timestamp: '07/11/2026 11:57:17',
    callCount: undefined,
    priority: '',
    carCount: 2,
    waitingPosition: '19m',
    notes: '',
    sheetRowIndex: 5,
  },
  {
    id: 'TRK-51E30585',
    plate: '51E30585',
    type: 'van',
    supplier: 'Dược Hậu Giang',
    pallets: 4,
    assignedDock: null,
    dockId: null,
    checkInTime: '12:44',
    arrivalTimeMs: Date.now() - 14 * 60 * 1000,
    status: 'waiting',
    spot: 3,
    timestamp: '07/11/2026 12:44:14',
    callCount: undefined,
    priority: '',
    carCount: 1,
    waitingPosition: '25m',
    notes: '',
    sheetRowIndex: 6,
  },
  {
    id: 'TRK-50H44017',
    plate: '50H44017',
    type: 'small',
    supplier: 'Traphaco',
    pallets: 7,
    assignedDock: null,
    dockId: null,
    checkInTime: '12:59',
    arrivalTimeMs: Date.now() - 10 * 60 * 1000,
    status: 'waiting',
    spot: 4,
    timestamp: '07/11/2026 12:59:02',
    callCount: undefined,
    priority: '',
    carCount: 1,
    waitingPosition: '10m',
    notes: '',
    sheetRowIndex: 7,
  },
  {
    id: 'TRK-78B01184',
    plate: '78B01184',
    type: 'small',
    supplier: 'Imexpharm',
    pallets: 8,
    assignedDock: null,
    dockId: null,
    checkInTime: '14:03',
    arrivalTimeMs: Date.now() - 4 * 60 * 1000,
    status: 'waiting',
    spot: 5,
    timestamp: '07/11/2026 14:03:48',
    callCount: undefined,
    priority: '',
    carCount: 1,
    waitingPosition: '24m',
    notes: '',
    sheetRowIndex: 8,
  },
];

/**
 * Historical records from sheet "Lịch sử giao hàng"
 */
export const INITIAL_HISTORY_ROWS: HistoryRowData[] = [
  {
    timestamp: '03/11/2026 15:02:33',
    plate: '62H04615',
    vehicleType: 'Xe Tải 1-5 Tấn',
    callCount: 1,
    dock: 'A7',
    notes: 'ĐÃ GIAO HÀNG',
    priority: '',
    inTime: '03/11/2026 17:35:52',
    carCount: 1,
    waitingPosition: '15m',
  },
  {
    timestamp: '03/11/2026 16:05:44',
    plate: '51D29892',
    vehicleType: 'Xe Tải 1-5 Tấn',
    callCount: 1,
    dock: 'A2',
    notes: 'ĐÃ GIAO HÀNG',
    priority: '',
    inTime: '03/11/2026 17:36:52',
    carCount: 1,
    waitingPosition: '20m',
  },
  {
    timestamp: '03/11/2026 16:24:08',
    plate: '51H78986',
    vehicleType: 'Xe Con, Xe Van',
    callCount: 1,
    dock: 'A5',
    notes: 'ĐÃ GIAO HÀNG',
    priority: '',
    inTime: '03/11/2026 18:20:31',
    carCount: 1,
    waitingPosition: '18m',
  },
  {
    timestamp: '03/11/2026 16:27:22',
    plate: '60C46789',
    vehicleType: 'Xe Tải 1-5 Tấn',
    callCount: 1,
    dock: 'A2',
    notes: 'ĐÃ GIAO HÀNG',
    priority: '',
    inTime: '03/11/2026 18:21:03',
    carCount: 1,
    waitingPosition: '13m',
  },
  {
    timestamp: '07/11/2026 6:00:03',
    plate: '51M54188',
    vehicleType: 'Xe Tải 15 Tấn',
    callCount: 1,
    dock: 'B3',
    notes: 'ĐÃ GIAO HÀNG',
    priority: '',
    inTime: '07/11/2026 8:19:09',
    carCount: 1,
    waitingPosition: '5m',
  },
  {
    timestamp: '07/11/2026 6:00:35',
    plate: '50H92454',
    vehicleType: 'Xe Tải 1-5 Tấn',
    callCount: 1,
    dock: 'A5',
    notes: 'ĐÃ GIAO HÀNG',
    priority: 'Ưu tiên',
    inTime: '07/11/2026 8:20:09',
    carCount: 4,
    waitingPosition: '13m',
  },
  {
    timestamp: '07/11/2026 6:00:04',
    plate: '70H03800',
    vehicleType: 'Xe Tải 1-5 Tấn',
    callCount: 1,
    dock: 'A4',
    notes: 'ĐÃ GIAO HÀNG',
    priority: '',
    inTime: '07/11/2026 8:21:07',
    carCount: 8,
    waitingPosition: '13m',
  },
  {
    timestamp: '07/11/2026 6:46:08',
    plate: '51B24015',
    vehicleType: 'Xe Tải 8 Tấn',
    callCount: 1,
    dock: 'A6',
    notes: 'ĐÃ GIAO HÀNG',
    priority: 'Ưu tiên',
    inTime: '07/11/2026 8:24:21',
    carCount: 7,
    waitingPosition: '26m',
  },
  {
    timestamp: '07/11/2026 6:58:11',
    plate: '51D48804',
    vehicleType: 'Xe Tải 1-5 Tấn',
    callCount: 1,
    dock: 'A3',
    notes: 'ĐÃ GIAO HÀNG',
    priority: 'Ưu tiên',
    inTime: '07/11/2026 8:40:11',
    carCount: 1,
    waitingPosition: '16m',
  },
  {
    timestamp: '07/11/2026 7:04:49',
    plate: '50E17259',
    vehicleType: 'Xe Tải 1-5 Tấn',
    callCount: 1,
    dock: 'A2',
    notes: 'ĐÃ GIAO HÀNG',
    priority: 'Ưu tiên',
    inTime: '07/11/2026 8:50:05',
    carCount: 1,
    waitingPosition: '14m',
  },
  {
    timestamp: '07/11/2026 6:31:08',
    plate: '51C96989',
    vehicleType: 'Xe Tải 1-5 Tấn',
    callCount: 1,
    dock: 'A2',
    notes: 'ĐÃ GIAO HÀNG',
    priority: '',
    inTime: '07/11/2026 9:11:23',
    carCount: 2,
    waitingPosition: '22m',
  },
  {
    timestamp: '07/11/2026 10:21:52',
    plate: '61H20382',
    vehicleType: 'Xe Tải 1-5 Tấn',
    callCount: 1,
    dock: 'A4',
    notes: 'ĐÃ GIAO HÀNG',
    priority: 'Ưu tiên',
    inTime: '07/11/2026 10:41:48',
    carCount: 1,
    waitingPosition: '15m',
  },
  {
    timestamp: '07/11/2026 9:10:47',
    plate: '51D75314',
    vehicleType: 'Xe Tải 1-5 Tấn',
    callCount: 1,
    dock: 'B3',
    notes: 'ĐÃ GIAO HÀNG',
    priority: 'Ưu tiên',
    inTime: '07/11/2026 11:48:11',
    carCount: 3,
    waitingPosition: '3m',
  },
  {
    timestamp: '07/11/2026 9:10:41',
    plate: '51D72344',
    vehicleType: 'Xe Con, Xe Van',
    callCount: 1,
    dock: 'A3',
    notes: 'ĐÃ GIAO HÀNG',
    priority: '',
    inTime: '07/11/2026 13:33:25',
    carCount: 1,
    waitingPosition: '10m',
  },
  {
    timestamp: '07/11/2026 9:32:14',
    plate: '50H41678',
    vehicleType: 'Xe Tải 1-5 Tấn',
    callCount: 1,
    dock: 'A2',
    notes: 'ĐÃ GIAO HÀNG',
    priority: 'Ưu tiên',
    inTime: '07/11/2026 13:37:30',
    carCount: 1,
    waitingPosition: '16m',
  },
  {
    timestamp: '07/11/2026 12:55:31',
    plate: '61H03215',
    vehicleType: 'Xe Con, Xe Van',
    callCount: 1,
    dock: 'A2',
    notes: 'ĐÃ GIAO HÀNG',
    priority: 'Ưu tiên',
    inTime: '07/11/2026 13:38:47',
    carCount: 1,
    waitingPosition: '13m',
  },
  {
    timestamp: '07/11/2026 13:35:51',
    plate: '50H21098',
    vehicleType: 'Xe Tải 8 Tấn',
    callCount: 1,
    dock: 'A3',
    notes: 'ĐÃ GIAO HÀNG',
    priority: 'Ưu tiên',
    inTime: '07/11/2026 13:55:36',
    carCount: 1,
    waitingPosition: '29m',
  },
  {
    timestamp: '07/11/2026 9:47:48',
    plate: '51D72079',
    vehicleType: 'Xe Con, Xe Van',
    callCount: 1,
    dock: 'A2',
    notes: 'ĐÃ GIAO HÀNG',
    priority: 'Ưu tiên',
    inTime: '07/11/2026 14:26:21',
    carCount: 1,
    waitingPosition: '10m',
  },
];

export function loadStoredData(): {
  trucks: Truck[];
  priorityTrucks: Truck[];
  docks: Dock[];
  history: HistoryRowData[];
  config: SyncConfig;
} {
  let trucks = INITIAL_TRUCKS.map((t) => ({ ...t, sourceSheet: 'active' as const }));
  let priorityTrucks: Truck[] = [];
  let docks = INITIAL_DOCKS;
  let history = INITIAL_HISTORY_ROWS;
  const envSheetUrl = (import.meta as any).env?.VITE_GOOGLE_SHEET_URL || '';
  const defaultSheetUrl = envSheetUrl || 'https://docs.google.com/spreadsheets/d/1hfTZphz6FO8lIY8SMum94zgIx_WhEpwg5Oz4DFAGbwk/edit?usp=sharing';

  let config: SyncConfig = {
    mode: 'sheet_direct',
    gasWebAppUrl: '',
    sheetUrl: defaultSheetUrl,
    sheetId: '1hfTZphz6FO8lIY8SMum94zgIx_WhEpwg5Oz4DFAGbwk',
    sheetName: 'Thông Tin Giao Hàng',
    autoSync: true,
    pollIntervalSec: 2,
    lastSyncedAt: new Date(),
    syncStatus: 'idle',
  };

  if (typeof window !== 'undefined') {
    try {
      const storedTrucks = localStorage.getItem(STORAGE_KEY_TRUCKS);
      if (storedTrucks) {
        trucks = JSON.parse(storedTrucks).map((t: Truck) => ({ ...t, sourceSheet: 'active' as const }));
      }

      const storedPriority = localStorage.getItem(STORAGE_KEY_PRIORITY_TRUCKS);
      if (storedPriority) {
        priorityTrucks = JSON.parse(storedPriority).map((t: Truck) => ({
          ...t,
          sourceSheet: 'priority' as const,
        }));
      }

      const storedDocks = localStorage.getItem(STORAGE_KEY_DOCKS);
      if (storedDocks) {
        const parsed = JSON.parse(storedDocks);
        if (Array.isArray(parsed) && parsed.length === INITIAL_DOCKS.length) {
          docks = parsed.map((d: Dock, i: number) => ({
            ...d,
            id: DOCK_DEFINITIONS[i]?.id || formatDockId(d.id),
            group: DOCK_DEFINITIONS[i]?.group || d.group,
          }));
        } else {
          docks = INITIAL_DOCKS;
        }
      }

      const storedHistory = localStorage.getItem(STORAGE_KEY_HISTORY);
      if (storedHistory) history = JSON.parse(storedHistory);

      const storedConfig = localStorage.getItem(STORAGE_KEY_CONFIG);
      if (storedConfig) {
        const parsed = JSON.parse(storedConfig);
        config = { ...config, ...parsed, pollIntervalSec: 2 };
        if (config.gasWebAppUrl) {
          config.mode = 'gas_live';
        } else if (config.sheetUrl || defaultSheetUrl) {
          config.sheetUrl = config.sheetUrl || defaultSheetUrl;
          config.mode = 'sheet_direct';
        }
      }
    } catch (e) {
      console.warn('Error reading from localStorage', e);
    }
  }

  const now = new Date();
  const todayKey = getLocalDateKey(now);
  const isAfter21h = now.getHours() >= 21;
  const storedSessionDate = getStoredSessionDate();
  const storedReset21hDate = getStoredReset21hDate();
  const isNewDay = Boolean(storedSessionDate && storedSessionDate !== todayKey);
  const alreadyResetToday = storedReset21hDate === todayKey;

  if (typeof window !== 'undefined') {
    setStoredSessionDate(todayKey);
    if (isAfter21h) {
      setStoredReset21hDate(todayKey);
    }
  }

  // If past 21:00 or rolled over to a new morning, clear all docked trucks and keep only waiting queue trucks
  const shouldClearDocks = isAfter21h || alreadyResetToday || isNewDay;
  if (shouldClearDocks) {
    trucks = trucks.filter((t) => t.status === 'waiting');
    priorityTrucks = priorityTrucks.filter((t) => t.status === 'waiting');
  }

  // Bind initial dock trucks (only if assigned today before 21:00)
  const dockMap = new Map<number, Dock>();
  docks.forEach((d) => {
    dockMap.set(d.index, {
      ...d,
      currentTruck: null,
      status: d.status === 'maintenance' ? 'maintenance' : 'free',
    });
  });

  if (!shouldClearDocks) {
    [...trucks, ...priorityTrucks].forEach((t) => {
      if (t.dockId !== undefined && t.dockId !== null && (t.status === 'busy' || t.status === 'moving')) {
        const isSinceToday = t.since ? getLocalDateKey(new Date(t.since)) === todayKey : false;
        const isTimestampValidToday = isTodayBeforeCutoff(t.timestamp, now, 21);
        if (!isSinceToday && !isTimestampValidToday) {
          return;
        }
        const d = dockMap.get(t.dockId);
        if (d) {
          d.currentTruck = t;
          d.status = t.status === 'moving' ? 'moving' : 'busy';
          d.since = t.since || Date.now();
        }
      }
    });

    // Also restore today's confirmed trucks from "Lịch sử giao hàng" onto remaining free docks before 21:00
    const allQueuePlates = new Set(
      [...trucks, ...priorityTrucks]
        .filter((t) => !t.assignedDock)
        .map((t) => t.plate.trim().toUpperCase())
    );
    dockMap.forEach((d) => {
      if (d.currentTruck || d.status === 'maintenance') return;
      const todayHistMatches = history.filter((h) => {
        const pIdx = findDockIndexById(h.dock);
        if (pIdx !== d.index) return false;
        return isHistoryEntryTodayBeforeCutoff(h.inTime, h.timestamp, now, 21);
      });
      if (todayHistMatches.length > 0) {
        const recentHist = todayHistMatches.reduce((latest, curr) => {
          const latestTs = (parseSheetDateTime(latest.inTime) || parseSheetDateTime(latest.timestamp))?.getTime() || 0;
          const currTs = (parseSheetDateTime(curr.inTime) || parseSheetDateTime(curr.timestamp))?.getTime() || 0;
          return currTs >= latestTs ? curr : latest;
        });
        if (!allQueuePlates.has(recentHist.plate.trim().toUpperCase())) {
          const histTs = (parseSheetDateTime(recentHist.inTime) || parseSheetDateTime(recentHist.timestamp))?.getTime() || Date.now();
          d.currentTruck = {
            id: `HIST-${recentHist.plate}-${d.index}`,
            plate: recentHist.plate,
            type: mapTypeNameToKey(recentHist.vehicleType),
            supplier: recentHist.notes || '',
            pallets: 10,
            assignedDock: d.id,
            checkInTime: recentHist.inTime || '',
            arrivalTimeMs: histTs,
            status: 'busy',
            since: histTs,
            dockId: d.index,
            callCount: Number(recentHist.callCount) || 1,
            priority: recentHist.priority,
            waitingPosition: recentHist.waitingPosition,
          };
          d.status = 'busy';
          d.since = histTs;
        }
      }
    });
  }

  return {
    trucks,
    priorityTrucks,
    docks: Array.from(dockMap.values()),
    history,
    config,
  };
}

export function saveStoredData(
  trucks: Truck[],
  priorityTrucks: Truck[],
  docks: Dock[],
  history: HistoryRowData[],
  config: SyncConfig
) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY_TRUCKS, JSON.stringify(trucks));
    localStorage.setItem(STORAGE_KEY_PRIORITY_TRUCKS, JSON.stringify(priorityTrucks));
    localStorage.setItem(STORAGE_KEY_DOCKS, JSON.stringify(docks));
    localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(history));
    localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(config));
  } catch (e) {
    console.warn('Error saving to localStorage', e);
  }
}

/**
 * Convert Trucks to Sheet Rows representation matching "Thông Tin Giao Hàng"
 */
export function trucksToSheetRows(trucks: Truck[]): SheetRowData[] {
  return trucks.map((t, i) => ({
    rowId: i + 2,
    timestamp: t.timestamp || new Date().toLocaleString('vi-VN'),
    plate: t.plate,
    vehicleType: VEHICLE_CONFIGS[t.type]?.name || 'Xe Tải 1-5 Tấn',
    callCount: t.callCount ?? '',
    dock: t.assignedDock ? t.assignedDock : '',
    notes: t.notes || '',
    priority: t.priority || '',
    carCount: t.carCount || 1,
    waitingPosition: t.waitingPosition || '15m',
    supplier: t.supplier,
    sourceSheet: t.sourceSheet,
    status:
      t.status === 'busy'
        ? 'Đang dỡ hàng'
        : t.status === 'moving'
        ? 'Đang lùi vào dock'
        : t.status === 'completed'
        ? 'Hoàn tất / Rời kho'
        : 'Chờ ngoài cổng',
  }));
}

function mapGasRowsToTrucks(rows: any[], sourceSheet: 'active' | 'priority'): Truck[] {
  return rows
    .filter((row: any) => row && String(row.plate || '').trim() !== '')
    .map((row: any, idx: number) => {
      const dockStr = String(row.dock || '').replace(/dock/i, '').trim();
      const dockId = findDockIndexById(dockStr);

      let status: 'waiting' | 'moving' | 'busy' | 'completed' = 'waiting';
      if (dockId !== null) {
        status = 'busy';
      }

      const idPrefix = sourceSheet === 'priority' ? 'GAS-PRIO' : 'GAS';
      const plate = String(row.plate || '').trim().toUpperCase();

      return {
        id: `${idPrefix}-${plate || idx + 1}`,
        plate,
        type: mapTypeNameToKey(row.vehicleType),
        supplier: row.supplier || 'NCC',
        pallets: Number(row.carCount) * 5 || 5,
        assignedDock: dockId !== null ? DOCK_DEFINITIONS[dockId].id : null,
        dockId,
        checkInTime: row.timestamp ? String(row.timestamp).slice(-8, -3) : '09:00',
        arrivalTimeMs: Date.now() - (idx * 5 + 5) * 60 * 1000,
        status,
        spot: status === 'waiting' ? idx : null,
        notes: row.notes || '',
        timestamp: row.timestamp || '',
        callCount: Number(row.callCount) || undefined,
        priority: row.priority || (sourceSheet === 'priority' ? 'Ưu tiên' : ''),
        carCount:
          row.carCount === '' || row.carCount === null || row.carCount === undefined
            ? 1
            : Number(row.carCount) || 0,
        waitingPosition: row.waitingPosition || '15m',
        sheetRowIndex: row.rowIndex || idx + 2,
        sourceSheet,
      };
    });
}

/**
 * Extract Sheet ID from a Google Sheet URL
 */
export function extractSheetId(urlOrId: string): string {
  if (!urlOrId) return '';
  const match = urlOrId.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : urlOrId.trim();
}

/**
 * Fetch data directly from a public Google Sheet URL using gviz
 */
export async function fetchFromGoogleSheetUrl(
  urlOrId: string,
  sheetName?: string
): Promise<{
  trucks: Truck[];
  priorityTrucks: Truck[];
  history: HistoryRowData[];
  hasPrioritySupport: boolean;
}> {
  const cleanUrl = urlOrId.trim();
  if (!cleanUrl) {
    throw new Error('Vui lòng nhập đường link Google Sheet');
  }

  const sheetId = extractSheetId(cleanUrl);
  if (!sheetId) {
    throw new Error('Không thể xác định Sheet ID từ đường dẫn Google Sheet');
  }

  const proxyParams = new URLSearchParams({
    url: `https://docs.google.com/spreadsheets/d/${sheetId}/edit`,
  });
  if (sheetName) {
    proxyParams.set('sheetName', sheetName);
  }

  const proxyUrl = `/api/gas-proxy?${proxyParams.toString()}`;
  const res = await fetch(proxyUrl);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }

  if (data.status === 'error' && data.errors && data.errors.length > 0) {
    throw new Error(`Google Sheet báo lỗi: ${data.errors[0].message || data.errors[0].detailed_message}`);
  }

  const table = data.table;
  if (!table || !Array.isArray(table.rows)) {
    throw new Error('Không đọc được bảng dữ liệu từ Google Sheet. Hãy kiểm tra quyền chia sẻ công khai.');
  }

  const cols = table.cols || [];
  const rows = table.rows || [];

  // Determine headers: check table.cols or row 0
  let headerRowIndex = -1;
  const colNames: string[] = cols.map((c: any) => String(c?.label || '').trim());

  if (rows.length > 0) {
    const firstRowValues = (rows[0].c || []).map((cell: any) => String(cell?.v || '').trim().toLowerCase());
    const hasHeaderKeywords = firstRowValues.some((v: string) =>
      v.includes('biển') || v.includes('xe') || v.includes('cửa') || v.includes('dock') || v.includes('thời gian') || v.includes('time')
    );
    if (hasHeaderKeywords) {
      headerRowIndex = 0;
      for (let i = 0; i < firstRowValues.length; i++) {
        if (!colNames[i]) colNames[i] = firstRowValues[i];
      }
    }
  }

  const findColIndex = (pattern: RegExp, defaultIdx: number): number => {
    const found = colNames.findIndex((name) => pattern.test(name.toLowerCase()));
    return found !== -1 ? found : defaultIdx;
  };

  const idxTimestamp = findColIndex(/thời gian|time|timestamp|ngày|ngay|giờ|gio/, 0);
  const idxPlate = findColIndex(/biển|bien|plate|số xe|so xe/, 1);
  const idxType = findColIndex(/loại xe|loai xe|type/, 2);
  const idxCallCount = findColIndex(/số lần gọi|so lan goi|gọi|call/, 3);
  const idxDock = findColIndex(/cửa|cua|dock|gate/, 4);
  const idxNotes = findColIndex(/ghi chú|ghi chu|note/, 5);
  const idxPriority = findColIndex(/ưu tiên|uu tien|priority/, 6);
  const idxCarCount = findColIndex(/sl|số lượng|so luong|pallet/, 7);
  const idxPosition = findColIndex(/vị trí|vi tri|position/, 8);

  const dataRows = headerRowIndex === 0 ? rows.slice(1) : rows;

  const trucks: Truck[] = [];
  const priorityTrucks: Truck[] = [];

  dataRows.forEach((r: any, rowIdx: number) => {
    const c = r.c || [];
    const getVal = (idx: number) => {
      if (!c[idx] || c[idx].v === null || c[idx].v === undefined) return '';
      if (c[idx].f) return String(c[idx].f).trim();
      const val = String(c[idx].v).trim();
      const dateMatch = val.match(/Date\((\d+),(\d+),(\d+)(?:,(\d+),(\d+),(\d+))?\)/);
      if (dateMatch) {
        const [, y, m, d, hh = '0', mm = '0', ss = '0'] = dateMatch;
        return `${String(d).padStart(2, '0')}/${String(Number(m) + 1).padStart(2, '0')}/${y} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
      }
      return val;
    };

    const plate = getVal(idxPlate).toUpperCase();
    if (!plate) return;

    const timestamp = getVal(idxTimestamp);
    const vehicleTypeStr = getVal(idxType);
    const callCountVal = Number(getVal(idxCallCount)) || 0;
    const dockStr = getVal(idxDock);
    const notes = getVal(idxNotes);
    const priority = getVal(idxPriority);
    const carCount = Number(getVal(idxCarCount)) || 1;
    const waitingPosition = getVal(idxPosition) || '15m';

    const dockId = findDockIndexById(dockStr);
    const status: 'waiting' | 'moving' | 'busy' | 'completed' = dockId !== null ? 'busy' : 'waiting';

    const isPriority = priority.toLowerCase().includes('ưu tiên') || priority.toLowerCase().includes('priority') || notes.toLowerCase().includes('ưu tiên');

    const truckItem: Truck = {
      id: `${isPriority ? 'GSH-PRIO' : 'GSH'}-${plate || rowIdx + 1}`,
      plate,
      type: mapTypeNameToKey(vehicleTypeStr),
      supplier: 'NCC',
      pallets: carCount * 5 || 5,
      assignedDock: dockId !== null ? DOCK_DEFINITIONS[dockId].id : null,
      dockId,
      checkInTime: timestamp ? timestamp.slice(-8, -3) : '09:00',
      arrivalTimeMs: Date.now() - (rowIdx * 5 + 5) * 60 * 1000,
      status,
      spot: status === 'waiting' ? (isPriority ? priorityTrucks.filter(t => t.status === 'waiting').length : trucks.filter(t => t.status === 'waiting').length) : null,
      notes,
      timestamp,
      callCount: callCountVal || undefined,
      priority: priority || (isPriority ? 'Ưu tiên' : ''),
      carCount,
      waitingPosition,
      sheetRowIndex: headerRowIndex === 0 ? rowIdx + 2 : rowIdx + 1,
      sourceSheet: isPriority ? 'priority' : 'active',
    };

    if (isPriority) {
      priorityTrucks.push(truckItem);
    } else {
      trucks.push(truckItem);
    }
  });

  return { trucks, priorityTrucks, history: [], hasPrioritySupport: true };
}

/**
 * Fetch data from Google Apps Script Web App
 * Uses server-side /api/gas-proxy to prevent browser CORS and Google 302 redirect errors
 */
export async function fetchFromGasWebApp(
  url: string
): Promise<{
  trucks: Truck[];
  priorityTrucks: Truck[];
  history: HistoryRowData[];
  hasPrioritySupport: boolean;
}> {
  const cleanUrl = url.trim();
  if (!cleanUrl) {
    throw new Error('Vui lòng nhập URL Web App của Google Apps Script');
  }

  const targetUrl = cleanUrl.includes('?') ? `${cleanUrl}&action=getDockData` : `${cleanUrl}?action=getDockData`;

  let data: any = null;

  // Try via server proxy first
  try {
    const proxyRes = await fetch(`/api/gas-proxy?url=${encodeURIComponent(targetUrl)}`);
    const proxyJson = await proxyRes.json();
    if (!proxyRes.ok) {
      throw new Error(proxyJson.error || `HTTP ${proxyRes.status}`);
    }
    data = proxyJson;
  } catch (proxyErr: any) {
    // If it's a specific informative error from proxy, re-throw it
    if (proxyErr.message && (proxyErr.message.includes('Apps Script') || proxyErr.message.includes('đăng nhập'))) {
      throw proxyErr;
    }

    // Direct fallback
    try {
      const directRes = await fetch(targetUrl, { mode: 'cors', redirect: 'follow' });
      if (!directRes.ok) throw new Error(`HTTP ${directRes.status}: ${directRes.statusText}`);
      data = await directRes.json();
    } catch {
      throw new Error(
        'Không thể kết nối với Google Apps Script Web App. Vui lòng đảm bảo khi Triển khai (Deploy), bạn đã chọn "Người có quyền truy cập: Bất kỳ ai (Anyone)" và URL kết thúc bằng /exec.'
      );
    }
  }

  if (!data || !data.trucks || !Array.isArray(data.trucks)) {
    throw new Error('Dữ liệu trả về từ Apps Script không đúng cấu trúc (thiếu danh sách trucks)');
  }

  const activeRaw = data.trucks.filter(
    (r: any) => r && r.sourceSheet !== 'priority'
  );
  const inlinePriorityRaw = data.trucks.filter(
    (r: any) => r && r.sourceSheet === 'priority'
  );

  const hasPriorityKey =
    Array.isArray(data.priorityTrucks) ||
    Array.isArray(data.priority) ||
    Array.isArray(data.priorityList) ||
    Array.isArray(data.uuTien) ||
    Array.isArray(data.uuTienTrucks) ||
    Array.isArray(data.uutien) ||
    Array.isArray(data.priority_trucks) ||
    inlinePriorityRaw.length > 0;

  const rawPriorityRows = Array.isArray(data.priorityTrucks)
    ? data.priorityTrucks
    : Array.isArray(data.priority)
    ? data.priority
    : Array.isArray(data.priorityList)
    ? data.priorityList
    : Array.isArray(data.uuTien)
    ? data.uuTien
    : Array.isArray(data.uuTienTrucks)
    ? data.uuTienTrucks
    : Array.isArray(data.uutien)
    ? data.uutien
    : Array.isArray(data.priority_trucks)
    ? data.priority_trucks
    : [];

  const trucks = mapGasRowsToTrucks(activeRaw, 'active');
  const priorityTrucks = mapGasRowsToTrucks(
    [...rawPriorityRows, ...inlinePriorityRaw],
    'priority'
  );

  const history: HistoryRowData[] = Array.isArray(data.history) ? data.history : [];

  return { trucks, priorityTrucks, history, hasPrioritySupport: hasPriorityKey };
}

/**
 * Send truck call event to Google Apps Script
 */
export async function callTruckViaGas(url: string, plate: string, dock: string) {
  if (!url) return;
  try {
    await fetch('/api/gas-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        data: { action: 'callTruck', plate, dock },
      }),
    });
  } catch (e) {
    console.warn('Call truck GAS sync failed', e);
  }
}

/**
 * Send confirm arrival / completion event to Google Apps Script
 */
export async function confirmArrivalViaGas(url: string, plate: string) {
  if (!url) return;
  try {
    await fetch('/api/gas-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        data: { action: 'confirmArrival', plate },
      }),
    });
  } catch (e) {
    console.warn('Confirm arrival GAS sync failed', e);
  }
}

