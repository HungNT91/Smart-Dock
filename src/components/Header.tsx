import React from 'react';
import { Volume2, VolumeX, Maximize2, Minimize2, Sun, Moon, FileSpreadsheet, Tv } from 'lucide-react';
import { formatDuration } from '../utils/isoMath';

interface HeaderProps {
  soundEnabled: boolean;
  onToggleSound: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  onOpenSheetManager: () => void;
  onOpenAddModal: () => void;
  isTvMode: boolean;
  onToggleTvMode: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  soundEnabled,
  onToggleSound,
  isFullscreen,
  onToggleFullscreen,
  isDarkMode,
  onToggleDarkMode,
  onOpenSheetManager,
  onOpenAddModal,
  isTvMode,
  onToggleTvMode,
}) => {
  const [timeStr, setTimeStr] = React.useState('');

  React.useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setTimeStr(
        now.toLocaleTimeString('vi-VN', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 sticky top-0 z-30 transition-colors">
      <div className="flex items-center justify-between gap-8 px-5 py-3">
        {/* Brand Zone */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-black text-sm shadow-xs">
            WMS
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-slate-900 dark:text-slate-100 font-display whitespace-nowrap">
              Màn Hình Điều Phối Cửa Dock
            </h1>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-2">
              <span>Kho Vận Nhập Khẩu</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono">{timeStr}</span>
            </div>
          </div>
        </div>

        {/* Navigation / Info */}
        <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-slate-600 dark:text-slate-400">
          <span className="text-slate-900 dark:text-slate-100 font-semibold whitespace-nowrap">
            12 Cửa Dock (A1-A6 · B1-B6)
          </span>
          <span className="whitespace-nowrap">
            Hiển thị thời gian thực theo Google Sheets
          </span>
        </nav>

        {/* Actions & Controls */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onToggleSound}
            className={`p-2 rounded-lg border text-xs font-medium transition-colors ${
              soundEnabled
                ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border-blue-200 dark:border-blue-800'
                : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 border-slate-200 dark:border-slate-700'
            }`}
            title={soundEnabled ? 'Tắt âm thanh loa gọi xe' : 'Bật âm thanh loa gọi xe'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          <button
            onClick={onToggleTvMode}
            className={`p-2 rounded-lg border text-xs font-medium transition-colors ${
              isTvMode
                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border-amber-300 dark:border-amber-700 font-semibold'
                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-slate-200 dark:border-slate-700'
            }`}
            title={isTvMode ? 'Thoát chế độ hiển thị TV Kho' : 'Bật chế độ TV Kho'}
          >
            <Tv className="w-4 h-4" />
          </button>

          <button
            onClick={onToggleDarkMode}
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
            title="Đổi giao diện Sáng / Tối"
          >
            {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          <button
            onClick={onToggleFullscreen}
            className="hidden sm:block p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
            title="Toàn màn hình"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          <button
            onClick={onOpenAddModal}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors whitespace-nowrap"
          >
            + Đăng ký xe
          </button>

          <button
            onClick={onOpenSheetManager}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors shadow-xs whitespace-nowrap"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Google Sheets & Apps Script
          </button>
        </div>
      </div>
    </header>
  );
};
