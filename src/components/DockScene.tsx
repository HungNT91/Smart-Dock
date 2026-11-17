import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { Dock, Truck } from '../types';
import {
  isoPoint,
  renderPolygon3D,
  renderBox3D,
  generateTruckFaces,
  VEHICLE_CONFIGS,
} from '../utils/isoMath';
import {
  buildRouteToDock,
  buildGateToDock,
  buildLeaveDock,
  buildEnterQueue,
  buildDockToQueue,
  TrajectoryPoint,
  LANE_Y,
} from '../utils/vehicleAnimationEngine';
import { WeatherOverlay, WeatherMode } from './WeatherOverlay';

interface ActiveTruckState {
  id: string;
  truck: Truck;
  pose: { x: number; y: number; th: number };
  opacity: number;
  trajectory: TrajectoryPoint[] | null;
  trajStartTime: number | null;
  mode: 'docked' | 'waiting' | 'moving_to_dock' | 'leaving_dock' | 'entering_queue';
  hazardBlinking: boolean;
  spot?: number;
  assignedDockIndex?: number;
  onFinish?: () => void;
}

interface DockSceneProps {
  docks: Dock[];
  queueTrucks: Truck[];
  waitingQueueCount?: number;
  selectedDockId: number | null;
  selectedTruckId: string | null;
  onSelectDock: (dockIndex: number) => void;
  onSelectTruck: (truckId: string | null) => void;
  onCallTruckToDock: (dockIndex: number, truckId: string) => void;
  onCompleteUnload: (dockIndex: number) => void;
  triggerNewArrival?: Truck | null;
}

// Helper to compute daily pseudo-random weather based on calendar day and time block
const computeDailyWeather = (): WeatherMode => {
  const now = new Date();
  const dayKey = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
  const hourBlock = Math.floor((now.getHours() * 60 + now.getMinutes()) / 45); // shifts every 45 mins
  const hash = Math.sin(dayKey * 9301 + hourBlock * 49297 + 233280) * 10000;
  const rand = hash - Math.floor(hash);
  if (rand < 0.42) return 'rain';
  if (rand < 0.78) return 'dust';
  return 'clear';
};

