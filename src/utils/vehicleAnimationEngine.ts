import { Truck, VehicleTypeKey } from '../types';
import { VEHICLE_CONFIGS } from './isoMath';

export const LANE_Y = 215;
export const TURN_RADIUS = 45;
export const VEHICLE_SPEED = 210; // units per second

export interface TrajectoryPoint {
  t: number;
  x: number;
  y: number;
  th: number;
}

export class PathBuilder {
  x: number;
  y: number;
  a: number; // Angle in radians
  rev: boolean = false;
  pts: TrajectoryPoint[] = [];
  private th0: number | null = null;
  private tt: number = 0;
  private speed: number = VEHICLE_SPEED;

  constructor(x: number, y: number, a: number) {
    this.x = x;
    this.y = y;
    this.a = a;
    this.push(0);
  }

  push(dt: number) {
    let th = this.a + (this.rev ? Math.PI : 0);
    if (this.th0 !== null) {
      th += 2 * Math.PI * Math.round((this.th0 - th) / (2 * Math.PI));
    }
    this.th0 = th;
    this.tt += dt;
    this.pts.push({ t: this.tt, x: this.x, y: this.y, th });
  }

  line(d: number) {
    const n = Math.max(1, Math.ceil(d / 6));
    const sv = this.rev ? this.speed * 0.55 : this.speed;
    const c = Math.cos(this.a);
    const s = Math.sin(this.a);
    for (let i = 1; i <= n; i++) {
      this.x += (c * d) / n;
      this.y += (s * d) / n;
      this.push(d / n / sv);
    }
  }

  arc(sg: number) {
    const n = 18;
    const R = TURN_RADIUS;
    const nx = -Math.sin(this.a) * sg;
    const ny = Math.cos(this.a) * sg;
    const cx = this.x + R * nx;
    const cy = this.y + R * ny;
    const vx = -R * nx;
    const vy = -R * ny;
    const a0 = this.a;
    const sv = this.rev ? this.speed * 0.55 : this.speed * 0.7;

    for (let i = 1; i <= n; i++) {
      const f = (sg * Math.PI) / 2 * (i / n);
      const cs = Math.cos(f);
      const sn = Math.sin(f);
      this.x = cx + vx * cs - vy * sn;
      this.y = cy + vx * sn + vy * cs;
      this.a = a0 + f;
      this.push(((Math.PI / 2) * R) / n / sv);
    }
  }
}

/**
 * Trajectory: Moving out of queue spot -> turning onto lane -> reversing into dock
 */
export function buildRouteToDock(
  truckType: VehicleTypeKey,
  sx: number,
  sy: number,
  dockCx: number,
  delaySec: number = 0
): TrajectoryPoint[] {
  const cfg = VEHICLE_CONFIGS[truckType] || VEHICLE_CONFIGS.small;
  const L = cfg.lengthBody + cfg.lengthCab;
  const Yc = 8 + L / 2;
  const s = dockCx >= sx ? 1 : -1;

  const p = new PathBuilder(sx, sy, -Math.PI / 2);
  if (delaySec > 0) p.push(delaySec);

  // Drive forward out of parking stall towards lane
  p.line(Math.max(1, sy - (LANE_Y + TURN_RADIUS)));
  // Turn onto lane towards the dock
  p.arc(s);
  // Drive along lane
  p.line(Math.abs(dockCx - sx));
  // Pause to shift into reverse
  p.push(0.35);
  // Reverse gear
  p.a = s > 0 ? Math.PI : 0;
  p.rev = true;
  p.push(0);
  // Arc backing into dock bay
  p.arc(s);
  // Straight reverse into dock lip
  p.line(Math.max(1, LANE_Y - TURN_RADIUS - Yc));

  return p.pts;
}

/**
 * Trajectory: Entering directly from warehouse gate (x=1060, LANE_Y) -> reversing into dock
 * Used when a truck from sheet "Ưu Tiên" (or freshly added with a dock) is called directly into a dock.
 */
