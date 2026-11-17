import React, { useState } from 'react';
import { Truck, SyncConfig, SheetRowData, HistoryRowData } from '../types';
import { trucksToSheetRows, DOCK_DEFINITIONS } from '../services/sheetService';
import { APPS_SCRIPT_CODE_GS, APPS_SCRIPT_INDEX_HTML } from '../utils/appsScriptCode';
import {
  X,
  Copy,
  Check,
  RefreshCw,
  FileSpreadsheet,
  Code2,
  BookOpen,
  Trash2,
  CheckCircle,
  PhoneCall,
  History,
  ArrowRightCircle,
  Zap,
  Plus,
  SkipForward,
  AlertTriangle,
} from 'lucide-react';

interface SheetManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  trucks: Truck[];
  priorityTrucks: Truck[];
  historyRows: HistoryRowData[];
  config: SyncConfig;
  gasHasPrioritySupport?: boolean | null;
  onUpdateConfig: (cfg: SyncConfig) => void;
  onUpdateTruckFromRow: (row: SheetRowData) => void;
  onDeleteTruckRow: (plate: string, sourceSheet?: 'active' | 'priority') => void;
  onCallTruckQuick: (plate: string, dockId: string, sourceSheet?: 'active' | 'priority') => void;
  onSkipTruckQuick: (plate: string, sourceSheet?: 'active' | 'priority') => void;
  onMoveToPriorityQuick?: (plate: string) => void;
  onAddPriorityTruckQuick: (plate: string, typeKey: 'small' | 'van' | 'big' | 'cont', dockId?: string) => void;
  onConfirmArrivalToHistory: (plate: string) => void;
  onResetSampleData: () => void;
  onSyncGasNow: () => Promise<void>;
}

