export type VehicleTypeKey = 'small' | 'van' | 'big' | 'cont';

export interface VehicleTypeConfig {
  key: VehicleTypeKey;
  name: string;
  width: number;
  lengthBody: number;
  heightBody: number;
  lengthCab: number;
  heightCab: number;
  color: string;
  defaultPallets: number;
  unloadingRateSecPerPallet: number;
}

export type TruckStatus = 'waiting' | 'moving' | 'busy' | 'completed';

export interface Truck {
  id: string; // e.g. "TRK-101"
  plate: string; // Biển số xe e.g. "50H59561"
  type: VehicleTypeKey; // Loại xe
  supplier: string; // Nhà cung cấp / Đơn vị giao hàng
  pallets: number; // Số lượng pallet / kiện hàng
  assignedDock: string | null; // Cửa dock chỉ định (e.g. "A11", "A2", "B3") hoặc null nếu chờ ngoài cổng
  checkInTime: string; // Thời gian vào cổng (e.g. "08:30" hoặc HH:mm)
  arrivalTimeMs: number; // Timestamp lúc vào hàng đợi
  status: TruckStatus;
  spot?: number | null; // Vị trí trong bãi chờ 0-11
  dockId?: number | null; // Index của dock 0-15
  unloadedPallets?: number;
  since?: number; // Thời điểm bắt đầu dỡ hàng
  notes?: string;
  sheetRowIndex?: number; // Vị trí dòng trong Google Sheet
  
  // Các cột thực tế theo Google Sheet người dùng
  timestamp?: string; // Dấu thời gian đăng ký (e.g. "07/11/2026 14:03:48")
  callCount?: number; // Số lần gọi (1, 2, 3...)
  priority?: string; // Ưu tiên (e.g. "Ưu tiên")
  carCount?: number; // Sl Xe (e.g. 1, 2, 3)
  waitingPosition?: string; // Vị Trí (e.g. "15m", "10m", "24m")
  inTime?: string; // intime khi chuyển qua Lịch sử giao hàng
  sourceSheet?: 'active' | 'priority'; // Nguồn sheet: "Thông Tin Giao Hàng" hoặc "Ưu Tiên"
}

export type DockStatus = 'free' | 'moving' | 'busy' | 'maintenance';

export interface Dock {
  index: number; // 0 to 15
  id: string; // "A1" to "A12", "B1" to "B4"
  group: 'A' | 'B';
  cx: number;
  status: DockStatus;
  currentTruck: Truck | null;
  since: number; // Timestamp khi xe vào trạng thái hiện tại
}

export interface SheetRowData {
  rowId: number;
  timestamp: string;
  plate: string;
  vehicleType: string;
  callCount: number | string;
  dock: string;
  notes: string;
  priority: string;
  carCount: number;
  waitingPosition: string;
  inTime?: string;
  supplier?: string;
  status?: string;
  sourceSheet?: 'active' | 'priority';
}

export interface HistoryRowData {
  timestamp: string;
  plate: string;
  vehicleType: string;
  callCount: number;
  dock: string;
  notes: string;
  priority: string;
  inTime: string;
  carCount: number;
  waitingPosition: string;
}

export interface SyncConfig {
  mode: 'simulator' | 'gas_live' | 'sheet_direct';
  gasWebAppUrl: string;
  sheetUrl?: string;
  sheetId: string;
  sheetName: string;
  autoSync: boolean;
  pollIntervalSec: number;
  lastSyncedAt: Date | null;
  syncStatus: 'idle' | 'syncing' | 'connected' | 'error';
  errorMessage?: string;
}
