import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Truck, Dock, SyncConfig, SheetRowData, HistoryRowData, VehicleTypeKey } from './types';
import {
  loadStoredData,
  saveStoredData,
  INITIAL_DOCKS,
  INITIAL_TRUCKS,
  INITIAL_HISTORY_ROWS,
  fetchFromGasWebApp,
  fetchFromGoogleSheetUrl,
  callTruckViaGas,
  confirmArrivalViaGas,
  findDockIndexById,
  getLocalDateKey,
  parseSheetDateTime,
  isTodayBeforeCutoff,
  isHistoryEntryTodayBeforeCutoff,
  loadDismissed21hCalls,
  saveDismissed21hCalls,
  getStoredReset21hDate,
  setStoredReset21hDate,
  getStoredSessionDate,
  setStoredSessionDate,
  DismissedCallEntry,
} from './services/sheetService';
import { VEHICLE_CONFIGS, mapTypeNameToKey } from './utils/isoMath';
import { speakAnnouncement, cancelAnnouncement } from './utils/audioAnnouncement';
import { DockScene } from './components/DockScene';
import { SheetManagerModal } from './components/SheetManagerModal';
import { AddTruckModal } from './components/AddTruckModal';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

export default function App() {
  const [dataLoaded, setDataLoaded] = useState(false);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [priorityTrucks, setPriorityTrucks] = useState<Truck[]>([]);
  const [historyRows, setHistoryRows] = useState<HistoryRowData[]>([]);
  const [docks, setDocks] = useState<Dock[]>(INITIAL_DOCKS);
  const [syncConfig, setSyncConfig] = useState<SyncConfig>({
    mode: 'simulator',
    gasWebAppUrl: '',
    sheetId: '',
    sheetName: 'Thông Tin Giao Hàng',
    autoSync: true,
    pollIntervalSec: 2,
    lastSyncedAt: new Date(),
    syncStatus: 'idle',
  });

  const [selectedDockId, setSelectedDockId] = useState<number>(0);
  const [selectedTruckId, setSelectedTruckId] = useState<string | null>(null);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSheetModalOpen, setIsSheetModalOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(false);

  const [toastMessage, setToastMessage] = useState<{
    text: string;
    type: 'info' | 'success' | 'warn';
  } | null>(null);

  // Top-Right Modal for newly called truck (auto-closes after 15s)
  const [activeCallModal, setActiveCallModal] = useState<{
    plate: string;
    dockId: string;
    dockIndex: number;
    callCount: number;
    vehicleType?: string;
    supplier?: string;
    priority?: string;
    timestamp: number;
  } | null>(null);

  // Auto-close modal after 15 seconds
  useEffect(() => {
    if (!activeCallModal) return;
    const timer = setTimeout(() => {
      setActiveCallModal(null);
    }, 15000);
    return () => clearTimeout(timer);
  }, [activeCallModal]);

  const showToast = useCallback((text: string, type: 'info' | 'success' | 'warn' = 'info') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage((prev) => (prev?.text === text ? null : prev));
    }, 4000);
  }, []);

  // Initialize data on mount
  useEffect(() => {
    const loaded = loadStoredData();
    lastSessionDateRef.current = getLocalDateKey();
    setTrucks(loaded.trucks);
    setPriorityTrucks(loaded.priorityTrucks);
    setHistoryRows(loaded.history);
    setDocks(loaded.docks);
    setSyncConfig(loaded.config);
    setDataLoaded(true);

    // Dark mode check
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setIsDarkMode(true);
      document.documentElement.classList.add('dark');
    }
  }, []);

  // Save to localStorage when state changes
  useEffect(() => {
    if (!dataLoaded) return;
    saveStoredData(trucks, priorityTrucks, docks, historyRows, syncConfig);
  }, [trucks, priorityTrucks, docks, historyRows, syncConfig, dataLoaded]);

  // Dark mode toggle
  const handleToggleDarkMode = () => {
    setIsDarkMode((prev) => {
      const next = !prev;
      if (next) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
      return next;
    });
  };

  // Fullscreen toggle
  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    }
  };

  // Keyboard shortcuts for full-screen display mode (S: Settings, F: Fullscreen, M: Mute/Unmute, D: Demo Modal)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }
      if (e.key === 's' || e.key === 'S') {
        setIsSheetModalOpen((prev) => !prev);
      } else if (e.key === 'f' || e.key === 'F') {
        handleToggleFullscreen();
      } else if (e.key === 'm' || e.key === 'M') {
        setSoundEnabled((prev) => !prev);
      } else if (e.key === 'd' || e.key === 'D') {
        setActiveCallModal({
          plate: '63C11520',
          dockId: 'A3',
          dockIndex: 2,
          callCount: 1,
          vehicleType: 'Xe Tải 8 Tấn',
          timestamp: Date.now(),
        });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const prevTrucksRef = useRef<Truck[]>([]);
  const prevPriorityTrucksRef = useRef<Truck[]>([]);
  const prevHistoryRef = useRef<HistoryRowData[]>([]);
  const hasCompletedInitialGasSyncRef = useRef(false);
  const lastAnnouncedPlateRef = useRef<string | null>(null);
  const recentlyConfirmedRef = useRef<Record<string, number>>({});
  const docksRef = useRef<Dock[]>(docks);
  const trucksRef = useRef<Truck[]>(trucks);
  const priorityTrucksRef = useRef<Truck[]>(priorityTrucks);
  const skippedOrderRef = useRef<Record<string, number>>({});
  const [skippedOrderTick, setSkippedOrderTick] = useState(0);
  const lastReset21hDateRef = useRef<string | null>(getStoredReset21hDate());
  const lastSessionDateRef = useRef<string>(getStoredSessionDate() || getLocalDateKey());
  const dismissed21hRef = useRef<DismissedCallEntry[]>(loadDismissed21hCalls());
  const [gasHasPrioritySupport, setGasHasPrioritySupport] = useState<boolean | null>(null);
  const warnedMissingPriorityGasRef = useRef(false);

  useEffect(() => {
    warnedMissingPriorityGasRef.current = false;
    setGasHasPrioritySupport(null);
  }, [syncConfig.gasWebAppUrl, syncConfig.mode]);

  useEffect(() => {
    docksRef.current = docks;
  }, [docks]);

  useEffect(() => {
    trucksRef.current = trucks;
  }, [trucks]);

  useEffect(() => {
    priorityTrucksRef.current = priorityTrucks;
  }, [priorityTrucks]);

  const clearDismissedForPlate = useCallback((plate: string) => {
    const normPlate = plate.trim().toUpperCase();
    const filtered = dismissed21hRef.current.filter((e) => e.plate !== normPlate);
    if (filtered.length !== dismissed21hRef.current.length) {
      dismissed21hRef.current = filtered;
      saveDismissed21hCalls(filtered);
    }
  }, []);

  const performDaily21hClearance = useCallback((now: Date) => {
    const todayKey = getLocalDateKey(now);
    lastReset21hDateRef.current = todayKey;
    lastSessionDateRef.current = todayKey;
    setStoredReset21hDate(todayKey);
    setStoredSessionDate(todayKey);

    const nextDismissed = [...dismissed21hRef.current];
    const recordDismissed = (plate?: string, dock?: string | null, callCount?: number) => {
      if (!plate || !dock) return;
      const normPlate = plate.trim().toUpperCase();
      const normDock = dock.trim().toUpperCase();
      const count = Number(callCount) || 0;
      if (!nextDismissed.some((e) => e.plate === normPlate && e.dock === normDock && e.callCount === count)) {
        nextDismissed.push({ plate: normPlate, dock: normDock, callCount: count, resetDate: todayKey });
      }
    };

    docksRef.current.forEach((d) => {
      if (d.currentTruck) {
        recordDismissed(d.currentTruck.plate, d.id, d.currentTruck.callCount);
      }
    });
    [...trucksRef.current, ...priorityTrucksRef.current].forEach((t) => {
      if (t.assignedDock && t.dockId !== null) {
        recordDismissed(t.plate, t.assignedDock, t.callCount);
      }
    });

    dismissed21hRef.current = nextDismissed;
    saveDismissed21hCalls(nextDismissed);

    // Clear all docks -> DockScene plays drive-out animation for every docked truck
    setDocks((prev) =>
      prev.map((d) => ({
        ...d,
        currentTruck: null,
        status: d.status === 'maintenance' ? 'maintenance' : 'free',
      }))
    );

    // Keep only waiting queue trucks
    setTrucks((prev) => prev.filter((t) => t.status === 'waiting'));
    setPriorityTrucks((prev) => prev.filter((t) => t.status === 'waiting'));
    setActiveCallModal(null);
  }, []);

  const performNewDayRollover = useCallback((now: Date) => {
    const todayKey = getLocalDateKey(now);
    lastSessionDateRef.current = todayKey;
    setStoredSessionDate(todayKey);

    // New morning starts with all docks empty; only waiting queue trucks remain
    setDocks((prev) =>
      prev.map((d) => ({
        ...d,
        currentTruck: null,
        status: d.status === 'maintenance' ? 'maintenance' : 'free',
      }))
    );
    setTrucks((prev) => prev.filter((t) => t.status === 'waiting'));
    setPriorityTrucks((prev) => prev.filter((t) => t.status === 'waiting'));
    setActiveCallModal(null);
  }, []);

  // Scheduler checking daily midnight rollover & 21:00 dock-clearance cutoff every 5 seconds
  useEffect(() => {
    if (!dataLoaded) return;
    const checkDailySchedule = () => {
      const now = new Date();
      const todayKey = getLocalDateKey(now);

      if (lastSessionDateRef.current !== todayKey) {
        performNewDayRollover(now);
      }

      if (now.getHours() >= 21 && lastReset21hDateRef.current !== todayKey) {
        performDaily21hClearance(now);
      }
    };

    checkDailySchedule();
    const timer = setInterval(checkDailySchedule, 5000);
    return () => clearInterval(timer);
  }, [dataLoaded, performDaily21hClearance, performNewDayRollover]);

  // Live Google Apps Script & Direct Sheet Polling
  const syncWithGasLive = useCallback(async () => {
    const isDirectSheet = syncConfig.mode === 'sheet_direct';
    const activeUrl = isDirectSheet ? (syncConfig.sheetUrl || syncConfig.gasWebAppUrl) : syncConfig.gasWebAppUrl;
    if (!activeUrl) return;

    try {
      const res = isDirectSheet
        ? await fetchFromGoogleSheetUrl(activeUrl, syncConfig.sheetName)
        : await fetchFromGasWebApp(activeUrl);

      setGasHasPrioritySupport(res.hasPrioritySupport);
      if (!isDirectSheet && !res.hasPrioritySupport && !warnedMissingPriorityGasRef.current) {
        warnedMissingPriorityGasRef.current = true;
        showToast(
          'Web App GAS chưa trả về sheet "Ưu Tiên" (priorityTrucks). Hãy cập nhật Code.gs và Triển khai lại phiên bản mới trong Apps Script.',
          'warn'
        );
      } else if (res.hasPrioritySupport) {
        warnedMissingPriorityGasRef.current = false;
      }
      const prevTrucks = prevTrucksRef.current;
      const prevPriorityTrucks = prevPriorityTrucksRef.current;
      const liveTrucks = res.trucks;
      const livePriorityTrucks = res.priorityTrucks || [];
      const allLiveTrucks = [...liveTrucks, ...livePriorityTrucks];
      const now = new Date();
      const todayKey = getLocalDateKey(now);
      const isAfter21h = now.getHours() >= 21;
      const isInitialSync = !hasCompletedInitialGasSyncRef.current;

      if (isAfter21h && lastReset21hDateRef.current !== todayKey) {
        lastReset21hDateRef.current = todayKey;
        setStoredReset21hDate(todayKey);
      }

      // If page first loaded after 21:00, dismiss pre-existing docked assignments from both sheets
      if (isAfter21h && isInitialSync) {
        const nextDismissed = [...dismissed21hRef.current];
        allLiveTrucks.forEach((t) => {
          if (t.assignedDock && t.dockId !== null) {
            const normPlate = t.plate.trim().toUpperCase();
            const normDock = t.assignedDock.trim().toUpperCase();
            const count = Number(t.callCount) || 0;
            if (!nextDismissed.some((e) => e.plate === normPlate && e.dock === normDock && e.callCount === count)) {
              nextDismissed.push({ plate: normPlate, dock: normDock, callCount: count, resetDate: todayKey });
            }
          }
        });
        dismissed21hRef.current = nextDismissed;
        saveDismissed21hCalls(nextDismissed);
      }

      // Prune dismissed entries once a truck leaves the sheet or receives a different dock/callCount
      if (dismissed21hRef.current.length > 0) {
        const pruned = dismissed21hRef.current.filter((entry) =>
          allLiveTrucks.some(
            (t) =>
              t.plate.trim().toUpperCase() === entry.plate &&
              (t.assignedDock || '').trim().toUpperCase() === entry.dock &&
              (Number(t.callCount) || 0) === entry.callCount
          )
        );
        if (pruned.length !== dismissed21hRef.current.length) {
          dismissed21hRef.current = pruned;
          saveDismissed21hCalls(pruned);
        }
      }

      const liveHistory = res.history || [];
      const prevHistory = prevHistoryRef.current;

      // Expire temporary confirmation suppression flags after 30s
      const nowMs = Date.now();
      Object.keys(recentlyConfirmedRef.current).forEach((k) => {
        if (nowMs - recentlyConfirmedRef.current[k] > 30000) {
          delete recentlyConfirmedRef.current[k];
        }
      });

      const isCompletedNote = (notes?: string) =>
        /đã\s*giao|đã\s*đến|hoàn\s*tất/i.test(String(notes || ''));

      const isAlreadyInHistoryToday = (incoming: Truck) => {
        if (incoming.dockId === null || incoming.dockId === undefined) return false;
        const plateKey = incoming.plate.trim().toUpperCase();
        const incomingCallCount = Number(incoming.callCount) || 1;
        return liveHistory.some((h) => {
          if (String(h.plate || '').trim().toUpperCase() !== plateKey) return false;
          const hDockIdx = findDockIndexById(h.dock);
          if (hDockIdx === null || hDockIdx !== incoming.dockId) return false;
          if ((Number(h.callCount) || 1) !== incomingCallCount) return false;
          if (incoming.timestamp && h.timestamp && incoming.timestamp.trim() === h.timestamp.trim()) {
            return true;
          }
          const parsedHist = parseSheetDateTime(h.inTime || h.timestamp);
          return Boolean(parsedHist && getLocalDateKey(parsedHist) === todayKey);
        });
      };

      // Detect trucks that just moved into "Lịch sử giao hàng"
      const newlyConfirmedPlates = new Set<string>();
      if (!isInitialSync) {
        liveHistory.forEach((h) => {
          const plateKey = String(h.plate || '').trim().toUpperCase();
          if (!plateKey) return;
          const existedBefore = prevHistory.some(
            (ph) =>
              String(ph.plate || '').trim().toUpperCase() === plateKey &&
              String(ph.inTime || '').trim() === String(h.inTime || '').trim() &&
              String(ph.dock || '').trim().toUpperCase() === String(h.dock || '').trim().toUpperCase() &&
              String(ph.timestamp || '').trim() === String(h.timestamp || '').trim()
          );
          if (!existedBefore) {
            newlyConfirmedPlates.add(plateKey);
          }
        });

        [...prevTrucks, ...prevPriorityTrucks].forEach((prevItem) => {
          const plateKey = prevItem.plate.trim().toUpperCase();
          const stillInQueues = allLiveTrucks.some((t) => t.plate.trim().toUpperCase() === plateKey);
          if (!stillInQueues && liveHistory.some((h) => String(h.plate || '').trim().toUpperCase() === plateKey)) {
            newlyConfirmedPlates.add(plateKey);
          }
        });

        if (newlyConfirmedPlates.size > 0) {
          newlyConfirmedPlates.forEach((plateKey) => {
            recentlyConfirmedRef.current[plateKey] = nowMs;
            if (lastAnnouncedPlateRef.current === plateKey) {
              cancelAnnouncement();
              lastAnnouncedPlateRef.current = null;
            }
          });
          setActiveCallModal((modal) =>
            modal && newlyConfirmedPlates.has(modal.plate.trim().toUpperCase()) ? null : modal
          );
        }
      }

      const newlyCalledPlates = new Set<string>();
      let skippedUpdated = false;

      const processSheetDiff = (incomingList: Truck[], prevList: Truck[], isPrioritySheet: boolean) => {
        if (isInitialSync) return;

        const sheetLabel = isPrioritySheet ? 'Ưu Tiên' : 'Google Sheet';

        incomingList.forEach((incoming) => {
          const plateKey = incoming.plate.trim().toUpperCase();
          const prev = prevList.find((t: Truck) => t.plate.trim().toUpperCase() === plateKey);

          const isConfirmedOrDone =
            isCompletedNote(incoming.notes) ||
            Boolean(recentlyConfirmedRef.current[plateKey]) ||
            newlyConfirmedPlates.has(plateKey) ||
            isAlreadyInHistoryToday(incoming);

          if (isConfirmedOrDone) {
            setActiveCallModal((modal) =>
              modal && modal.plate.trim().toUpperCase() === plateKey ? null : modal
            );
            if (lastAnnouncedPlateRef.current === plateKey) {
              cancelAnnouncement();
              lastAnnouncedPlateRef.current = null;
            }
            return;
          }

          if (!prev) {
            if (incoming.dockId === null || incoming.assignedDock === null) {
              // New waiting truck registered
              if (!isPrioritySheet) {
                setTriggerNewArrival(incoming);
              }
            } else {
              // Newly added truck ALREADY has a dock assigned (typical for sheet "Ưu Tiên")!
              clearDismissedForPlate(incoming.plate);
              delete skippedOrderRef.current[plateKey];
              newlyCalledPlates.add(plateKey);
              lastAnnouncedPlateRef.current = plateKey;

              const dockLabel = incoming.assignedDock;
              const countLabel = incoming.callCount || 1;
              const announcement = `Mời xe ${incoming.plate} vào Cửa ${dockLabel} để giao hàng. Lần gọi thứ ${countLabel}!`;
              speakAnnouncement(announcement, soundEnabled);
              showToast(`${sheetLabel}: Đã gọi xe ${incoming.plate} vào cửa ${dockLabel} (Lần ${countLabel})`, 'success');

              setActiveCallModal({
                plate: incoming.plate,
                dockId: dockLabel || 'Dock',
                dockIndex: incoming.dockId ?? 0,
                callCount: Number(countLabel) || 1,
                vehicleType: VEHICLE_CONFIGS[incoming.type]?.name || 'Xe Tải',
                supplier: incoming.supplier,
                priority: incoming.priority || (isPrioritySheet ? 'Ưu tiên' : ''),
                timestamp: Date.now(),
              });
            }
          } else {
            const prevHadDock = Boolean(prev.assignedDock && prev.dockId !== null);
            const nowHasDock = Boolean(incoming.assignedDock && incoming.dockId !== null);
            const dockChanged = incoming.assignedDock !== prev.assignedDock && nowHasDock;
            const callCountIncreased = (incoming.callCount || 0) > (prev.callCount || 0);

            if ((!prevHadDock && nowHasDock) || dockChanged || callCountIncreased) {
              clearDismissedForPlate(incoming.plate);
              delete skippedOrderRef.current[plateKey];
              newlyCalledPlates.add(plateKey);
              lastAnnouncedPlateRef.current = plateKey;

              const dockLabel = incoming.assignedDock;
              const countLabel = incoming.callCount || 1;
              const announcement = `Mời xe ${incoming.plate} vào Cửa ${dockLabel} để giao hàng. Lần gọi thứ ${countLabel}!`;
              speakAnnouncement(announcement, soundEnabled);
              showToast(`${sheetLabel}: Đã gọi xe ${incoming.plate} vào cửa ${dockLabel} (Lần ${countLabel})`, 'success');

              setActiveCallModal({
                plate: incoming.plate,
                dockId: dockLabel || 'Dock',
                dockIndex: incoming.dockId ?? 0,
                callCount: Number(countLabel) || 1,
                vehicleType: VEHICLE_CONFIGS[incoming.type]?.name || 'Xe Tải',
                supplier: incoming.supplier,
                priority: incoming.priority || (isPrioritySheet ? 'Ưu tiên' : ''),
                timestamp: Date.now(),
              });
            }
          }
        });

        // Detect skipped trucks (had a dock in previous poll, now dock is cleared back to waiting)
        prevList.forEach((prev: Truck) => {
          if (prev.assignedDock && prev.dockId !== null) {
            const plateKey = prev.plate.trim().toUpperCase();
            const currentLive = incomingList.find((t: Truck) => t.plate.trim().toUpperCase() === plateKey);
            if (currentLive && !currentLive.assignedDock) {
              skippedOrderRef.current[plateKey] = Date.now();
              skippedUpdated = true;
              showToast(
                `${sheetLabel}: Xe ${prev.plate} không đến, đã bỏ qua cửa ${prev.assignedDock} và chuyển về cuối hàng đợi`,
                'warn'
              );
              setActiveCallModal((modal) => (modal?.plate.trim().toUpperCase() === plateKey ? null : modal));
              if (lastAnnouncedPlateRef.current === plateKey) {
                cancelAnnouncement();
                lastAnnouncedPlateRef.current = null;
              }
            }
          }
        });
      };

      processSheetDiff(liveTrucks, prevTrucks, false);
      processSheetDiff(livePriorityTrucks, prevPriorityTrucks, true);

      if (skippedUpdated) {
        setSkippedOrderTick((t) => t + 1);
      }

      hasCompletedInitialGasSyncRef.current = true;
      prevTrucksRef.current = liveTrucks;
      prevPriorityTrucksRef.current = livePriorityTrucks;
      prevHistoryRef.current = liveHistory;
      setTrucks(liveTrucks);
      setPriorityTrucks(livePriorityTrucks);
      if (res.history && res.history.length > 0) {
        setHistoryRows(res.history);
      }

      const isDismissedCall = (plate?: string, dockStr?: string | null, callCount?: number) => {
        if (!plate || !dockStr) return false;
        const normPlate = plate.trim().toUpperCase();
        const normDock = dockStr.trim().toUpperCase();
        const count = Number(callCount) || 0;
        return dismissed21hRef.current.some(
          (e) => e.plate === normPlate && e.dock === normDock && e.callCount === count
        );
      };

      // Re-map docks from both "Thông Tin Giao Hàng" and "Ưu Tiên"
      setDocks((prevDocks) => {
        return prevDocks.map((d) => {
          const prioMatch = livePriorityTrucks.find(
            (t) =>
              t.dockId === d.index &&
              !isDismissedCall(t.plate, t.assignedDock || d.id, t.callCount)
          );
          const activeMatch = liveTrucks.find(
            (t) =>
              t.dockId === d.index &&
              !isDismissedCall(t.plate, t.assignedDock || d.id, t.callCount)
          );
          const matched = prioMatch || activeMatch;

          if (matched) {
            const plateKey = matched.plate.trim().toUpperCase();
            const isNewlyCalled = newlyCalledPlates.has(plateKey);
            return {
              ...d,
              currentTruck: isNewlyCalled ? { ...matched, status: 'moving' } : matched,
              status: isNewlyCalled ? 'moving' : 'busy',
            };
          }

          // Check existing truck on dock
          if (d.currentTruck) {
            const isSkippedBackToQueue = allLiveTrucks.some(
              (t) =>
                t.plate.trim().toUpperCase() === d.currentTruck?.plate.trim().toUpperCase() &&
                !t.assignedDock
            );
            if (isSkippedBackToQueue) {
              return {
                ...d,
                currentTruck: null,
                status: 'free',
              };
            }

            if (
              isDismissedCall(d.currentTruck.plate, d.currentTruck.assignedDock || d.id, d.currentTruck.callCount) ||
              (isAfter21h && d.currentTruck.id.startsWith('HIST-'))
            ) {
              return {
                ...d,
                currentTruck: null,
                status: d.status === 'maintenance' ? 'maintenance' : 'free',
              };
            }

            // If dock holds a history-restored truck and a newer confirmed truck arrived at the same dock today, update it
            if (!isAfter21h && d.currentTruck.id.startsWith('HIST-') && liveHistory.length > 0) {
              const todayHistMatches = liveHistory.filter((h: HistoryRowData) => {
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
                const isWaitingInLive = allLiveTrucks.some(
                  (t) =>
                    t.plate.trim().toUpperCase() === recentHist.plate.trim().toUpperCase() &&
                    !t.assignedDock
                );
                if (
                  !isWaitingInLive &&
                  recentHist.plate.trim().toUpperCase() !== d.currentTruck.plate.trim().toUpperCase()
                ) {
                  const histTruck: Truck = {
                    id: `HIST-${recentHist.plate.trim().toUpperCase()}-${d.index}`,
                    plate: recentHist.plate.trim().toUpperCase(),
                    type: mapTypeNameToKey(recentHist.vehicleType),
                    supplier: recentHist.notes || '',
                    pallets: 10,
                    assignedDock: d.id,
                    checkInTime: recentHist.inTime || '',
                    arrivalTimeMs: Date.now(),
                    status: 'busy',
                    dockId: d.index,
                    callCount: Number(recentHist.callCount) || 1,
                    priority: recentHist.priority,
                    waitingPosition: recentHist.waitingPosition,
                  };
                  return {
                    ...d,
                    currentTruck: histTruck,
                    status: 'busy',
                  };
                }
              }
            }

            // Keep previously docked truck (from today) at dock until a new truck is assigned or 21:00 reset
            return {
              ...d,
              status: 'busy',
            };
          }

          // If dock was empty and it is strictly before 21:00, check today's history ONLY
          if (!isAfter21h && liveHistory.length > 0) {
            const todayHistMatches = liveHistory.filter((h: HistoryRowData) => {
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

              const isWaitingInLive = allLiveTrucks.some(
                (t) =>
                  t.plate.trim().toUpperCase() === recentHist.plate.trim().toUpperCase() &&
                  !t.assignedDock
              );
              if (!isWaitingInLive) {
                const histTruck: Truck = {
                  id: `HIST-${recentHist.plate.trim().toUpperCase()}-${d.index}`,
                  plate: recentHist.plate.trim().toUpperCase(),
                  type: mapTypeNameToKey(recentHist.vehicleType),
                  supplier: recentHist.notes || '',
                  pallets: 10,
                  assignedDock: d.id,
                  checkInTime: recentHist.inTime || '',
                  arrivalTimeMs: Date.now(),
                  status: 'busy',
                  dockId: d.index,
                  callCount: Number(recentHist.callCount) || 1,
                  priority: recentHist.priority,
                  waitingPosition: recentHist.waitingPosition,
                };
                return {
                  ...d,
                  currentTruck: histTruck,
                  status: 'busy',
                };
              }
            }
          }

          return {
            ...d,
            currentTruck: null,
            status: d.status === 'maintenance' ? 'maintenance' : 'free',
          };
        });
      });

      setSyncConfig((prev) => ({
        ...prev,
        lastSyncedAt: new Date(),
        syncStatus: 'connected',
        errorMessage: undefined,
      }));
    } catch (err: any) {
      setSyncConfig((prev) => ({
        ...prev,
        syncStatus: 'error',
        errorMessage: err.message,
      }));
    }
  }, [syncConfig.mode, syncConfig.gasWebAppUrl, syncConfig.sheetUrl, syncConfig.sheetName, soundEnabled, showToast, clearDismissedForPlate]);

  useEffect(() => {
    const isDirectSheet = syncConfig.mode === 'sheet_direct';
    const isGasLive = syncConfig.mode === 'gas_live';
    const hasTarget = (isDirectSheet && syncConfig.sheetUrl) || (isGasLive && syncConfig.gasWebAppUrl);
    if (!dataLoaded || !hasTarget || !syncConfig.autoSync) return;
    syncWithGasLive().catch(() => {});
    const interval = setInterval(() => {
      syncWithGasLive().catch(() => {});
    }, (syncConfig.pollIntervalSec || 2) * 1000);
    return () => clearInterval(interval);
  }, [dataLoaded, syncConfig.mode, syncConfig.autoSync, syncConfig.gasWebAppUrl, syncConfig.sheetUrl, syncConfig.pollIntervalSec, syncWithGasLive]);

  // Derived state: Queue trucks
  // Keep "Thông Tin Giao Hàng" non-skipped waiting trucks in their exact order first so "Ưu Tiên"
  // calls/skips NEVER shift positions of waiting trucks before them; skipped trucks always go to the end.
  const queueTrucks = useMemo(() => {
    const skippedMap = skippedOrderRef.current;
    const seenPlates = new Set<string>();

    // Avoid showing duplicates if a plate is already actively assigned to a dock
    docks.forEach((d) => {
      if (d.currentTruck?.plate) {
        seenPlates.add(d.currentTruck.plate.trim().toUpperCase());
      }
    });

    const activeWaiting: Truck[] = [];
    const prioWaiting: Truck[] = [];

    trucks.forEach((t) => {
      if (t.status !== 'waiting') return;
      const key = t.plate.trim().toUpperCase();
      if (seenPlates.has(key)) return;
      seenPlates.add(key);
      activeWaiting.push(t);
    });

    priorityTrucks.forEach((t) => {
      if (t.status !== 'waiting') return;
      const key = t.plate.trim().toUpperCase();
      if (seenPlates.has(key)) return;
      seenPlates.add(key);
      prioWaiting.push(t);
    });

    const activeNonSkipped = activeWaiting.filter((t) => !skippedMap[t.plate.trim().toUpperCase()]);
    const prioNonSkipped = prioWaiting.filter((t) => !skippedMap[t.plate.trim().toUpperCase()]);
    const allSkipped = [...activeWaiting, ...prioWaiting]
      .filter((t) => Boolean(skippedMap[t.plate.trim().toUpperCase()]))
      .sort(
        (a, b) =>
          (skippedMap[a.plate.trim().toUpperCase()] || 0) -
          (skippedMap[b.plate.trim().toUpperCase()] || 0)
      );

    return [...activeNonSkipped, ...prioNonSkipped, ...allSkipped];
  }, [trucks, priorityTrucks, docks, skippedOrderTick]);

  // Total waiting vehicles counted from Column H ("Sl Xe" / carCount) of sheet "Thông Tin Giao Hàng"
  const waitingQueueColHCount = useMemo(() => {
    const dockedPlates = new Set<string>();
    docks.forEach((d) => {
      if (d.currentTruck?.plate) {
        dockedPlates.add(d.currentTruck.plate.trim().toUpperCase());
      }
    });

    const seenWaitingPlates = new Set<string>();
    let total = 0;

    trucks.forEach((t) => {
      if (t.status !== 'waiting' || t.assignedDock) return;
      const plateKey = t.plate.trim().toUpperCase();
      if (!plateKey || dockedPlates.has(plateKey) || seenWaitingPlates.has(plateKey)) return;
      seenWaitingPlates.add(plateKey);
      const colHVal =
        typeof t.carCount === 'number' && !Number.isNaN(t.carCount)
          ? Math.max(0, t.carCount)
          : 1;
      total += colHVal;
    });

    return total;
  }, [trucks, docks]);

  // Call truck into dock (supports both "Thông Tin Giao Hàng" and "Ưu Tiên")
  const handleCallTruckToDock = useCallback(
    (dockIndex: number, truckId: string) => {
      const targetDock = docks[dockIndex];
      const truck =
        trucks.find((t) => t.id === truckId) ||
        priorityTrucks.find((t) => t.id === truckId);

      if (!truck || !targetDock) return;

      if (targetDock.status === 'maintenance') {
        showToast(`Cửa Dock ${targetDock.id} đang bảo trì, vui lòng chọn dock khác!`, 'warn');
        return;
      }

      if (targetDock.currentTruck) {
        showToast(
          `Cửa Dock ${targetDock.id} đang có xe ${targetDock.currentTruck.plate}. Đã giải phóng xe cũ để tiếp nhận xe ${truck.plate}!`,
          'info'
        );
      }

      const nextCallCount = (truck.callCount || 0) + 1;

      clearDismissedForPlate(truck.plate);
      const plateKey = truck.plate.trim().toUpperCase();
      if (skippedOrderRef.current[plateKey]) {
        delete skippedOrderRef.current[plateKey];
        setSkippedOrderTick((v) => v + 1);
      }

      const updatedTruck: Truck = {
        ...truck,
        status: 'moving',
        assignedDock: targetDock.id,
        dockId: targetDock.index,
        callCount: nextCallCount,
        since: Date.now(),
        unloadedPallets: 0,
        spot: null,
      };

      if (truck.sourceSheet === 'priority') {
        setPriorityTrucks((prev) => prev.map((t) => (t.id === truck.id ? updatedTruck : t)));
      } else {
        setTrucks((prev) => prev.map((t) => (t.id === truck.id ? updatedTruck : t)));
      }

      setDocks((prev) =>
        prev.map((d) =>
          d.index === dockIndex
            ? {
                ...d,
                status: 'moving',
                currentTruck: updatedTruck,
                since: Date.now(),
              }
            : d
        )
      );

      setSelectedDockId(dockIndex);
      setSelectedTruckId(null);

      // Audio Announcement (Thông báo loa tiếng Việt)
      lastAnnouncedPlateRef.current = plateKey;
      const announcement = `Mời xe ${truck.plate} vào Cửa ${targetDock.id} để giao hàng. Lần gọi thứ ${nextCallCount}!`;
      speakAnnouncement(announcement, soundEnabled);
      showToast(`Đã gọi xe ${truck.plate} vào cửa ${targetDock.id} (Lần gọi thứ ${nextCallCount})`, 'success');

      // Trigger 15-second Top-Right Notification Modal
      setActiveCallModal({
        plate: truck.plate,
        dockId: targetDock.id,
        dockIndex: targetDock.index,
        callCount: nextCallCount,
        vehicleType: VEHICLE_CONFIGS[truck.type]?.name || 'Xe Tải',
        supplier: truck.supplier,
        priority: truck.priority || (truck.sourceSheet === 'priority' ? 'Ưu tiên' : ''),
        timestamp: Date.now(),
      });

      // Sync back to Google Sheet if in live mode
      if (syncConfig.mode === 'gas_live' && syncConfig.gasWebAppUrl) {
        callTruckViaGas(syncConfig.gasWebAppUrl, truck.plate, targetDock.id);
      }

      // After 2.5s backing in, change to busy
      setTimeout(() => {
        setDocks((prev) =>
          prev.map((d) =>
            d.index === dockIndex && d.currentTruck?.id === truck.id
              ? { ...d, status: 'busy', since: Date.now() }
              : d
          )
        );
        if (truck.sourceSheet === 'priority') {
          setPriorityTrucks((prev) =>
            prev.map((t) => (t.id === truck.id ? { ...t, status: 'busy', since: Date.now() } : t))
          );
        } else {
          setTrucks((prev) =>
            prev.map((t) => (t.id === truck.id ? { ...t, status: 'busy', since: Date.now() } : t))
          );
        }
      }, 2500);
    },
    [docks, trucks, priorityTrucks, soundEnabled, showToast, syncConfig.mode, syncConfig.gasWebAppUrl, clearDismissedForPlate]
  );

  // Quick call from Sheet Manager Modal by plate & dockId string
  const handleCallTruckQuick = useCallback(
    (plate: string, dockString: string, sourceSheet?: 'active' | 'priority') => {
      const truck =
        sourceSheet === 'priority'
          ? priorityTrucks.find((t) => t.plate === plate)
          : trucks.find((t) => t.plate === plate) || priorityTrucks.find((t) => t.plate === plate);
      if (!truck) return;

      const dockIndex = findDockIndexById(dockString) ?? 0;
      handleCallTruckToDock(dockIndex, truck.id);
    },
    [trucks, priorityTrucks, handleCallTruckToDock]
  );

  // Skip a called truck and move it to the end of the waiting queue without affecting earlier spots
  const handleSkipTruckQuick = useCallback(
    (plate: string, sourceSheet?: 'active' | 'priority') => {
      const truck =
        sourceSheet === 'priority'
          ? priorityTrucks.find((t) => t.plate === plate)
          : trucks.find((t) => t.plate === plate) || priorityTrucks.find((t) => t.plate === plate);
      if (!truck) return;

      const plateKey = truck.plate.trim().toUpperCase();
      skippedOrderRef.current[plateKey] = Date.now();
      setSkippedOrderTick((v) => v + 1);

      const resetTruck: Truck = {
        ...truck,
        status: 'waiting',
        assignedDock: null,
        dockId: null,
      };

      if (truck.sourceSheet === 'priority') {
        setPriorityTrucks((prev) => prev.map((t) => (t.id === truck.id ? resetTruck : t)));
      } else {
        setTrucks((prev) => prev.map((t) => (t.id === truck.id ? resetTruck : t)));
      }

      setDocks((prev) =>
        prev.map((d) =>
          d.currentTruck?.plate === truck.plate ? { ...d, currentTruck: null, status: 'free' } : d
        )
      );

      setActiveCallModal((modal) => (modal?.plate.trim().toUpperCase() === plateKey ? null : modal));
      if (lastAnnouncedPlateRef.current === plateKey) {
        cancelAnnouncement();
        lastAnnouncedPlateRef.current = null;
      }
      showToast(`Xe ${truck.plate} đã bị bỏ qua và chuyển xuống cuối danh sách đợi`, 'warn');
    },
    [trucks, priorityTrucks, showToast]
  );

  // Move a truck from "Thông Tin Giao Hàng" into sheet "Ưu Tiên" (simulator quick action)
  const handleMoveToPriorityQuick = useCallback(
    (plate: string) => {
      const targetPlate = plate.trim().toUpperCase();
      const sourceTruck = trucks.find((t) => t.plate.trim().toUpperCase() === targetPlate);
      if (!sourceTruck) return;

      const movedTruck: Truck = {
        ...sourceTruck,
        id: `PRIO-${targetPlate}-${Date.now().toString().slice(-4)}`,
        plate: targetPlate,
        priority: 'Ưu tiên',
        sourceSheet: 'priority',
      };

      setTrucks((prev) => prev.filter((t) => t.id !== sourceTruck.id));
      setPriorityTrucks((prev) => {
        const filtered = prev.filter((t) => t.plate.trim().toUpperCase() !== targetPlate);
        return [...filtered, movedTruck];
      });

      if (movedTruck.dockId !== null && movedTruck.dockId !== undefined) {
        setDocks((prev) =>
          prev.map((d) =>
            d.index === movedTruck.dockId && d.currentTruck?.plate.trim().toUpperCase() === targetPlate
              ? { ...d, currentTruck: movedTruck }
              : d
          )
        );
      }

      showToast(`Đã chuyển xe ${targetPlate} sang sheet Ưu Tiên`, 'info');
    },
    [trucks, showToast]
  );

  // Add a truck directly into sheet "Ưu Tiên" (for simulator testing or immediate priority call)
  const handleAddPriorityTruckQuick = useCallback(
    (plate: string, typeKey: VehicleTypeKey, dockString?: string) => {
      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const timestampStr = `${String(now.getDate()).padStart(2, '0')}/${String(
        now.getMonth() + 1
      ).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(
        now.getMinutes()
      ).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

      const targetDockIndex = dockString ? findDockIndexById(dockString) : null;
      const hasDock = targetDockIndex !== null;

      const newPrioTruck: Truck = {
        id: `PRIO-${plate}-${Date.now().toString().slice(-4)}`,
        plate: plate.trim().toUpperCase(),
        type: typeKey,
        supplier: 'Ưu Tiên',
        pallets: 8,
        assignedDock: hasDock ? dockString! : null,
        dockId: hasDock ? targetDockIndex : null,
        callCount: hasDock ? 1 : undefined,
        priority: 'Ưu tiên',
        carCount: 1,
        waitingPosition: '10m',
        timestamp: timestampStr,
        checkInTime: timeStr,
        arrivalTimeMs: Date.now(),
        status: hasDock ? 'moving' : 'waiting',
        notes: '',
        sourceSheet: 'priority',
      };

      setPriorityTrucks((prev) => [...prev, newPrioTruck]);

      if (hasDock && targetDockIndex !== null) {
        clearDismissedForPlate(newPrioTruck.plate);
        const targetDock = docks[targetDockIndex];
        setDocks((prev) =>
          prev.map((d) =>
            d.index === targetDockIndex
              ? { ...d, status: 'moving', currentTruck: newPrioTruck, since: Date.now() }
              : d
          )
        );
        const announcement = `Mời xe ${newPrioTruck.plate} vào Cửa ${targetDock?.id || dockString} để giao hàng. Lần gọi thứ 1!`;
        lastAnnouncedPlateRef.current = newPrioTruck.plate.trim().toUpperCase();
        speakAnnouncement(announcement, soundEnabled);
        showToast(`Ưu Tiên: Đã gọi xe ${newPrioTruck.plate} vào cửa ${targetDock?.id || dockString}`, 'success');
        setActiveCallModal({
          plate: newPrioTruck.plate,
          dockId: targetDock?.id || dockString || 'Dock',
          dockIndex: targetDockIndex,
          callCount: 1,
          vehicleType: VEHICLE_CONFIGS[typeKey]?.name || 'Xe Tải',
          priority: 'Ưu tiên',
          timestamp: Date.now(),
        });

        setTimeout(() => {
          setDocks((prev) =>
            prev.map((d) =>
              d.index === targetDockIndex && d.currentTruck?.id === newPrioTruck.id
                ? { ...d, status: 'busy', since: Date.now() }
                : d
            )
          );
          setPriorityTrucks((prev) =>
            prev.map((t) => (t.id === newPrioTruck.id ? { ...t, status: 'busy', since: Date.now() } : t))
          );
        }, 2500);
      }
    },
    [docks, soundEnabled, showToast, clearDismissedForPlate]
  );

  // Confirm arrival / Complete unloading -> Move to Sheet "Lịch sử giao hàng"
  const handleConfirmArrivalToHistory = useCallback(
    (plate: string) => {
      const targetPlateKey = plate.trim().toUpperCase();
      const truck =
        trucks.find((t) => t.plate.trim().toUpperCase() === targetPlateKey) ||
        priorityTrucks.find((t) => t.plate.trim().toUpperCase() === targetPlateKey);
      if (!truck) return;

      recentlyConfirmedRef.current[targetPlateKey] = Date.now();
      setActiveCallModal((modal) =>
        modal && modal.plate.trim().toUpperCase() === targetPlateKey ? null : modal
      );
      if (lastAnnouncedPlateRef.current === targetPlateKey) {
        cancelAnnouncement();
        lastAnnouncedPlateRef.current = null;
      }

      const now = new Date();
      const inTimeStr = `${String(now.getDate()).padStart(2, '0')}/${String(
        now.getMonth() + 1
      ).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(
        now.getMinutes()
      ).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

      const newHistoryEntry: HistoryRowData = {
        timestamp: truck.timestamp || inTimeStr,
        plate: truck.plate,
        vehicleType: VEHICLE_CONFIGS[truck.type]?.name || 'Xe Tải 1-5 Tấn',
        callCount: truck.callCount || 1,
        dock: truck.assignedDock || '',
        notes: 'ĐÃ GIAO HÀNG',
        priority: truck.priority || (truck.sourceSheet === 'priority' ? 'Ưu tiên' : ''),
        inTime: inTimeStr,
        carCount: truck.carCount || 1,
        waitingPosition: truck.waitingPosition || '15m',
      };

      setHistoryRows((prev) => [newHistoryEntry, ...prev]);

      // Keep previously docked truck at dock during daytime (< 21:00) until a new truck is assigned;
      // after 21:00 let it drive out immediately.
      if (truck.dockId !== undefined && truck.dockId !== null) {
        const shouldClearImmediately = now.getHours() >= 21;
        setDocks((prev) =>
          prev.map((d) =>
            d.index === truck.dockId
              ? shouldClearImmediately
                ? { ...d, currentTruck: null, status: 'free' }
                : { ...d, status: 'busy' }
              : d
          )
        );
      }

      // Remove from active / priority sheet
      if (truck.sourceSheet === 'priority') {
        setPriorityTrucks((prev) => prev.filter((t) => t.id !== truck.id));
      } else {
        setTrucks((prev) => prev.filter((t) => t.id !== truck.id));
      }

      if (syncConfig.mode === 'gas_live' && syncConfig.gasWebAppUrl) {
        confirmArrivalViaGas(syncConfig.gasWebAppUrl, truck.plate);
      }
    },
    [trucks, priorityTrucks, syncConfig.mode, syncConfig.gasWebAppUrl]
  );

  // Complete unloading directly from DockScene
  const handleCompleteUnloading = (dockIndex: number) => {
    const dock = docks[dockIndex];
    if (!dock || !dock.currentTruck) return;
    handleConfirmArrivalToHistory(dock.currentTruck.plate);
  };

  const [triggerNewArrival, setTriggerNewArrival] = useState<Truck | null>(null);

  // Add new truck from registration modal (Đăng ký mới)
  const handleAddTruck = (truckData: Partial<Truck>) => {
    const newId = `TRK-${Date.now().toString().slice(-4)}`;
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(
      now.getMinutes()
    ).padStart(2, '0')}`;
    const timestampStr = `${String(now.getDate()).padStart(2, '0')}/${String(
      now.getMonth() + 1
    ).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(
      now.getMinutes()
    ).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

    const newTruck: Truck = {
      id: newId,
      plate: truckData.plate || '50H00000',
      type: truckData.type || 'small',
      supplier: truckData.supplier || 'Nhà cung cấp',
      pallets: truckData.pallets || 6,
      assignedDock: truckData.assignedDock || null,
      callCount: truckData.callCount,
      priority: truckData.priority || '',
      carCount: truckData.carCount || 1,
      waitingPosition: truckData.waitingPosition || '15m',
      timestamp: truckData.timestamp || timestampStr,
      checkInTime: truckData.checkInTime || timeStr,
      arrivalTimeMs: Date.now(),
      status: truckData.assignedDock ? 'moving' : 'waiting',
      notes: truckData.notes || '',
      spot: truckData.assignedDock ? null : Math.min(queueTrucks.length, 11),
    };

    if (truckData.assignedDock) {
      const targetDockIndex = findDockIndexById(truckData.assignedDock);
      if (targetDockIndex !== null) {
        newTruck.dockId = targetDockIndex;
        setDocks((prev) =>
          prev.map((d) =>
            d.index === targetDockIndex
              ? { ...d, status: 'busy', currentTruck: newTruck, since: Date.now() }
              : d
          )
        );
      }
    } else {
      // Trigger arrival animation driving in from the gate
      setTriggerNewArrival(newTruck);
    }

    setTrucks((prev) => [...prev, newTruck]);
  };

  // Add random simulated truck for testing
  const handleAddSimulatedTruck = () => {
    const types: VehicleTypeKey[] = ['small', 'van', 'big', 'cont'];
    const chosenType = types[Math.floor(Math.random() * types.length)];
    const platesPrefix = ['50H', '51D', '63C', '60C', '78B', '61H'];
    const rndPrefix = platesPrefix[Math.floor(Math.random() * platesPrefix.length)];
    const rndNum = `${Math.floor(10000 + Math.random() * 89999)}`;
    const plate = `${rndPrefix}${rndNum}`;
    const positions = ['10m', '15m', '20m', '24m', '25m'];
    const chosenPos = positions[Math.floor(Math.random() * positions.length)];

    handleAddTruck({
      plate,
      type: chosenType,
      carCount: Math.floor(1 + Math.random() * 3),
      waitingPosition: chosenPos,
      assignedDock: null,
    });
  };

  // Update truck from sheet table edit
  const handleUpdateTruckFromRow = (row: SheetRowData) => {
    const updater = (prev: Truck[]) =>
      prev.map((t) => {
        if (t.plate !== row.plate) return t;

        const dockId = findDockIndexById(row.dock);
        const hasDock = dockId !== null;

        return {
          ...t,
          assignedDock: hasDock ? row.dock : null,
          dockId: hasDock ? dockId : null,
          status: hasDock ? ('busy' as const) : ('waiting' as const),
          notes: row.notes,
          callCount: Number(row.callCount) || t.callCount,
        };
      });

    if (row.sourceSheet === 'priority') {
      setPriorityTrucks(updater);
    } else {
      setTrucks(updater);
    }
  };

  // Delete truck row
  const handleDeleteTruckRow = (plate: string, sourceSheet?: 'active' | 'priority') => {
    if (sourceSheet === 'priority') {
      setPriorityTrucks((prev) => prev.filter((t) => t.plate !== plate));
    } else {
      setTrucks((prev) => prev.filter((t) => t.plate !== plate));
    }
    setDocks((prev) =>
      prev.map((d) => (d.currentTruck?.plate === plate ? { ...d, currentTruck: null, status: 'free' } : d))
    );
    showToast(`Đã xóa xe ${plate} khỏi bảng`, 'info');
  };

  // Reset to initial sample data
  const handleResetSampleData = () => {
    setTrucks(INITIAL_TRUCKS.map((t) => ({ ...t, sourceSheet: 'active' })));
    setPriorityTrucks([]);
    setHistoryRows(INITIAL_HISTORY_ROWS);
    setDocks(INITIAL_DOCKS);
    skippedOrderRef.current = {};
    setSkippedOrderTick((v) => v + 1);
    showToast('Đã thiết lập lại dữ liệu mẫu theo Google Sheet', 'success');
  };

  const availableDockIds = docks.filter((d) => d.status === 'free').map((d) => d.id);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-gradient-to-b from-[#d5e4f3] via-[#e2ecf7] to-[#eaf1f9] text-slate-800 font-sans select-none flex flex-col">
      {/* Toast Notification Alert */}
      {toastMessage && (
        <div className="fixed top-4 left-4 z-50 flex items-center gap-2.5 px-4 py-2 bg-slate-900 text-white rounded-xl shadow-xl border border-slate-700 animate-in fade-in slide-in-from-top-2 duration-200">
          {toastMessage.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
          {toastMessage.type === 'warn' && <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />}
          {toastMessage.type === 'info' && <Info className="w-4 h-4 text-purple-400 shrink-0" />}
          <span className="text-xs font-semibold">{toastMessage.text}</span>
          <button
            onClick={() => setToastMessage(null)}
            className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white ml-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Top-Right Notification Modal for Called Truck (Auto-closes after 15s) */}
      {activeCallModal && (
        <aside
          key={`call-modal-${activeCallModal.timestamp}`}
          className="group fixed top-4 right-4 z-50 w-[300px] md:w-[340px] xl:w-[380px] max-w-[90vw] animate-in slide-in-from-top-3 fade-in duration-300"
          role="dialog"
          aria-label="Thông báo gọi xe vào dock"
        >
          <div className="relative overflow-hidden rounded-[28px] bg-[#111111] border-2 border-[#e65c00]/85 px-6 pt-9 pb-10 min-h-[340px] md:min-h-[380px] xl:min-h-[420px] shadow-[0_24px_60px_rgba(0,0,0,0.7)] flex flex-col items-center justify-between gap-7">
            {/* Subtle hover-only close button */}
            <button
              onClick={() => setActiveCallModal(null)}
              className="absolute top-3 right-3 p-1.5 text-zinc-500 hover:text-white rounded-lg hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity"
              title="Đóng thông báo"
            >
              <X className="w-5 h-5" />
            </button>

            {/* License Plate (Vivid Safety Orange, Ultra Bold 900) */}
            <div
              className="w-full text-center text-[38px] md:text-[44px] xl:text-[48px] leading-none font-black text-[#ff6b00] tracking-wide tabular-nums whitespace-nowrap select-text pt-1"
              style={{ fontFamily: "'Montserrat', 'Plus Jakarta Sans', system-ui, sans-serif" }}
            >
              {activeCallModal.plate}
            </div>

            {/* Dock ID Inner Card (Pure White Massive Ultra Bold 900 Text on Dark Charcoal) */}
            <div className="flex-1 w-full rounded-[20px] bg-[#1a1a1a] border border-white/10 py-10 md:py-12 px-5 flex items-center justify-center">
              <div
                className="text-[110px] md:text-[128px] xl:text-[144px] leading-none font-black text-white tracking-tight tabular-nums whitespace-nowrap"
                style={{ fontFamily: "'Montserrat', 'Plus Jakarta Sans', system-ui, sans-serif" }}
              >
                {activeCallModal.dockId}
              </div>
            </div>

            {/* Subtle 15-second countdown progress bar */}
            <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-white/5 overflow-hidden">
              <div
                className="h-full bg-[#ff6b00]"
                style={{
                  animation: 'shrinkWidth 15s linear forwards',
                }}
              />
            </div>
          </div>
        </aside>
      )}

      {/* Ultra-subtle hidden setting trigger (invisible on TV, press S or hover top-right) */}
      <button
        onClick={() => setIsSheetModalOpen(true)}
        className="fixed top-3 right-3 z-30 p-2 rounded-lg text-slate-400 opacity-0 hover:opacity-75 focus:opacity-75 transition-opacity pointer-events-auto"
        title="Cài đặt kết nối Google Sheets (Phím tắt: S)"
      >
        ⚙️
      </button>

      {/* Main Full-Screen 3D Isometric Dock Scene */}
      <main className="w-full h-full flex-1 flex flex-col overflow-hidden">
        <DockScene
          docks={docks}
          queueTrucks={queueTrucks}
          waitingQueueCount={waitingQueueColHCount}
          selectedDockId={selectedDockId}
          selectedTruckId={selectedTruckId}
          onSelectDock={(idx) => setSelectedDockId(idx)}
          onSelectTruck={(id) => setSelectedTruckId(id)}
          onCallTruckToDock={handleCallTruckToDock}
          onCompleteUnload={handleCompleteUnloading}
          triggerNewArrival={triggerNewArrival}
        />
      </main>

      {/* Bottom 60px Marquee Ticker (text begins emerging at Stall 14 / ô 14 ~56% from left, right edge fades 60px leftward) */}
      <div
        className="fixed bottom-0 left-0 z-30 h-[60px] w-[56%] max-w-full overflow-hidden bg-slate-950/90 backdrop-blur-md border-t-2 border-[#ff6b00]/80 shadow-[0_-6px_24px_rgba(15,23,42,0.35)] flex items-center pointer-events-none marquee-fade-right"
        role="region"
        aria-label="Thông báo hướng dẫn nhà cung cấp"
      >
        <div
          className="inline-block pl-[100%] whitespace-nowrap text-[20px] md:text-[22px] font-bold text-slate-100 tracking-wide will-change-transform"
          style={{ animation: 'marqueeTicker 30s linear infinite' }}
        >
          <span className="text-amber-400 font-extrabold mr-1.5">⚠</span>
          <span>
            Quý Nhà Cung Cấp vui lòng thực hiện đăng ký xếp tài giao hàng theo các bước sau:{' '}
          </span>
          <span className="text-[#ff8c2e] font-extrabold">B1.</span> Quét mã QR Code{' '}
          <span className="text-slate-400 mx-1">-</span>
          <span className="text-[#ff8c2e] font-extrabold">B2.</span> Nhập thông tin{' '}
          <span className="text-slate-400 mx-1">-</span>
          <span className="text-[#ff8c2e] font-extrabold">B3.</span> Đợi thông báo{' '}
          <span className="text-slate-400 mx-1">-</span>
          <span className="text-[#ff8c2e] font-extrabold">B4.</span> Đến đúng cửa đã thông báo để giao hàng{' '}
          <span className="text-slate-400 mx-1">-</span>
          <span className="text-slate-300 font-semibold">© Copyright by Nguyễn Tiến Hưng</span>
        </div>
      </div>

      {/* Google Sheets & Apps Script Modal */}
      <SheetManagerModal
        isOpen={isSheetModalOpen}
        onClose={() => setIsSheetModalOpen(false)}
        trucks={trucks}
        priorityTrucks={priorityTrucks}
        historyRows={historyRows}
        config={syncConfig}
        gasHasPrioritySupport={gasHasPrioritySupport}
        onUpdateConfig={setSyncConfig}
        onUpdateTruckFromRow={handleUpdateTruckFromRow}
        onDeleteTruckRow={handleDeleteTruckRow}
        onCallTruckQuick={handleCallTruckQuick}
        onSkipTruckQuick={handleSkipTruckQuick}
        onMoveToPriorityQuick={handleMoveToPriorityQuick}
        onAddPriorityTruckQuick={handleAddPriorityTruckQuick}
        onConfirmArrivalToHistory={handleConfirmArrivalToHistory}
        onResetSampleData={handleResetSampleData}
        onSyncGasNow={syncWithGasLive}
      />

      {/* Add Truck Registration Modal */}
      <AddTruckModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAddTruck={handleAddTruck}
        availableDocks={availableDockIds}
      />
    </div>
  );
}