export const SheetManagerModal: React.FC<SheetManagerModalProps> = ({
  isOpen,
  onClose,
  trucks,
  priorityTrucks,
  historyRows,
  config,
  gasHasPrioritySupport,
  onUpdateConfig,
  onUpdateTruckFromRow,
  onDeleteTruckRow,
  onCallTruckQuick,
  onSkipTruckQuick,
  onMoveToPriorityQuick,
  onAddPriorityTruckQuick,
  onConfirmArrivalToHistory,
  onResetSampleData,
  onSyncGasNow,
}) => {
  const [activeTab, setActiveTab] = useState<'sheet_active' | 'sheet_priority' | 'sheet_history' | 'gas_code' | 'guide'>('sheet_active');
  const [copiedGs, setCopiedGs] = useState(false);
  const [copiedHtml, setCopiedHtml] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);
  const [newPrioPlate, setNewPrioPlate] = useState('');
  const [newPrioType, setNewPrioType] = useState<'small' | 'van' | 'big' | 'cont'>('small');
  const [newPrioDock, setNewPrioDock] = useState('');

  if (!isOpen) return null;

  const activeRows = trucksToSheetRows(trucks);
  const priorityRows = trucksToSheetRows(priorityTrucks);

  const handleCopyGs = () => {
    navigator.clipboard.writeText(APPS_SCRIPT_CODE_GS);
    setCopiedGs(true);
    setTimeout(() => setCopiedGs(false), 2000);
  };

  const handleCopyHtml = () => {
    navigator.clipboard.writeText(APPS_SCRIPT_INDEX_HTML);
    setCopiedHtml(true);
    setTimeout(() => setCopiedHtml(false), 2000);
  };

  const handleSyncClick = async () => {
    setIsSyncing(true);
    setSyncFeedback(null);
    try {
      if (config.mode === 'simulator') {
        if (config.sheetUrl) {
          onUpdateConfig({ ...config, mode: 'sheet_direct', autoSync: true });
        } else if (config.gasWebAppUrl) {
          onUpdateConfig({ ...config, mode: 'gas_live', autoSync: true });
        }
      }
      await onSyncGasNow();
      setSyncFeedback('Đồng bộ thành công dữ liệu từ Google Sheets!');
    } catch (err: any) {
      setSyncFeedback(`Lỗi: ${err.message || 'Không thể kết nối'}`);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-6xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Top Bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 rounded-lg">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold font-display text-slate-900 dark:text-slate-100">
                Google Sheets & Google Apps Script
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Ba bảng dữ liệu liên kết: <b>Thông Tin Giao Hàng</b>, <b>Ưu Tiên</b> &amp; <b>Lịch sử giao hàng</b>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 px-6 pt-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto">
          <button
            onClick={() => setActiveTab('sheet_active')}
            className={`flex items-center gap-2 pb-3 px-3 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'sheet_active'
                ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            Sheet: Thông Tin Giao Hàng ({activeRows.length} xe)
          </button>

          <button
            onClick={() => setActiveTab('sheet_priority')}
            className={`flex items-center gap-2 pb-3 px-3 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'sheet_priority'
                ? 'border-amber-600 text-amber-600 dark:text-amber-400'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Zap className="w-4 h-4" />
            Sheet: Ưu Tiên ({priorityRows.length} xe)
          </button>

          <button
            onClick={() => setActiveTab('sheet_history')}
            className={`flex items-center gap-2 pb-3 px-3 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'sheet_history'
                ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <History className="w-4 h-4" />
            Sheet: Lịch sử giao hàng ({historyRows.length} lượt)
          </button>

          <button
            onClick={() => setActiveTab('gas_code')}
            className={`flex items-center gap-2 pb-3 px-3 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'gas_code'
                ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Code2 className="w-4 h-4" />
            Mã nguồn Apps Script (Code.gs & Index.html)
          </button>

          <button
            onClick={() => setActiveTab('guide')}
            className={`flex items-center gap-2 pb-3 px-3 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'guide'
                ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            Hướng dẫn cài đặt
          </button>
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TAB 1: THÔNG TIN GIAO HÀNG */}
          {activeTab === 'sheet_active' && (
            <div className="space-y-4">
              {/* Settings / Controls Bar */}
              <div className="p-4 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Chế độ kết nối:
                    </span>
                    <div className="flex bg-slate-200 dark:bg-slate-700 p-0.5 rounded-lg text-xs font-medium">
                      <button
                        onClick={() => onUpdateConfig({ ...config, mode: 'sheet_direct' })}
                        className={`px-3 py-1 rounded-md transition-colors ${
                          config.mode === 'sheet_direct'
                            ? 'bg-purple-600 text-white shadow-xs font-semibold'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                        }`}
                      >
                        Đọc trực tiếp link Google Sheet
                      </button>
                      <button
                        onClick={() => onUpdateConfig({ ...config, mode: 'gas_live' })}
                        className={`px-3 py-1 rounded-md transition-colors ${
                          config.mode === 'gas_live'
                            ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs font-semibold'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                        }`}
                      >
                        Web App Apps Script
                      </button>
                      <button
                        onClick={() => onUpdateConfig({ ...config, mode: 'simulator' })}
                        className={`px-3 py-1 rounded-md transition-colors ${
                          config.mode === 'simulator'
                            ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs font-semibold'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                        }`}
                      >
                        Mô phỏng Sheet cục bộ
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={onResetSampleData}
                      className="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors"
                    >
                      Dữ liệu mẫu ban đầu
                    </button>
                    <button
                      onClick={handleSyncClick}
                      disabled={isSyncing}
                      className="px-3 py-1.5 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 rounded-lg flex items-center gap-1.5 transition-colors shadow-xs"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                      Đồng bộ Sheet
                    </button>
                  </div>
                </div>

                {config.mode === 'sheet_direct' && (
                  <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Đường link Google Sheet (URL):
                      </label>
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                        config.syncStatus === 'connected'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
                          : config.syncStatus === 'error'
                          ? 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400'
                          : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                      }`}>
                        {config.syncStatus === 'connected'
                          ? '● Đang đồng bộ thời gian thực'
                          : config.syncStatus === 'error'
                          ? '● Lỗi kết nối'
                          : '○ Chưa kết nối'}
                      </span>
                    </div>

                    <div className="flex gap-2">
                      <input
                        type="url"
                        value={config.sheetUrl || ''}
                        onChange={(e) =>
                          onUpdateConfig({ ...config, sheetUrl: e.target.value })
                        }
                        placeholder="https://docs.google.com/spreadsheets/d/.../edit?usp=sharing"
                        className="flex-1 px-3 py-1.5 text-xs font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-purple-500"
                      />
                      <button
                        onClick={handleSyncClick}
                        disabled={isSyncing || !config.sheetUrl}
                        className="px-3 py-1.5 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 rounded-lg flex items-center gap-1.5 transition-colors shrink-0"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                        {isSyncing ? 'Đang kết nối...' : 'Kiểm tra & Kết nối'}
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      💡 Mẹo: Bảng tính chỉ cần được bật quyền <b>"Bất kỳ ai có đường liên kết đều có thể xem"</b> (nút Chia sẻ trên Google Sheet). Code sẽ tự động phân tích và kéo dữ liệu xe vào dock.
                    </p>
                  </div>
                )}

                {config.mode === 'gas_live' && (
                  <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                        URL Web App Google Apps Script (doGet):
                      </label>
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                        config.syncStatus === 'connected'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
                          : config.syncStatus === 'error'
                          ? 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400'
                          : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                      }`}>
                        {config.syncStatus === 'connected'
                          ? '● Đang đồng bộ thời gian thực'
                          : config.syncStatus === 'error'
                          ? '● Lỗi kết nối'
                          : '○ Chưa kết nối'}
                      </span>
                    </div>

                    <div className="flex gap-2">
                      <input
                        type="url"
                        value={config.gasWebAppUrl}
                        onChange={(e) =>
                          onUpdateConfig({ ...config, gasWebAppUrl: e.target.value })
                        }
                        placeholder="VD: https://script.google.com/macros/s/AKfycb.../exec"
                        className="flex-1 px-3 py-1.5 text-xs font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-purple-500"
                      />
                      <button
                        onClick={handleSyncClick}
                        disabled={isSyncing || !config.gasWebAppUrl}
                        className="px-3 py-1.5 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 rounded-lg flex items-center gap-1.5 transition-colors shrink-0"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                        {isSyncing ? 'Đang kết nối...' : 'Kiểm tra & Kết nối'}
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      💡 Mẹo: URL này được tạo tự động khi bạn bấm <b>Triển khai &rarr; Triển khai mới &rarr; Ứng dụng web</b> trong Apps Script của file Sheet.
                    </p>
                    {gasHasPrioritySupport === false && (
                      <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs space-y-1">
                        <div className="flex items-center justify-between gap-2 font-bold">
                          <span className="flex items-center gap-1.5">
                            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                            Web App GAS hiện tại chưa trả về dữ liệu của sheet &ldquo;Ưu Tiên&rdquo;
                          </span>
                          <button
                            onClick={() => setActiveTab('gas_code')}
                            className="px-2.5 py-1 text-[11px] font-semibold bg-amber-600 hover:bg-amber-700 text-white rounded-md shrink-0"
                          >
                            Xem Code.gs mới
                          </button>
                        </div>
                        <p className="text-[11px] leading-relaxed">
                          Khi xe được chuyển sang sheet <b>Ưu Tiên</b>, Web App GAS cũ không đọc sheet này nên xe sẽ bị mất khỏi màn hình. Hãy cập nhật <code>Code.gs</code> từ tab <b>Mã nguồn Apps Script</b> rồi vào Apps Script chọn <b>Triển khai &rarr; Quản lý bản triển khai &rarr; Sửa &rarr; Chọn &ldquo;Phiên bản mới&rdquo; &rarr; Triển khai</b>.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {syncFeedback && (
                  <div className={`text-xs p-2 rounded-lg flex items-center gap-1.5 ${
                    syncFeedback.includes('Lỗi')
                      ? 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300'
                      : 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300'
                  }`}>
                    <CheckCircle className="w-4 h-4 shrink-0" />
                    <span>{syncFeedback}</span>
                  </div>
                )}
              </div>

              {/* Table View */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900 shadow-xs">
                <div className="px-4 py-2.5 bg-[#3b1d5e] text-white flex items-center justify-between text-xs font-bold">
                  <span>BẢNG: Thông Tin Giao Hàng</span>
                  <span className="font-normal opacity-90 text-[11px]">
                    Nơi ghi nhận đăng ký xe & gọi vào cửa dock
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-100 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="py-2.5 px-3">Dấu thời gian</th>
                        <th className="py-2.5 px-3">Biển Số Xe</th>
                        <th className="py-2.5 px-3">Loại Xe</th>
                        <th className="py-2.5 px-3 text-center">Số lần gọi</th>
                        <th className="py-2.5 px-3 text-center">cửa</th>
                        <th className="py-2.5 px-3">ghi chú</th>
                        <th className="py-2.5 px-3 text-center">ưu tiên</th>
                        <th className="py-2.5 px-3 text-center">Sl Xe</th>
                        <th className="py-2.5 px-3 text-center">Vị Trí</th>
                        <th className="py-2.5 px-3 text-right">Thao tác điều phối</th>
                        <th className="py-2.5 px-2 w-8 text-center"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-normal">
                      {activeRows.map((row) => (
                        <tr
                          key={row.rowId}
                          className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors"
                        >
                          <td className="py-2 px-3 text-slate-500 font-mono text-[11px]">
                            {row.timestamp}
                          </td>
                          <td className="py-2 px-3 font-mono font-bold text-slate-900 dark:text-slate-100">
                            {row.plate}
                          </td>
                          <td className="py-2 px-3">
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 font-medium">
                              {row.vehicleType}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-center font-mono font-bold text-purple-600 dark:text-purple-400">
                            {row.callCount || '—'}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <select
                              value={row.dock}
                              onChange={(e) =>
                                onUpdateTruckFromRow({ ...row, dock: e.target.value })
                              }
                              className="bg-transparent border border-slate-200 dark:border-slate-700 rounded px-1.5 py-0.5 font-mono font-bold text-purple-700 dark:text-purple-300"
                            >
                              <option value="">(Chờ ngoài)</option>
                              {DOCK_DEFINITIONS.map((d) => (
                                <option key={d.id} value={d.id}>
                                  {d.id}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-2 px-3 text-slate-600 dark:text-slate-400">
                            <input
                              type="text"
                              value={row.notes}
                              onChange={(e) =>
                                onUpdateTruckFromRow({ ...row, notes: e.target.value })
                              }
                              className="bg-transparent border-0 focus:ring-1 focus:ring-purple-500 rounded p-1 w-full"
                              placeholder="Ghi chú..."
                            />
                          </td>
                          <td className="py-2 px-3 text-center">
                            {row.priority ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400">
                                {row.priority}
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="py-2 px-3 text-center font-mono font-semibold">
                            {row.carCount}
                          </td>
                          <td className="py-2 px-3 text-center font-mono text-slate-600 dark:text-slate-400">
                            {row.waitingPosition}
                          </td>
                          <td className="py-2 px-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Quick Call Button */}
                              <button
                                onClick={() => {
                                  const dock = row.dock || 'A1';
                                  onCallTruckQuick(row.plate, dock, 'active');
                                }}
                                className="px-2 py-1 text-[11px] font-semibold bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/50 dark:hover:bg-purple-900/50 text-purple-700 dark:text-purple-300 rounded border border-purple-200 dark:border-purple-800 flex items-center gap-1"
                                title="Gọi xe vào dock và tăng số lần gọi"
                              >
                                <PhoneCall className="w-3 h-3" />
                                Gọi vào {row.dock || 'Dock'}
                              </button>

                              {row.dock && (
                                <button
                                  onClick={() => onSkipTruckQuick(row.plate, 'active')}
                                  className="px-2 py-1 text-[11px] font-semibold bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/50 dark:hover:bg-amber-900/50 text-amber-700 dark:text-amber-300 rounded border border-amber-200 dark:border-amber-800 flex items-center gap-1"
                                  title="Bỏ qua lượt gọi, đưa xe về cuối hàng đợi"
                                >
                                  <SkipForward className="w-3 h-3" />
                                  Bỏ qua
                                </button>
                              )}

                              {config.mode === 'simulator' && onMoveToPriorityQuick && (
                                <button
                                  onClick={() => onMoveToPriorityQuick(row.plate)}
                                  className="px-2 py-1 text-[11px] font-semibold bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/50 dark:hover:bg-amber-900/50 text-amber-700 dark:text-amber-300 rounded border border-amber-200 dark:border-amber-800 flex items-center gap-1"
                                  title="Chuyển xe sang sheet Ưu Tiên"
                                >
                                  <Zap className="w-3 h-3" />
                                  Ưu tiên
                                </button>
                              )}

                              {/* Confirm Arrival / Move to History */}
                              <button
                                onClick={() => onConfirmArrivalToHistory(row.plate)}
                                className="px-2 py-1 text-[11px] font-semibold bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:hover:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 rounded border border-emerald-200 dark:border-emerald-800 flex items-center gap-1"
                                title="Xác nhận đã đến cửa & chuyển qua sheet Lịch sử giao hàng"
                              >
                                <ArrowRightCircle className="w-3 h-3" />
                                Xác nhận đến cửa
                              </button>
                            </div>
                          </td>
                          <td className="py-2 px-2 text-center">
                            <button
                              onClick={() => onDeleteTruckRow(row.plate, 'active')}
                              className="p-1 text-slate-400 hover:text-red-500 transition-colors"
                              title="Xóa dòng này"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: SHEET ƯU TIÊN */}
          {activeTab === 'sheet_priority' && (
            <div className="space-y-4">
              {config.mode === 'gas_live' && gasHasPrioritySupport === false && (
                <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs space-y-1.5">
                  <div className="flex items-center justify-between gap-2 font-bold">
                    <span className="flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                      Web App GAS đang kết nối chưa có trường priorityTrucks cho sheet &ldquo;Ưu Tiên&rdquo;
                    </span>
                    <button
                      onClick={() => setActiveTab('gas_code')}
                      className="px-2.5 py-1 text-[11px] font-semibold bg-amber-600 hover:bg-amber-700 text-white rounded-md shrink-0"
                    >
                      Mở Code.gs để cập nhật
                    </button>
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    Nếu bạn chuyển xe sang sheet <b>Ưu Tiên</b> trên Google Sheets nhưng chưa cập nhật &amp; phát hành <b>Phiên bản mới</b> trong Google Apps Script, màn hình sẽ không nhận được dòng xe đó sau khi chuyển sheet. Hãy dán <code>Code.gs</code> mới và chọn <b>Triển khai &rarr; Quản lý bản triển khai &rarr; Sửa &rarr; Phiên bản mới</b>.
                  </p>
                </div>
              )}

              {config.mode === 'simulator' && (
                <div className="p-4 bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-xl flex flex-wrap items-end gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-amber-900 dark:text-amber-200 mb-1">
                      Biển số xe ưu tiên
                    </label>
                    <input
                      type="text"
                      value={newPrioPlate}
                      onChange={(e) => setNewPrioPlate(e.target.value.toUpperCase())}
                      placeholder="VD: 51D88899"
                      className="px-3 py-1.5 text-xs font-mono bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-800 rounded-lg text-slate-900 dark:text-slate-100 w-36"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-amber-900 dark:text-amber-200 mb-1">
                      Loại xe
                    </label>
                    <select
                      value={newPrioType}
                      onChange={(e) => setNewPrioType(e.target.value as 'small' | 'van' | 'big' | 'cont')}
                      className="px-2.5 py-1.5 text-xs bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-800 rounded-lg text-slate-900 dark:text-slate-100"
                    >
                      <option value="small">Xe Tải 1-5 Tấn</option>
                      <option value="van">Xe Con, Xe Van</option>
                      <option value="big">Xe Tải 8 Tấn</option>
                      <option value="cont">Xe Tải 15 Tấn</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-amber-900 dark:text-amber-200 mb-1">
                      Gọi ngay vào cửa (tuỳ chọn)
                    </label>
                    <select
                      value={newPrioDock}
                      onChange={(e) => setNewPrioDock(e.target.value)}
                      className="px-2.5 py-1.5 text-xs bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-800 rounded-lg text-slate-900 dark:text-slate-100"
                    >
                      <option value="">(Chưa gọi)</option>
                      {DOCK_DEFINITIONS.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.id}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={() => {
                      const plate = newPrioPlate.trim() || `51D${Math.floor(10000 + Math.random() * 89999)}`;
                      onAddPriorityTruckQuick(plate, newPrioType, newPrioDock || undefined);
                      setNewPrioPlate('');
                    }}
                    className="px-3.5 py-1.5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg flex items-center gap-1.5 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Thêm vào sheet Ưu Tiên
                  </button>
                </div>
              )}

              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900 shadow-xs">
                <div className="px-4 py-2.5 bg-amber-700 text-white flex items-center justify-between text-xs font-bold">
                  <span>BẢNG: Ưu Tiên</span>
                  <span className="font-normal opacity-90 text-[11px]">
                    Gọi xe giao hàng ưu tiên mà không xáo trộn hàng đợi trước đó; nếu bỏ qua sẽ chuyển xuống cuối hàng đợi
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-100 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="py-2.5 px-3">Dấu thời gian</th>
                        <th className="py-2.5 px-3">Biển Số Xe</th>
                        <th className="py-2.5 px-3">Loại Xe</th>
                        <th className="py-2.5 px-3 text-center">Số lần gọi</th>
                        <th className="py-2.5 px-3 text-center">cửa</th>
                        <th className="py-2.5 px-3">ghi chú</th>
                        <th className="py-2.5 px-3 text-center">ưu tiên</th>
                        <th className="py-2.5 px-3 text-center">Sl Xe</th>
                        <th className="py-2.5 px-3 text-center">Vị Trí</th>
                        <th className="py-2.5 px-3 text-right">Thao tác điều phối</th>
                        <th className="py-2.5 px-2 w-8 text-center"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-normal">
                      {priorityRows.length === 0 ? (
                        <tr>
                          <td colSpan={11} className="py-8 text-center text-slate-400 text-xs">
                            Chưa có xe nào trong sheet <b>Ưu Tiên</b>.
                          </td>
                        </tr>
                      ) : (
                        priorityRows.map((row) => (
                          <tr
                            key={`prio-${row.rowId}-${row.plate}`}
                            className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors"
                          >
                            <td className="py-2 px-3 text-slate-500 font-mono text-[11px]">
                              {row.timestamp}
                            </td>
                            <td className="py-2 px-3 font-mono font-bold text-slate-900 dark:text-slate-100">
                              {row.plate}
                            </td>
                            <td className="py-2 px-3">
                              <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 font-medium">
                                {row.vehicleType}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-center font-mono font-bold text-amber-600 dark:text-amber-400">
                              {row.callCount || '—'}
                            </td>
                            <td className="py-2 px-3 text-center">
                              <select
                                value={row.dock}
                                onChange={(e) =>
                                  onUpdateTruckFromRow({ ...row, dock: e.target.value, sourceSheet: 'priority' })
                                }
                                className="bg-transparent border border-slate-200 dark:border-slate-700 rounded px-1.5 py-0.5 font-mono font-bold text-amber-700 dark:text-amber-300"
                              >
                                <option value="">(Chờ ngoài)</option>
                                {DOCK_DEFINITIONS.map((d) => (
                                  <option key={d.id} value={d.id}>
                                    {d.id}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="py-2 px-3 text-slate-600 dark:text-slate-400">
                              <input
                                type="text"
                                value={row.notes}
                                onChange={(e) =>
                                  onUpdateTruckFromRow({ ...row, notes: e.target.value, sourceSheet: 'priority' })
                                }
                                className="bg-transparent border-0 focus:ring-1 focus:ring-amber-500 rounded p-1 w-full"
                                placeholder="Ghi chú..."
                              />
                            </td>
                            <td className="py-2 px-3 text-center">
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400">
                                {row.priority || 'Ưu tiên'}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-center font-mono font-semibold">
                              {row.carCount}
                            </td>
                            <td className="py-2 px-3 text-center font-mono text-slate-600 dark:text-slate-400">
                              {row.waitingPosition}
                            </td>
                            <td className="py-2 px-3 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => {
                                    const dock = row.dock || 'A1';
                                    onCallTruckQuick(row.plate, dock, 'priority');
                                  }}
                                  className="px-2 py-1 text-[11px] font-semibold bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/50 dark:hover:bg-amber-900/50 text-amber-700 dark:text-amber-300 rounded border border-amber-200 dark:border-amber-800 flex items-center gap-1"
                                  title="Gọi xe ưu tiên vào dock"
                                >
                                  <PhoneCall className="w-3 h-3" />
                                  Gọi vào {row.dock || 'Dock'}
                                </button>

                                {row.dock && (
                                  <button
                                    onClick={() => onSkipTruckQuick(row.plate, 'priority')}
                                    className="px-2 py-1 text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded border border-slate-300 dark:border-slate-700 flex items-center gap-1"
                                    title="Bỏ qua lượt gọi, đưa xe về cuối hàng đợi"
                                  >
                                    <SkipForward className="w-3 h-3" />
                                    Bỏ qua
                                  </button>
                                )}

                                <button
                                  onClick={() => onConfirmArrivalToHistory(row.plate)}
                                  className="px-2 py-1 text-[11px] font-semibold bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:hover:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 rounded border border-emerald-200 dark:border-emerald-800 flex items-center gap-1"
                                  title="Xác nhận đã đến cửa & chuyển qua sheet Lịch sử giao hàng"
                                >
                                  <ArrowRightCircle className="w-3 h-3" />
                                  Xác nhận đến cửa
                                </button>
                              </div>
                            </td>
                            <td className="py-2 px-2 text-center">
                              <button
                                onClick={() => onDeleteTruckRow(row.plate, 'priority')}
                                className="p-1 text-slate-400 hover:text-red-500 transition-colors"
                                title="Xóa dòng này"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: LỊCH SỬ GIAO HÀNG */}
          {activeTab === 'sheet_history' && (
            <div className="space-y-4">
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900 shadow-xs">
                <div className="px-4 py-2.5 bg-[#3b1d5e] text-white flex items-center justify-between text-xs font-bold">
                  <span>BẢNG: Lịch sử giao hàng</span>
                  <span className="font-normal opacity-90 text-[11px]">
                    Lưu vết các xe đã xác nhận đến cửa & hoàn tất dỡ hàng
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-100 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="py-2.5 px-3">dấu thời gian</th>
                        <th className="py-2.5 px-3">biển số xe</th>
                        <th className="py-2.5 px-3">loại xe</th>
                        <th className="py-2.5 px-3 text-center">số lần gọi</th>
                        <th className="py-2.5 px-3 text-center">cửa</th>
                        <th className="py-2.5 px-3 text-center">ghi chú</th>
                        <th className="py-2.5 px-3 text-center">ưu tiên</th>
                        <th className="py-2.5 px-3 text-center">intime</th>
                        <th className="py-2.5 px-3 text-center">Sl Xe</th>
                        <th className="py-2.5 px-3 text-center">Vị Trí</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-normal">
                      {historyRows.map((h, i) => (
                        <tr
                          key={i}
                          className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors"
                        >
                          <td className="py-2 px-3 text-slate-500 font-mono text-[11px]">
                            {h.timestamp}
                          </td>
                          <td className="py-2 px-3 font-mono font-bold text-slate-900 dark:text-slate-100">
                            {h.plate}
                          </td>
                          <td className="py-2 px-3">
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800">
                              {h.vehicleType}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-center font-mono">
                            {h.callCount}
                          </td>
                          <td className="py-2 px-3 text-center font-mono font-bold text-emerald-600 dark:text-emerald-400">
                            {h.dock}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
                              {h.notes || 'ĐÃ GIAO HÀNG'}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-center">
                            {h.priority ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400">
                                {h.priority}
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="py-2 px-3 text-center font-mono text-emerald-700 dark:text-emerald-300 text-[11px]">
                            {h.inTime}
                          </td>
                          <td className="py-2 px-3 text-center font-mono font-semibold">
                            {h.carCount}
                          </td>
                          <td className="py-2 px-3 text-center font-mono text-slate-500">
                            {h.waitingPosition}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: MÃ NGUỒN APPS SCRIPT */}
          {activeTab === 'gas_code' && (
            <div className="space-y-6">
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-slate-900 text-slate-100">
                <div className="flex items-center justify-between px-4 py-3 bg-slate-950 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-purple-400">Code.gs</span>
                    <span className="text-xs text-slate-400">(Tệp backend Apps Script liên kết 3 sheet)</span>
                  </div>
                  <button
                    onClick={handleCopyGs}
                    className="flex items-center gap-1.5 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-xs font-medium rounded-lg text-white transition-colors"
                  >
                    {copiedGs ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedGs ? 'Đã sao chép!' : 'Sao chép Code.gs'}
                  </button>
                </div>
                <pre className="p-4 text-xs font-mono max-h-72 overflow-y-auto text-slate-300 leading-relaxed custom-scrollbar">
                  <code>{APPS_SCRIPT_CODE_GS}</code>
                </pre>
              </div>

              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-slate-900 text-slate-100">
                <div className="flex items-center justify-between px-4 py-3 bg-slate-950 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-blue-400">Index.html</span>
                    <span className="text-xs text-slate-400">(Tệp giao diện HTMLService)</span>
                  </div>
                  <button
                    onClick={handleCopyHtml}
                    className="flex items-center gap-1.5 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-xs font-medium rounded-lg text-white transition-colors"
                  >
                    {copiedHtml ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedHtml ? 'Đã sao chép!' : 'Sao chép Index.html'}
                  </button>
                </div>
                <pre className="p-4 text-xs font-mono max-h-72 overflow-y-auto text-slate-300 leading-relaxed custom-scrollbar">
                  <code>{APPS_SCRIPT_INDEX_HTML}</code>
                </pre>
              </div>
            </div>
          )}

          {/* TAB 4: HƯỚNG DẪN */}
          {activeTab === 'guide' && (
            <div className="space-y-4 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
              <div className="p-4 rounded-xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-900">
                <h3 className="font-bold text-sm text-purple-900 dark:text-purple-200 mb-1">
                  Luồng vận hành chuẩn Google Sheets + Google Apps Script
                </h3>
                <p className="text-slate-600 dark:text-slate-400">
                  Khi NCC đăng ký: dữ liệu vào bảng <b>Thông Tin Giao Hàng</b>. Khi chuyển xe cần gọi gấp sang sheet <b>Ưu Tiên</b>: vị trí các xe đợi trước đó không bị xáo trộn; khi điền <b>cửa</b>, màn hình vẫn hiện modal &amp; hoạt ảnh xe chạy vào dock. Khi xác nhận đã đến cửa: toàn bộ thông tin được chuyển sang <b>Lịch sử giao hàng</b> với <code>intime</code> và ghi chú <code>ĐÃ GIAO HÀNG</code>.
                </p>
              </div>

              <ol className="space-y-3 list-decimal list-inside pl-1">
                <li className="font-medium">
                  <strong className="text-slate-900 dark:text-slate-100">Mở Google Sheets của bạn:</strong> Chọn <em>Tiện ích mở rộng (Extensions)</em> &rarr; <em>Apps Script</em>.
                </li>
                <li className="font-medium">
                  <strong className="text-slate-900 dark:text-slate-100">Dán Code.gs:</strong> Xóa code cũ và dán toàn bộ mã ở tab <em>Mã nguồn Apps Script</em>.
                </li>
                <li className="font-medium">
                  <strong className="text-slate-900 dark:text-slate-100">Chạy hàm tạo bảng mẫu (nếu là file mới):</strong> Chọn hàm <code>setupInitialSheet</code> và bấm <strong>Chạy (Run)</strong>. Hệ thống sẽ tự động cấu hình chuẩn 3 sheet: <code>Thông Tin Giao Hàng</code>, <code>Ưu Tiên</code> và <code>Lịch sử giao hàng</code>.
                </li>
                <li className="font-medium">
                  <strong className="text-slate-900 dark:text-slate-100">Tạo tệp Index.html:</strong> Trong Apps Script, bấm dấu <strong>+</strong> &rarr; chọn <strong>HTML</strong> &rarr; đặt tên là <code>Index</code> và dán nội dung từ tab <em>Index.html</em>.
                </li>
                <li className="font-medium">
                  <strong className="text-slate-900 dark:text-slate-100">Triển khai hoặc cập nhật Web App:</strong>
                  <ul className="list-disc list-inside pl-4 mt-1 text-slate-600 dark:text-slate-400 font-normal">
                    <li>Lần đầu: <b>Triển khai (Deploy) &rarr; Triển khai mới (New deployment)</b> &rarr; Loại: Ứng dụng web &rarr; Thực thi dưới dạng: Tôi &rarr; Quyền truy cập: Bất kỳ ai (Anyone).</li>
                    <li>Nếu đã có URL và vừa dán Code.gs mới: <b>Triển khai &rarr; Quản lý bản triển khai &rarr; Biểu tượng Sửa &rarr; Mục Phiên bản chọn &ldquo;Phiên bản mới&rdquo; &rarr; Triển khai</b> (nếu chỉ bấm Lưu mà không tạo phiên bản mới, Web App vẫn chạy code cũ).</li>
                  </ul>
                </li>
                <li className="font-medium">
                  <strong className="text-slate-900 dark:text-slate-100">Kết nối thời gian thực:</strong> Sao chép URL Web App được cấp và dán vào mục <em>URL Web App Google Apps Script</em> trong ứng dụng này.
                </li>
              </ol>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 flex items-center justify-between">
          <span className="text-xs text-slate-500">
            {config.mode === 'simulator' ? 'Chế độ mô phỏng cục bộ' : 'Chế độ kết nối trực tiếp Google Apps Script'}
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold rounded-lg hover:opacity-90 transition-opacity"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
