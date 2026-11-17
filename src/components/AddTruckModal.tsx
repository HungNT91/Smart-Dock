import React, { useState } from 'react';
import { Truck, VehicleTypeKey } from '../types';
import { VEHICLE_CONFIGS } from '../utils/isoMath';
import { X, Truck as TruckIcon, Plus, Clock, MapPin, Layers } from 'lucide-react';

interface AddTruckModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddTruck: (truckData: Partial<Truck>) => void;
  availableDocks: string[]; // List of empty dock IDs like ["A1", "A2", ...]
}

export const AddTruckModal: React.FC<AddTruckModalProps> = ({
  isOpen,
  onClose,
  onAddTruck,
  availableDocks,
}) => {
  const [plate, setPlate] = useState('');
  const [type, setType] = useState<VehicleTypeKey>('small');
  const [carCount, setCarCount] = useState<number>(1);
  const [waitingPosition, setWaitingPosition] = useState<string>('15m');
  const [priority, setPriority] = useState<boolean>(false);
  const [assignedDock, setAssignedDock] = useState<string>('');
  const [notes, setNotes] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!plate.trim()) return;

    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(
      now.getMinutes()
    ).padStart(2, '0')}`;
    const timestampStr = `${String(now.getDate()).padStart(2, '0')}/${String(
      now.getMonth() + 1
    ).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(
      now.getMinutes()
    ).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

    onAddTruck({
      plate: plate.trim().toUpperCase(),
      type,
      carCount: Number(carCount) || 1,
      waitingPosition: waitingPosition.trim() || '15m',
      priority: priority ? 'Ưu tiên' : '',
      assignedDock: assignedDock || null,
      callCount: assignedDock ? 1 : undefined,
      checkInTime: timeStr,
      timestamp: timestampStr,
      notes: notes.trim(),
      supplier: 'Nhà cung cấp',
      pallets: (Number(carCount) || 1) * 6,
    });

    onClose();
    setPlate('');
    setNotes('');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-purple-100 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 rounded-lg">
              <TruckIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold font-display text-slate-900 dark:text-slate-100">
                Đăng ký giao hàng (NCC)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Ghi nhận vào bảng <b>Thông Tin Giao Hàng</b> & hàng đợi xe
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {/* Biển số xe */}
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Biển Số Xe: <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              autoFocus
              value={plate}
              onChange={(e) => setPlate(e.target.value)}
              placeholder="VD: 50H59561, 63C14368, 51D29892..."
              className="w-full px-3 py-2 font-mono font-bold uppercase bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          {/* Loại xe */}
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Loại Xe:
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(['small', 'van', 'big', 'cont'] as VehicleTypeKey[]).map((k) => {
                const cfg = VEHICLE_CONFIGS[k];
                const active = type === k;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setType(k)}
                    className={`py-2 px-3 rounded-lg border text-left flex items-center justify-between transition-colors ${
                      active
                        ? 'border-purple-600 bg-purple-50/70 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 font-semibold'
                        : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span>{cfg.name}</span>
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: cfg.color }}
                    />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Số lượng xe & Vị trí */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                <Layers className="w-3.5 h-3.5 text-slate-400" />
                Số lượng xe (Sl Xe):
              </label>
              <input
                type="number"
                min="1"
                max="50"
                value={carCount}
                onChange={(e) => setCarCount(Number(e.target.value) || 1)}
                className="w-full px-3 py-2 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                Vị Trí bãi đậu:
              </label>
              <input
                type="text"
                value={waitingPosition}
                onChange={(e) => setWaitingPosition(e.target.value)}
                placeholder="VD: 15m, 10m, 24m..."
                className="w-full px-3 py-2 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
            </div>
          </div>

          {/* Cửa dock & Ưu tiên */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Cửa dock (Nếu được gọi ngay):
              </label>
              <select
                value={assignedDock}
                onChange={(e) => setAssignedDock(e.target.value)}
                className="w-full px-3 py-2 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-purple-500"
              >
                <option value="">(Chưa gọi - Chờ hàng đợi)</option>
                {availableDocks.map((d) => (
                  <option key={d} value={d}>
                    Cửa Dock {d} (Trống)
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col justify-end">
              <label className="flex items-center gap-2 p-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800/60 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800">
                <input
                  type="checkbox"
                  checked={priority}
                  onChange={(e) => setPriority(e.target.checked)}
                  className="rounded text-purple-600 focus:ring-purple-500"
                />
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  Xe Ưu tiên
                </span>
              </label>
            </div>
          </div>

          {/* Ghi chú */}
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Ghi chú:
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ghi chú đơn hàng hoặc yêu cầu đặc biệt..."
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-purple-500"
            />
          </div>

          {/* Actions */}
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 font-medium"
            >
              Hủy
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg shadow-xs flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              Đăng ký xe vào cổng
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