export const DockScene: React.FC<DockSceneProps> = ({
  docks,
  queueTrucks,
  waitingQueueCount,
  selectedDockId,
  selectedTruckId,
  onSelectDock,
  onSelectTruck,
  onCallTruckToDock,
  onCompleteUnload,
  triggerNewArrival,
}) => {
  const [weatherMode, setWeatherMode] = useState<WeatherMode>(() => computeDailyWeather());
  const vehiclesRef = useRef<Map<string, ActiveTruckState>>(new Map());

  // Automatic weather engine: updates automatically each day and randomly transitions periodically
  useEffect(() => {
    // Set daily computed weather
    setWeatherMode(computeDailyWeather());

    // Randomly evolve atmospheric weather every 2.5 minutes while applet is running
    const interval = setInterval(() => {
      setWeatherMode((prev) => {
        const modes: WeatherMode[] = ['rain', 'dust', 'clear'];
        const otherModes = modes.filter((m) => m !== prev);
        const next = otherModes[Math.floor(Math.random() * otherModes.length)];
        return next;
      });
    }, 150000);

    return () => clearInterval(interval);
  }, []);
  const [, setRenderTrigger] = useState(0);
  const rafIdRef = useRef<number | null>(null);

  // Sync trucks with state
  const syncVehiclesWithState = useCallback(() => {
    const vMap = vehiclesRef.current;
    const normPlate = (p?: string | null) => String(p || '').trim().toUpperCase();

    // 1. Sync docked trucks
    docks.forEach((dock) => {
      const truck = dock.currentTruck;
      if (truck) {
        const truckPlate = normPlate(truck.plate);
        const existingEntry =
          vMap.get(truck.id) ||
          Array.from(vMap.values()).find(
            (v) => normPlate(v.truck.plate) === truckPlate && v.mode !== 'leaving_dock'
          );
        const existing = existingEntry;
        const cfg = VEHICLE_CONFIGS[truck.type] || VEHICLE_CONFIGS.small;
        const L = cfg.lengthBody + cfg.lengthCab;
        const dockedPose = { x: dock.cx, y: 8 + L / 2, th: Math.PI / 2 };

        if (!existing) {
          if (truck.status === 'moving') {
            // Newly called from outside / sheet "Ưu Tiên" -> drive in from warehouse gate into the dock
            const gateRoutePts = buildGateToDock(truck.type, dock.cx, 0);
            const activeVehicle: ActiveTruckState = {
              id: truck.id,
              truck,
              pose: { x: 1060, y: LANE_Y, th: Math.PI },
              opacity: 1,
              trajectory: gateRoutePts,
              trajStartTime: performance.now(),
              mode: 'moving_to_dock',
              hazardBlinking: false,
              assignedDockIndex: dock.index,
              onFinish: () => {
                activeVehicle.mode = 'docked';
                activeVehicle.hazardBlinking = false;
                activeVehicle.trajectory = null;
                activeVehicle.pose = dockedPose;
              },
            };
            vMap.set(truck.id, activeVehicle);
          } else {
            vMap.set(truck.id, {
              id: truck.id,
              truck,
              pose: dockedPose,
              opacity: 1,
              trajectory: null,
              trajStartTime: null,
              mode: 'docked',
              hazardBlinking: false,
              assignedDockIndex: dock.index,
            });
          }
        } else if (existing.mode === 'waiting' || existing.mode === 'entering_queue') {
          const useGate = existing.mode === 'entering_queue' || existing.pose.y <= LANE_Y + 45;
          const routePts = useGate
            ? buildGateToDock(existing.truck.type, dock.cx, 0)
            : buildRouteToDock(
                existing.truck.type,
                existing.pose.x,
                existing.pose.y,
                dock.cx,
                0
              );
          if (existing.id !== truck.id) {
            vMap.delete(existing.id);
            existing.id = truck.id;
            vMap.set(truck.id, existing);
          }
          if (useGate) {
            existing.pose = { x: 1060, y: LANE_Y, th: Math.PI };
          }
          existing.trajectory = routePts;
          existing.trajStartTime = performance.now();
          existing.mode = 'moving_to_dock';
          existing.hazardBlinking = false;
          existing.assignedDockIndex = dock.index;
          existing.truck = truck;
          existing.onFinish = () => {
            existing.mode = 'docked';
            existing.hazardBlinking = false;
            existing.trajectory = null;
            existing.pose = dockedPose;
          };
        } else if (existing.mode === 'moving_to_dock') {
          if (existing.id !== truck.id) {
            vMap.delete(existing.id);
            existing.id = truck.id;
            vMap.set(truck.id, existing);
          }
          if (existing.assignedDockIndex !== dock.index) {
            const routePts = buildGateToDock(existing.truck.type, dock.cx, 0);
            existing.pose = { x: 1060, y: LANE_Y, th: Math.PI };
            existing.trajectory = routePts;
            existing.trajStartTime = performance.now();
            existing.assignedDockIndex = dock.index;
            existing.onFinish = () => {
              existing.mode = 'docked';
              existing.hazardBlinking = false;
              existing.trajectory = null;
              existing.pose = dockedPose;
            };
          }
          existing.truck = truck;
        } else if (existing.mode === 'docked') {
          if (existing.id !== truck.id) {
            vMap.delete(existing.id);
            existing.id = truck.id;
            vMap.set(truck.id, existing);
          }
          if (existing.assignedDockIndex !== dock.index) {
            existing.pose = dockedPose;
          }
          existing.assignedDockIndex = dock.index;
          existing.truck = truck;
          existing.hazardBlinking = false;
        }
      }
    });

    // 2. Detect departed trucks from docks or skipped trucks returning to queue
    vMap.forEach((v, vId) => {
      if ((v.mode === 'docked' || v.mode === 'moving_to_dock') && v.assignedDockIndex !== undefined) {
        const dock = docks[v.assignedDockIndex];
        const vPlate = normPlate(v.truck.plate);
        if (
          !dock ||
          !dock.currentTruck ||
          (dock.currentTruck.id !== vId && normPlate(dock.currentTruck.plate) !== vPlate)
        ) {
          // Check if this truck is now in queueTrucks (skipped truck returning to queue)
          const queueIdx = queueTrucks.findIndex(
            (t) => t.id === vId || normPlate(t.plate) === vPlate
          );
          if (queueIdx !== -1) {
            const cfg = VEHICLE_CONFIGS[v.truck.type] || VEHICLE_CONFIGS.small;
            const L = cfg.lengthBody + cfg.lengthCab;
            const targetSpot = queueIdx;
            const targetX = 30 + 58 * Math.min(targetSpot, 15);
            const waitPose = {
              x: targetX,
              y: 244 + L / 2,
              th: -Math.PI / 2,
            };

            const pts = buildDockToQueue(v.truck.type, v.pose, waitPose);
            v.trajectory = pts;
            v.trajStartTime = performance.now();
            v.mode = 'entering_queue';
            v.assignedDockIndex = undefined;
            v.spot = targetSpot;
            v.hazardBlinking = false;
            v.opacity = 1;
            v.onFinish = () => {
              v.mode = 'waiting';
              v.trajectory = null;
              v.pose = waitPose;
            };
          } else {
            // Normal departed truck: drives out of warehouse
            const leavePts = buildLeaveDock(v.truck.type, v.pose);
            v.trajectory = leavePts;
            v.trajStartTime = performance.now();
            v.mode = 'leaving_dock';
            v.hazardBlinking = false;
            v.onFinish = () => {
              vMap.delete(vId);
            };
          }
        }
      }
    });

    // 3. Clean up waiting vehicles that were removed from queue and are not in dock
    vMap.forEach((v, vId) => {
      if (v.mode === 'waiting') {
        const vPlate = normPlate(v.truck.plate);
        const stillInQueue = queueTrucks.some(
          (t) => t.id === vId || normPlate(t.plate) === vPlate
        );
        const movingToDock = docks.some(
          (d) => d.currentTruck?.id === vId || normPlate(d.currentTruck?.plate) === vPlate
        );
        if (!stillInQueue && !movingToDock) {
          vMap.delete(vId);
        }
      }
    });

    // 4. Sync waiting queue trucks with automatic forward shift animation
    queueTrucks.forEach((truck, idx) => {
      const truckPlate = normPlate(truck.plate);
      const existing =
        vMap.get(truck.id) ||
        Array.from(vMap.values()).find(
          (v) => normPlate(v.truck.plate) === truckPlate && v.mode !== 'leaving_dock'
        );
      if (existing && existing.id !== truck.id) {
        vMap.delete(existing.id);
        existing.id = truck.id;
        vMap.set(truck.id, existing);
      }

      const targetSpot = idx; // Target spot in line: 0, 1, 2, ...
      const cfg = VEHICLE_CONFIGS[truck.type] || VEHICLE_CONFIGS.small;
      const L = cfg.lengthBody + cfg.lengthCab;
      const targetX = 30 + 58 * Math.min(targetSpot, 15);
      const waitPose = {
        x: targetX,
        y: 244 + L / 2,
        th: -Math.PI / 2,
      };

      // If truck is currently animating its return from dock to queue, preserve it
      if (existing && existing.mode === 'entering_queue') {
        existing.truck = truck;
        existing.spot = targetSpot;
        return;
      }

      if (!existing) {
        vMap.set(truck.id, {
          id: truck.id,
          truck,
          pose: waitPose,
          opacity: 1,
          trajectory: null,
          trajStartTime: null,
          mode: 'waiting',
          hazardBlinking: false,
          spot: targetSpot,
        });
      } else if (existing.mode === 'waiting') {
        existing.truck = truck;
        // If spot changed (earlier truck was called to dock), smoothly roll forward to the new spot!
        if (existing.spot !== targetSpot) {
          const startX = existing.pose.x;
          const endX = targetX;
          const dist = Math.abs(endX - startX);

          if (dist > 3) {
            const duration = Math.min(1.4, Math.max(0.65, dist / 60));
            const pts: TrajectoryPoint[] = [];
            const steps = 16;
            for (let k = 0; k <= steps; k++) {
              const f = k / steps;
              const ease = f < 0.5 ? 2 * f * f : -1 + (4 - 2 * f) * f;
              pts.push({
                t: f * duration,
                x: startX + (endX - startX) * ease,
                y: waitPose.y,
                th: -Math.PI / 2,
              });
            }
            existing.trajectory = pts;
            existing.trajStartTime = performance.now();
            existing.spot = targetSpot;
            existing.hazardBlinking = false;
            existing.onFinish = () => {
              existing.pose = waitPose;
              existing.trajectory = null;
              existing.hazardBlinking = false;
            };
          } else {
            existing.spot = targetSpot;
            existing.pose.x = targetX;
          }
        }
      }
    });
  }, [docks, queueTrucks]);

  useEffect(() => {
    syncVehiclesWithState();
  }, [syncVehiclesWithState]);

  // Handle Arrival Animation
  const lastArrivalIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!triggerNewArrival || triggerNewArrival.id === lastArrivalIdRef.current) return;
    lastArrivalIdRef.current = triggerNewArrival.id;

    const truck = triggerNewArrival;
    const vMap = vehiclesRef.current;
    const spot = truck.spot ?? 0;
    const cfg = VEHICLE_CONFIGS[truck.type] || VEHICLE_CONFIGS.small;
    const L = cfg.lengthBody + cfg.lengthCab;
    const targetPose = {
      x: 30 + 58 * Math.min(spot, 15),
      y: 244 + L / 2,
      th: -Math.PI / 2,
    };

    const pts = buildEnterQueue(truck.type, targetPose, 0);

    const vehicleState: ActiveTruckState = {
      id: truck.id,
      truck,
      pose: { x: 1060, y: LANE_Y, th: Math.PI },
      opacity: 1,
      trajectory: pts,
      trajStartTime: performance.now(),
      mode: 'entering_queue',
      hazardBlinking: true,
      spot,
      onFinish: () => {
        vehicleState.mode = 'waiting';
        vehicleState.hazardBlinking = false;
        vehicleState.trajectory = null;
        vehicleState.pose = targetPose;
      },
    };

    vMap.set(truck.id, vehicleState);
  }, [triggerNewArrival]);

  // Public method called when calling a truck to dock
  const animateCallTruckToDock = useCallback(
    (dockIndex: number, truckId: string) => {
      const vMap = vehiclesRef.current;
      const targetDock = docks[dockIndex];
      const callingTruck = vMap.get(truckId);

      if (!targetDock || !callingTruck) {
        onCallTruckToDock(dockIndex, truckId);
        return;
      }

      const hadExistingTruck = !!targetDock.currentTruck;
      const existingTruckId = targetDock.currentTruck?.id;

      if (hadExistingTruck && existingTruckId) {
        const existingVehicle = vMap.get(existingTruckId);
        if (existingVehicle) {
          const leavePts = buildLeaveDock(existingVehicle.truck.type, existingVehicle.pose);
          existingVehicle.trajectory = leavePts;
          existingVehicle.trajStartTime = performance.now();
          existingVehicle.mode = 'leaving_dock';
          existingVehicle.hazardBlinking = true;
          existingVehicle.onFinish = () => {
            vMap.delete(existingTruckId);
          };
        }
      }

      const delaySec = hadExistingTruck ? 1.2 : 0;
      const routePts = buildRouteToDock(
        callingTruck.truck.type,
        callingTruck.pose.x,
        callingTruck.pose.y,
        targetDock.cx,
        delaySec
      );

      callingTruck.trajectory = routePts;
      callingTruck.trajStartTime = performance.now();
      callingTruck.mode = 'moving_to_dock';
      callingTruck.hazardBlinking = true;
      callingTruck.assignedDockIndex = dockIndex;

      callingTruck.onFinish = () => {
        const cfg = VEHICLE_CONFIGS[callingTruck.truck.type] || VEHICLE_CONFIGS.small;
        const L = cfg.lengthBody + cfg.lengthCab;
        callingTruck.mode = 'docked';
        callingTruck.hazardBlinking = false;
        callingTruck.trajectory = null;
        callingTruck.pose = { x: targetDock.cx, y: 8 + L / 2, th: Math.PI / 2 };
      };

      onCallTruckToDock(dockIndex, truckId);
    },
    [docks, onCallTruckToDock]
  );

  // RAF loop for trucks
  useEffect(() => {
    let active = true;

    const frameStep = (now: number) => {
      if (!active) return;

      const vMap = vehiclesRef.current;
      vMap.forEach((v) => {
        if (v.trajectory && v.trajStartTime !== null) {
          const elapsedSec = (now - v.trajStartTime) / 1000;
          const pts = v.trajectory;
          const totalDuration = pts[pts.length - 1].t;

          if (elapsedSec >= totalDuration) {
            const last = pts[pts.length - 1];
            v.pose = { x: last.x, y: last.y, th: last.th };
            v.trajectory = null;
            v.trajStartTime = null;
            if (v.onFinish) v.onFinish();
          } else {
            let i = 0;
            while (i < pts.length - 2 && pts[i + 1].t <= elapsedSec) {
              i++;
            }
            const a = pts[i];
            const b = pts[i + 1];
            const f = b.t > a.t ? (elapsedSec - a.t) / (b.t - a.t) : 1;
            v.pose = {
              x: a.x + (b.x - a.x) * f,
              y: a.y + (b.y - a.y) * f,
              th: a.th + (b.th - a.th) * f,
            };

            if (v.mode === 'leaving_dock') {
              v.opacity = Math.max(0, Math.min(1, (totalDuration - elapsedSec) / (totalDuration * 0.3)));
            }
          }
        }
      });

      setRenderTrigger((prev) => prev + 1);
      rafIdRef.current = requestAnimationFrame(frameStep);
    };

    rafIdRef.current = requestAnimationFrame(frameStep);

    return () => {
      active = false;
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    };
  }, []);

  // Pre-generate Warehouse Logistics Facility Scenery (Clean, without forklifts or pallets):
  // - Warehouse interior with warm illuminated floor and safety lanes
  // - Concrete apron with clean division joints
  // - High-quality pastel periwinkle-blue roadway with center dashed line, borders & directional arrows
  // - 16 Clean waiting stalls with stenciled numbers and wheel stops
  // - Landscaped green perimeter with miniature 3D trees & floodlight poles
  // - Security Guardhouse with boom barrier gate, CCTV tower & speed limit sign
  const staticSceneSvg = useMemo(() => {
    let bg = '';

    // 0. Warehouse Interior (Y = -120 to 0) - Clean illuminated warehouse interior floor
    bg += renderPolygon3D(
      [
        [-40, -120, 0],
        [1060, -120, 0],
        [1060, 0, 0],
        [-40, 0, 0],
      ],
      '#fef3c7',
      '#fde68a'
    );
    // Yellow interior safety lanes
    for (let ix = 20; ix <= 980; ix += 60) {
      const [l1x, l1y] = isoPoint(ix, -120, 0.2);
      const [l2x, l2y] = isoPoint(ix, 0, 0.2);
      bg += `<line x1="${l1x}" y1="${l1y}" x2="${l2x}" y2="${l2y}" stroke="#f59e0b" stroke-width="1.5" stroke-dasharray="6 4" stroke-opacity="0.6"/>`;
    }

    // 1. Concrete Dock Apron (0 to 180 Y)
    bg += renderPolygon3D(
      [
        [-40, 0, 0],
        [1060, 0, 0],
        [1060, 180, 0],
        [-40, 180, 0],
      ],
      '#f8fafc',
      '#e2e8f0'
    );
    // Concrete expansion joints
    for (let x = 0; x <= 1040; x += 116) {
      const [p1x, p1y] = isoPoint(x, 0, 0.2);
      const [p2x, p2y] = isoPoint(x, 180, 0.2);
      bg += `<line x1="${p1x}" y1="${p1y}" x2="${p2x}" y2="${p2y}" stroke="#cbd5e1" stroke-width="1.2" stroke-opacity="0.8"/>`;
    }

    // 2. Asphalt Roadway Tarmac (180 to 240 Y) - High quality pastel periwinkle blue
    bg += renderPolygon3D(
      [
        [-40, 180, 0],
        [1060, 180, 0],
        [1060, 240, 0],
        [-40, 240, 0],
      ],
      '#dbe6f4',
      '#cbd5e1'
    );

    // Pure White Dashed Center Lane Line
    const [cL1x, cL1y] = isoPoint(-40, 210, 0.3);
    const [cL2x, cL2y] = isoPoint(1060, 210, 0.3);
    bg += `<polyline fill="none" stroke="#ffffff" stroke-width="3" stroke-dasharray="16 12" stroke-linecap="round" points="${cL1x},${cL1y} ${cL2x},${cL2y}"/>`;

    // Curb edge lines
    const [e1x, e1y] = isoPoint(-40, 181, 0.3);
    const [e2x, e2y] = isoPoint(1060, 181, 0.3);
    bg += `<polyline fill="none" stroke="#ffffff" stroke-width="2.5" points="${e1x},${e1y} ${e2x},${e2y}"/>`;

    const [e3x, e3y] = isoPoint(-40, 239, 0.3);
    const [e4x, e4y] = isoPoint(1060, 239, 0.3);
    bg += `<polyline fill="none" stroke="#ffffff" stroke-width="2.5" points="${e3x},${e3y} ${e4x},${e4y}"/>`;

    // Directional White Arrows on Road
    [160, 480, 800].forEach((arrX) => {
      const [ax1, ay1] = isoPoint(arrX, 210, 0.4);
      const [ax2, ay2] = isoPoint(arrX - 25, 210, 0.4);
      const [ah1, ah2] = isoPoint(arrX - 16, 204, 0.4);
      const [ah3, ah4] = isoPoint(arrX - 16, 216, 0.4);
      bg += `<line x1="${ax1}" y1="${ay1}" x2="${ax2}" y2="${ay2}" stroke="#ffffff" stroke-width="3" stroke-linecap="round"/>`;
      bg += `<line x1="${ax2}" y1="${ay2}" x2="${ah1}" y2="${ah2}" stroke="#ffffff" stroke-width="3" stroke-linecap="round"/>`;
      bg += `<line x1="${ax2}" y1="${ay2}" x2="${ah3}" y2="${ah4}" stroke="#ffffff" stroke-width="3" stroke-linecap="round"/>`;
    });

    // Pedestrian Zebra Safety Crossing
    for (let py = 184; py <= 236; py += 7) {
      const [zx1, zy1] = isoPoint(500, py, 0.3);
      const [zx2, zy2] = isoPoint(530, py, 0.3);
      bg += `<line x1="${zx1}" y1="${zy1}" x2="${zx2}" y2="${zy2}" stroke="#ffffff" stroke-width="3.5" stroke-opacity="0.9"/>`;
    }

    // 3. Staging / Waiting Parking Lot (240 to 410 Y)
    bg += renderPolygon3D(
      [
        [-40, 240, 0],
        [1060, 240, 0],
        [1060, 410, 0],
        [-40, 410, 0],
      ],
      '#e6eef8',
      '#cbd5e1'
    );

    // 16 Clean Waiting Stalls
    for (let k = 0; k <= 16; k++) {
      const [sx, sy] = isoPoint(k * 58, 242, 0.3);
      const [ex, ey] = isoPoint(k * 58, 395, 0.3);
      bg += `<polyline fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" points="${sx},${sy} ${ex},${ey}"/>`;

      if (k < 16) {
        const stallMidX = k * 58 + 29;
        // Wheel stop barrier
        bg += renderBox3D(stallMidX - 16, 385, 0, 32, 5, 4, '#ffffff', '#cbd5e1', '#0d9488');
        // Stenciled number
        const numStr = (k + 1) < 10 ? `0${k + 1}` : `${k + 1}`;
        const [numX, numY] = isoPoint(stallMidX, 360, 0.4);
        bg += `<text x="${numX}" y="${numY}" text-anchor="middle" font-size="11" font-weight="800" fill="#64748b" font-family="'JetBrains Mono', monospace">${numStr}</text>`;
      }
    }

    // 4. Landscaped Green Lawn & Perimeter Trees (Y = 410 to 460)
    bg += renderPolygon3D(
      [
        [-40, 410, 0],
        [1060, 410, 0],
        [1060, 460, 0],
        [-40, 460, 0],
      ],
      '#86efac',
      '#4ade80'
    );
    // Concrete Curb dividing parking lot and lawn
    bg += renderBox3D(-40, 408, 0, 1100, 3, 4, '#e2e8f0', '#cbd5e1', '#94a3b8');

    // Miniature 3D Isometric Trees along perimeter lawn
    for (let tx = 10; tx <= 1020; tx += 95) {
      bg += renderBox3D(tx - 1.5, 435, 0, 3, 3, 14, '#78350f', '#451a03', '#451a03');
      bg += renderBox3D(tx - 9, 427, 14, 18, 18, 10, '#22c55e', '#16a34a', '#15803d');
      bg += renderBox3D(tx - 6, 430, 24, 12, 12, 9, '#4ade80', '#22c55e', '#16a34a');
      bg += renderBox3D(tx - 3, 433, 33, 6, 6, 7, '#86efac', '#4ade80', '#22c55e');
    }

    // High-Mast Industrial Floodlight Poles
    [60, 520, 960].forEach((lx) => {
      bg += renderBox3D(lx - 2, 237, 0, 4, 4, 3, '#94a3b8', '#64748b', '#475569');
      bg += renderBox3D(lx - 1, 238, 3, 2, 2, 60, '#cbd5e1', '#94a3b8', '#64748b');
      bg += renderBox3D(lx - 4, 236, 63, 8, 6, 3, '#f59e0b', '#d97706', '#b45309');
      const [flX, flY] = isoPoint(lx, 239, 64);
      bg += `<circle cx="${flX}" cy="${flY}" r="4" fill="#fef08a" opacity="0.9"/>`;
    });

    // 5. Security Guardhouse & Gate Barrier
    bg += renderBox3D(995, 175, 0, 24, 28, 26, '#ffffff', '#e2e8f0', '#0d9488');
    bg += renderBox3D(993, 173, 26, 28, 32, 3, '#0d9488', '#0f766e', '#115e59');
    bg += renderBox3D(996, 177, 11, 22, 1, 11, '#0f172a', '#1e293b', '#93c5fd');
    bg += renderBox3D(996, 177, 11, 1, 24, 11, '#0f172a', '#1e293b', '#93c5fd');

    // Automatic Boom Barrier Arm
    bg += renderBox3D(1026, 206, 0, 5, 5, 14, '#ef4444', '#dc2626', '#b91c1c');
    bg += renderBox3D(995, 207.5, 12, 32, 2, 2, '#ffffff', '#ef4444', '#ef4444');

    // CCTV Camera on Pole
    bg += renderBox3D(994, 174, 29, 2, 2, 10, '#64748b', '#475569', '#334155');
    bg += renderBox3D(993, 172, 39, 4, 6, 3, '#0f172a', '#1e293b', '#334155');
    const [cctvX, cctvY] = isoPoint(995, 172, 40);
    bg += `<circle cx="${cctvX}" cy="${cctvY}" r="1.5" fill="#22c55e" class="animate-pulse"/>`;

    // Road Sign: "TỐC ĐỘ 10 KM/H"
    bg += renderBox3D(980, 238, 0, 1.5, 1.5, 20, '#64748b', '#475569', '#334155');
    const [signX, signY] = isoPoint(980, 238, 25);
    bg += `<circle cx="${signX}" cy="${signY}" r="7" fill="#ffffff" stroke="#ef4444" stroke-width="2"/>`;
    bg += `<text x="${signX}" y="${signY + 2.5}" text-anchor="middle" font-size="6" font-weight="900" fill="#0f172a">10</text>`;

    // Waiting Queue Signpost Column (beside Stall 01 at waiting yard edge)
    bg += renderBox3D(-32, 301, 0, 8, 8, 5, '#cbd5e1', '#94a3b8', '#64748b');
    bg += renderBox3D(-29.5, 303.5, 5, 3, 3, 81, '#94a3b8', '#64748b', '#475569');
    bg += renderBox3D(-30.5, 302.5, 84, 5, 5, 3, '#475569', '#334155', '#1e293b');

    // 6. Warehouse Modern Facade & Roof
    let wall = '';
    wall += renderBox3D(-20, -18, 0, 1080, 18, 105, '#f8fafc', '#e2e8f0', '#ffffff');

    // Horizontal architectural panel seams
    for (let wz = 20; wz <= 100; wz += 20) {
      wall += renderPolygon3D(
        [
          [-20, 0, wz],
          [1060, 0, wz],
          [1060, 0, wz + 1],
          [-20, 0, wz + 1],
        ],
        '#cbd5e1'
      );
    }

    // Modern Teal Roof Parapet
    wall += renderPolygon3D(
      [
        [-20, 0, 96],
        [1060, 0, 96],
        [1060, 0, 105],
        [-20, 0, 105],
      ],
      '#0d9488'
    );
    wall += renderPolygon3D(
      [
        [-20, 0, 105],
        [1060, 0, 105],
        [1060, -18, 105],
        [-20, -18, 105],
      ],
      '#14b8a6'
    );

    // Weather Canopy Overhang with Teal Trim
    wall += renderPolygon3D(
      [
        [-20, 0, 80],
        [1060, 0, 80],
        [1060, 20, 80],
        [-20, 20, 80],
      ],
      '#ffffff',
      '#cbd5e1'
    );
    wall += renderPolygon3D(
      [
        [-20, 20, 77],
        [1060, 20, 77],
        [1060, 20, 80],
        [-20, 20, 80],
      ],
      '#0d9488'
    );

    // Steel Cantilevered Brackets & Downlights
    for (let bx = 0; bx <= 1020; bx += 116) {
      wall += renderPolygon3D(
        [
          [bx, 0, 92],
          [bx + 2, 0, 92],
          [bx + 2, 20, 80],
          [bx, 20, 80],
        ],
        '#94a3b8'
      );
      const [dlX, dlY] = isoPoint(bx + 1, 12, 80);
      wall += `<circle cx="${dlX}" cy="${dlY}" r="2.8" fill="#0d9488" opacity="0.8"/>`;
    }

    // Warehouse Header Typography
    const [hdrX, hdrY] = isoPoint(510, 0, 100);
    wall += `<text x="${hdrX}" y="${hdrY}" text-anchor="middle" font-size="12" font-weight="900" fill="#ffffff" letter-spacing="3" font-family="'JetBrains Mono', monospace"></text>`;

    return { ground: bg, wall };
  }, []);

  const handleDockClick = (dockIndex: number) => {
    if (selectedTruckId) {
      animateCallTruckToDock(dockIndex, selectedTruckId);
    } else {
      const targetDock = docks[dockIndex];
      if (targetDock && targetDock.currentTruck) {
        const existingId = targetDock.currentTruck.id;
        const vMap = vehiclesRef.current;
        const existingVehicle = vMap.get(existingId);
        if (existingVehicle) {
          const leavePts = buildLeaveDock(existingVehicle.truck.type, existingVehicle.pose);
          existingVehicle.trajectory = leavePts;
          existingVehicle.trajStartTime = performance.now();
          existingVehicle.mode = 'leaving_dock';
          existingVehicle.hazardBlinking = true;
          existingVehicle.onFinish = () => {
            vMap.delete(existingId);
          };
        }
        onCompleteUnload(dockIndex);
      } else if (queueTrucks.length > 0) {
        animateCallTruckToDock(dockIndex, queueTrucks[0].id);
      } else {
        onSelectDock(dockIndex);
      }
    }
  };

  const activeVehiclesList = Array.from(vehiclesRef.current.values()).sort(
    (a, b) => a.pose.x + a.pose.y - (b.pose.x + b.pose.y)
  );

  const bgGradient =
    weatherMode === 'rain'
      ? 'bg-gradient-to-b from-[#b8cadb] via-[#cad7e6] to-[#d6e1ed]'
      : weatherMode === 'dust'
      ? 'bg-gradient-to-b from-[#c6d3cd] via-[#d6deda] to-[#e3e9e5]'
      : 'bg-gradient-to-b from-[#d5e4f3] via-[#e2ecf7] to-[#eaf1f9]';

  return (
    <div className={`relative w-full h-full flex-1 overflow-hidden ${bgGradient} transition-colors duration-700 select-none flex items-center justify-center`}>
      <svg
        viewBox="-400 -150 1340 760"
        className="w-full h-full max-h-[96vh] object-contain drop-shadow-xl"
        role="img"
        aria-label="Sơ đồ 16 cửa dock kho vận (A1-A12, B1-B4)"
      >
        <defs>
          <filter id="selectedGlow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="0" stdDeviation="5" floodColor="#0d9488" floodOpacity="0.8" />
          </filter>
        </defs>

        {/* Static Background Scenery: Clean Roadway, Markings, Trees, Perimeter Gate */}
        <g dangerouslySetInnerHTML={{ __html: staticSceneSvg.ground }} />

        {/* Warehouse Facade Wall */}
        <g dangerouslySetInnerHTML={{ __html: staticSceneSvg.wall }} />

        {/* 16 Modern Industrial Dock Bays */}
        {docks.map((dock) => {
          const isSelected = selectedDockId === dock.index;
          const cx = dock.cx;
          const isFree = dock.status === 'free';
          const isBusy = dock.status === 'busy';
          const isMoving = dock.status === 'moving';

          const statusColor = isFree
            ? '#0d9488'
            : isMoving
            ? '#f59e0b'
            : dock.status === 'maintenance'
            ? '#94a3b8'
            : '#2563eb';

          // Dock Staging Guide Line on Ground
          const floorPad = renderPolygon3D(
            [
              [cx - 25, 0, 0.1],
              [cx + 25, 0, 0.1],
              [cx + 25, 170, 0.1],
              [cx - 25, 170, 0.1],
            ],
            statusColor,
            isSelected ? '#0d9488' : '#cbd5e1',
            `fill-opacity="${isFree ? 0.08 : 0.16}" stroke-width="${isSelected ? 3 : 1.2}" stroke-dasharray="6 4"`
          );

          // Dynamic Sectional Overhead Door:
          // When a truck is docked (isBusy), the door rolls UP revealing the illuminated warehouse interior!
          const doorHeight = isBusy ? 14 : 72;
          let doorSvg = '';
          doorSvg += renderPolygon3D(
            [
              [cx - 23, 0, 72 - doorHeight],
              [cx + 23, 0, 72 - doorHeight],
              [cx + 23, 0, 72],
              [cx - 23, 0, 72],
            ],
            '#ffffff',
            '#cbd5e1',
            'stroke-width="1.5"'
          );

          // Door ribs and vision windows if door is down
          if (!isBusy) {
            for (let dz = 18; dz <= 54; dz += 18) {
              doorSvg += renderPolygon3D(
                [
                  [cx - 22, 0, dz],
                  [cx + 22, 0, dz],
                  [cx + 22, 0, dz + 1],
                  [cx - 22, 0, dz + 1],
                ],
                '#e2e8f0'
              );
            }
            [-14, 0, 14].forEach((wx) => {
              doorSvg += renderPolygon3D(
                [
                  [cx + wx - 5, 0.2, 38],
                  [cx + wx + 5, 0.2, 38],
                  [cx + wx + 5, 0.2, 46],
                  [cx + wx - 5, 0.2, 46],
                ],
                '#0f172a',
                '#94a3b8'
              );
            });
          }

          // Hydraulic Dock Leveler Platform
          const leveler = renderBox3D(cx - 15, -4, 0, 30, 4, 18, '#ffffff', '#cbd5e1', '#0d9488');

          // Heavy Molded Rubber Dock Bumpers
          const bumperL = renderBox3D(cx - 20, 0, 6, 4, 3, 14, '#18181b', '#27272a', '#0f172a');
          const bumperR = renderBox3D(cx + 16, 0, 6, 4, 3, 14, '#18181b', '#27272a', '#0f172a');

          // Dock Traffic Signal Light Column
          const [sigX, sigY] = isoPoint(cx + 25, 0, 52);
          const [plaqueX, plaqueY] = isoPoint(cx, 0, 84);

          return (
            <g key={dock.id} id={`dock-group-${dock.index}`}>
              <g dangerouslySetInnerHTML={{ __html: floorPad + doorSvg + leveler + bumperL + bumperR }} />

              {/* Dual-Lens Dock Traffic Signal Box */}
              <g transform={`translate(${sigX}, ${sigY})`}>
                <rect x="-5" y="-14" width="10" height="28" rx="3" fill="#ffffff" stroke="#cbd5e1" strokeWidth="1" />
                <circle
                  cx="0"
                  cy="-7"
                  r="3.5"
                  fill={isBusy ? '#ef4444' : '#fee2e2'}
                  stroke={isBusy ? '#dc2626' : '#fca5a5'}
                  strokeWidth="0.8"
                />
                <circle
                  cx="0"
                  cy="7"
                  r="3.5"
                  fill={isFree ? '#10b981' : '#d1fae5'}
                  stroke={isFree ? '#059669' : '#6ee7b7'}
                  strokeWidth="0.8"
                />
              </g>

              {/* Clean Dock Bay Sign Plaque */}
              <rect
                x={plaqueX - 16}
                y={plaqueY - 10}
                width="32"
                height="20"
                rx="4"
                fill={isSelected ? '#0d9488' : '#ffffff'}
                stroke={statusColor}
                strokeWidth="2"
              />
              <text
                x={plaqueX}
                y={plaqueY + 4.5}
                textAnchor="middle"
                fontSize="11.5"
                fontWeight="900"
                fill={isSelected ? '#ffffff' : '#0f172a'}
                fontFamily="'JetBrains Mono', monospace"
              >
                {dock.id}
              </text>
            </g>
          );
        })}

        {/* Animated Realistic Vehicles (Sorted by depth) */}
        {activeVehiclesList.map((vehicle) => {
          const { truck, pose, opacity, mode, id } = vehicle;
          const isSelected = selectedTruckId === id;
          const config = VEHICLE_CONFIGS[truck.type] || VEHICLE_CONFIGS.small;
          const truckSvgHtml = generateTruckFaces(truck, pose);
          const [tagX, tagY] = isoPoint(pose.x, pose.y, 10 + config.heightBody);

          return (
            <g
              key={id}
              style={{ opacity }}
              filter={isSelected ? 'url(#selectedGlow)' : undefined}
              className="cursor-pointer transition-opacity"
              onClick={(e) => {
                e.stopPropagation();
                if (mode === 'waiting') {
                  onSelectTruck(isSelected ? null : id);
                }
              }}
            >
              <g dangerouslySetInnerHTML={{ __html: truckSvgHtml }} />

              {/* Clean Vietnamese License Plate Floating Tag */}
              <g transform={`translate(${tagX}, ${tagY - 34})`}>
                <rect
                  x="-45"
                  y="-14"
                  width="90"
                  height="26"
                  rx="6"
                  fill="#ffffff"
                  stroke={truck.priority ? '#dc2626' : isSelected ? '#0d9488' : '#94a3b8'}
                  strokeWidth={truck.priority ? '2.5' : isSelected ? '2.5' : '1.5'}
                  filter="drop-shadow(0 2px 4px rgba(0,0,0,0.12))"
                />

                <text
                  x="0"
                  y="3"
                  textAnchor="middle"
                  fill="#0f172a"
                  fontSize="12"
                  fontWeight="900"
                  fontFamily="'JetBrains Mono', monospace"
                  letterSpacing="0.8"
                >
                  {truck.plate}
                </text>

                {/* Priority Star Badge */}
                {truck.priority && (
                  <g transform="translate(38, -9)">
                    <circle r="7.5" fill="#dc2626" stroke="#ffffff" strokeWidth="1.2" />
                    <text y="2.8" textAnchor="middle" fill="#ffffff" fontSize="9" fontWeight="bold">★</text>
                  </g>
                )}

                {/* Call Count Badge */}
                {truck.callCount && truck.callCount > 0 && (
                  <g transform="translate(-38, -9)">
                    <rect x="-10" y="-7" width="20" height="14" rx="4" fill="#0d9488" stroke="#ffffff" strokeWidth="1" />
                    <text y="3.5" textAnchor="middle" fill="#ffffff" fontSize="8.5" fontWeight="900" fontFamily="'JetBrains Mono', monospace">
                      x{truck.callCount}
                    </text>
                  </g>
                )}
              </g>

              {/* Waiting Position Tag (e.g. 15m, 10m, 24m) */}
              {mode === 'waiting' && (
                <g transform={`translate(${tagX}, ${tagY - 5})`}>
                  <rect
                    x="-24"
                    y="-7"
                    width="48"
                    height="14"
                    rx="4"
                    fill="#0f172a"
                    stroke="#cbd5e1"
                    strokeWidth="1"
                  />
                  <text
                    y="3.5"
                    textAnchor="middle"
                    fill="#ffffff"
                    fontSize="9"
                    fontWeight="800"
                    fontFamily="'JetBrains Mono', monospace"
                  >
                    {truck.waitingPosition || '15m'}
                  </text>
                </g>
              )}
            </g>
          );
        })}

        {/* Waiting Queue Signboard (Live count from Column H of Thông Tin Giao Hàng) */}
        {(() => {
          const [boardX, boardY] = isoPoint(-28, 305, 108);
          const displayCount = waitingQueueCount ?? queueTrucks.length;
          return (
            <g
              transform={`translate(${boardX}, ${boardY})`}
              filter="drop-shadow(0 4px 8px rgba(15,23,42,0.28))"
              aria-label={`Số lượng xe đang đợi: ${displayCount}`}
            >
              {/* Outer metallic housing */}
              <rect
                x="-56"
                y="-27"
                width="112"
                height="54"
                rx="8"
                fill="#0f172a"
                stroke="#334155"
                strokeWidth="2.5"
              />
              {/* Top teal header bar */}
              <path
                d="M -55 -19 Q -55 -26 -48 -26 L 48 -26 Q 55 -26 55 -19 L 55 -10 L -55 -10 Z"
                fill="#0d9488"
              />
              <text
                x="0"
                y="-15"
                textAnchor="middle"
                fill="#ffffff"
                fontSize="8.8"
                fontWeight="900"
                fontFamily="'JetBrains Mono', monospace"
                letterSpacing="0.8"
              >
                XE ĐANG ĐỢI
              </text>
              {/* Count readout */}
              <text
                x="-6"
                y="15"
                textAnchor="middle"
                fill="#fbbf24"
                fontSize="24"
                fontWeight="900"
                fontFamily="'JetBrains Mono', monospace"
              >
                {displayCount}
              </text>
              <text
                x="26"
                y="13"
                textAnchor="middle"
                fill="#cbd5e1"
                fontSize="9.5"
                fontWeight="800"
                fontFamily="'JetBrains Mono', monospace"
              >
                XE
              </text>
              {/* Mounting collar at base of signboard */}
              <rect x="-7" y="25" width="14" height="5" rx="2" fill="#475569" stroke="#1e293b" strokeWidth="1" />
            </g>
          );
        })()}

        {/* Interactive Hit Targets for Docks */}
        {docks.map((dock) => {
          const cx = dock.cx;
          const points = [
            isoPoint(cx - 26, 0, 80),
            isoPoint(cx + 26, 0, 80),
            isoPoint(cx + 26, 170, 0),
            isoPoint(cx - 26, 170, 0),
          ]
            .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`)
            .join(' ');

          return (
            <polygon
              key={`hit-${dock.id}`}
              points={points}
              className="fill-transparent hover:fill-teal-500/15 cursor-pointer focus:outline-none transition-colors"
              tabIndex={0}
              role="button"
              aria-label={`Dock ${dock.id} - ${dock.status}`}
              onClick={() => handleDockClick(dock.index)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleDockClick(dock.index);
                }
              }}
            />
          );
        })}
      </svg>

      {/* Real-time Weather Atmospheric Particle Canvas (Rain / Dust Mist) */}
      <WeatherOverlay mode={weatherMode} />
    </div>
  );
};