export function buildGateToDock(
  truckType: VehicleTypeKey,
  dockCx: number,
  delaySec: number = 0
): TrajectoryPoint[] {
  const cfg = VEHICLE_CONFIGS[truckType] || VEHICLE_CONFIGS.small;
  const L = cfg.lengthBody + cfg.lengthCab;
  const Yc = 8 + L / 2;

  const p = new PathBuilder(1060, LANE_Y, Math.PI);
  if (delaySec > 0) p.push(delaySec);

  // Drive westbound along lane until aligned just east of the dock turn-in point
  p.line(Math.max(1, 1060 - (dockCx + TURN_RADIUS)));
  // Pause to shift into reverse
  p.push(0.35);
  // Reverse into dock bay
  p.a = Math.PI;
  p.rev = true;
  p.push(0);
  p.arc(1);
  p.line(Math.max(1, LANE_Y - TURN_RADIUS - Yc));

  return p.pts;
}

/**
 * Trajectory: Leaving dock -> driving forward onto lane -> exiting off-screen right
 */
export function buildLeaveDock(
  truckType: VehicleTypeKey,
  startPose: { x: number; y: number; th: number }
): TrajectoryPoint[] {
  const p = new PathBuilder(startPose.x, startPose.y, Math.PI / 2);
  // Drive straight forward out of dock onto lane
  p.line(Math.max(1, LANE_Y - TURN_RADIUS - startPose.y));
  // Turn left to face exit (eastbound)
  p.arc(-1);
  // Drive straight out along lane to 1060
  p.line(Math.max(1, 1060 - p.x));
  return p.pts;
}

/**
 * Trajectory: Entering warehouse from outside (x=1060) -> turning and parking into queue spot
 */
export function buildEnterQueue(
  truckType: VehicleTypeKey,
  targetSpot: { x: number; y: number; th: number },
  delaySec: number = 0
): TrajectoryPoint[] {
  const p = new PathBuilder(1060, LANE_Y, Math.PI);
  if (delaySec > 0) p.push(delaySec);

  // Drive westbound along lane towards target spot
  p.line(Math.max(1, 1060 - (targetSpot.x - TURN_RADIUS)));
  // Pause
  p.push(0.35);
  // Reverse into parking spot
  p.a = 0;
  p.rev = true;
  p.push(0);
  p.arc(1);
  p.line(Math.max(1, targetSpot.y - (LANE_Y + TURN_RADIUS)));

  return p.pts;
}

/**
 * Trajectory: Moving out of dock -> driving along lane -> parking into queue spot (for skipped trucks)
 */
export function buildDockToQueue(
  truckType: VehicleTypeKey,
  startPose: { x: number; y: number; th: number },
  targetSpot: { x: number; y: number; th: number }
): TrajectoryPoint[] {
  const p = new PathBuilder(startPose.x, startPose.y, Math.PI / 2);

  // 1. Pull forward out of dock bay onto the central lane
  p.line(Math.max(1, LANE_Y - TURN_RADIUS - startPose.y));

  const isEastbound = targetSpot.x >= startPose.x;
  const s = isEastbound ? -1 : 1;

  // 2. Arc onto lane
  p.arc(s);

  // 3. Drive along lane
  const stopX = isEastbound ? targetSpot.x - TURN_RADIUS : targetSpot.x + TURN_RADIUS;
  const laneDistance = Math.abs(stopX - p.x);
  if (laneDistance > 2) {
    p.line(laneDistance);
  }

  // 4. Pause to shift gear into reverse
  p.push(0.35);

  // 5. Back into parking slot
  p.a = isEastbound ? 0 : Math.PI;
  p.rev = true;
  p.push(0);
  p.arc(isEastbound ? 1 : -1);
  p.line(Math.max(1, targetSpot.y - (LANE_Y + TURN_RADIUS)));

  return p.pts;
}
