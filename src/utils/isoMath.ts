import { VehicleTypeConfig, VehicleTypeKey, Truck } from '../types';

export const ISOMETRIC_COS = 0.8660254; // Math.cos(Math.PI / 6) = sqrt(3)/2

export const VEHICLE_CONFIGS: Record<VehicleTypeKey, VehicleTypeConfig> = {
  small: {
    key: 'small',
    name: 'Xe Tải 1-5 Tấn',
    width: 32,
    lengthBody: 48,
    heightBody: 38,
    lengthCab: 22,
    heightCab: 30,
    color: '#0d9488', // Teal accent
    defaultPallets: 8,
    unloadingRateSecPerPallet: 4,
  },
  van: {
    key: 'van',
    name: 'Xe Con, Xe Van',
    width: 30,
    lengthBody: 40,
    heightBody: 34,
    lengthCab: 20,
    heightCab: 28,
    color: '#0d9488', // Teal accent
    defaultPallets: 5,
    unloadingRateSecPerPallet: 3,
  },
  big: {
    key: 'big',
    name: 'Xe Tải 8 Tấn',
    width: 36,
    lengthBody: 74,
    heightBody: 46,
    lengthCab: 26,
    heightCab: 36,
    color: '#0d9488', // Exact Teal matching reference photo
    defaultPallets: 18,
    unloadingRateSecPerPallet: 5,
  },
  cont: {
    key: 'cont',
    name: 'Xe Tải 15 Tấn',
    width: 40,
    lengthBody: 108,
    heightBody: 54,
    lengthCab: 28,
    heightCab: 42,
    color: '#0d9488', // Teal accent
    defaultPallets: 28,
    unloadingRateSecPerPallet: 6,
  },
};

export const COMMON_SUPPLIERS = [
  'Zuellig Pharma',
  'DKSH Việt Nam',
  'Sanofi-Aventis',
  'Pymepharco',
  'Traphaco',
  'OPC Pharma',
  'Imexpharm',
  'Dược Hậu Giang (DHG)',
  'Stada VN',
  'Mekophar',
  'Viettel Post',
  'J&T Express Logistics',
];

export function mapTypeNameToKey(typeName: string): VehicleTypeKey {
  const norm = (typeName || '').toLowerCase().trim();
  if (norm.includes('15') || norm.includes('cont')) return 'cont';
  if (norm.includes('8 tấn') || norm.includes('8 tan') || norm.includes('lớn') || norm.includes('big')) return 'big';
  if (norm.includes('con') || norm.includes('van')) return 'van';
  return 'small';
}

/**
 * 3D to Isometric 2D Point
 */
export function isoPoint(x: number, y: number, z: number): [number, number] {
  return [(x - y) * ISOMETRIC_COS, (x + y) * 0.5 - z];
}

/**
 * Format milliseconds into MM:SS
 */
export function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec < 10 ? '0' : ''}${sec}`;
}

/**
 * Helper to darken/lighten a hex or rgb color with gamma correction
 */
export function shadeColor(color: string, percent: number): string {
  if (color.startsWith('rgba') || color.startsWith('rgb')) {
    const match = color.match(/\(([^)]+)\)/);
    if (!match) return color;
    const parts = match[1].split(',').map((p) => parseFloat(p.trim()));
    const r = parts[0];
    const g = parts[1];
    const b = parts[2];
    const a = parts[3] !== undefined ? parts[3] : 1;
    const target = percent < 0 ? 0 : 255;
    const p = Math.abs(percent);
    const R = Math.round(r + (target - r) * p);
    const G = Math.round(g + (target - g) * p);
    const B = Math.round(b + (target - b) * p);
    return `rgba(${R},${G},${B},${a})`;
  }

  let hex = color.replace('#', '');
  if (hex.length === 3) {
    hex = hex.split('').map((c) => c + c).join('');
  }
  const num = parseInt(hex, 16);
  if (isNaN(num)) return color;
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  const target = percent < 0 ? 0 : 255;
  const p = Math.abs(percent);
  const R = Math.round(r + (target - r) * p);
  const G = Math.round(g + (target - g) * p);
  const B = Math.round(b + (target - b) * p);
  return `rgb(${R},${G},${B})`;
}

/**
 * Polygon SVG string from 3D coordinates
 */
export function renderPolygon3D(
  points: [number, number, number][],
  fill: string,
  stroke?: string,
  extraAttr?: string
): string {
  const pts = points
    .map((p) => {
      const [px, py] = isoPoint(p[0], p[1], p[2]);
      return `${px.toFixed(1)},${py.toFixed(1)}`;
    })
    .join(' ');
  const strokeAttr = stroke ? ` stroke="${stroke}" stroke-width="1" stroke-linejoin="round"` : '';
  return `<polygon points="${pts}" fill="${fill}"${strokeAttr} ${extraAttr || ''}/>`;
}

/**
 * Render a 3D box in isometric space
 */
export function renderBox3D(
  x: number,
  y: number,
  z: number,
  w: number,
  l: number,
  h: number,
  colorTop: string,
  colorRight: string,
  colorFront: string,
  stroke?: string
): string {
  return (
    renderPolygon3D(
      [
        [x, y, z + h],
        [x + w, y, z + h],
        [x + w, y + l, z + h],
        [x, y + l, z + h],
      ],
      colorTop,
      stroke
    ) +
    renderPolygon3D(
      [
        [x + w, y, z],
        [x + w, y + l, z],
        [x + w, y + l, z + h],
        [x + w, y, z + h],
      ],
      colorRight,
      stroke
    ) +
    renderPolygon3D(
      [
        [x, y + l, z],
        [x + w, y + l, z],
        [x + w, y + l, z + h],
        [x, y + l, z + h],
      ],
      colorFront,
      stroke
    )
  );
}



/**
 * Generate Highly Realistic 3D Vehicle Geometries:
 * - High-detail volumetric cabin with curved dark-tinted windshield and specular glass reflections
 * - Black wiper blades and visible cabin driver silhouette
 * - Chrome/mesh front louvred grille, front bumper with license plate and integrated fog lamps
 * - Composite projector headlights with bright light beam projected onto the road
 * - Dynamic dual-tone teal wave graphic with metallic accent border
 * - Realistic 3D wheels with curved rubber tire profiles, metallic silver alloy rims, and visible lug nuts
 * - Distinctive realistic features for 8 Tấn (tandem wheels), 1-5 Tấn, 15 Tấn Cont, and Van
 */
export function generateTruckFaces(
  truck: Truck,
  pose: { x: number; y: number; th: number }
): string {
  const type = truck.type || 'small';
  const config = VEHICLE_CONFIGS[type] || VEHICLE_CONFIGS.small;
  const L = config.lengthBody + config.lengthCab;
  const c = Math.cos(pose.th);
  const s = Math.sin(pose.th);
  const halfW = config.width / 2;
  const wCab = halfW - 2;
  const uRear = -L / 2;
  const uFront = L / 2;
  const zBase = 7.5;

  const uCabRear = uFront - config.lengthCab;
  const uBoxFront = uCabRear - 1.5;
  const uBoxRear = uRear;
  const zBoxTop = zBase + config.heightBody;
  const zCabTop = zBase + config.heightCab;

  interface Face3D {
    pts: [number, number, number][];
    fill: string;
    stroke?: string;
    strokeWidth?: number;
    depth: number;
  }

  const faces: Face3D[] = [];

  function addFace(
    localPts: [number, number, number][],
    localNormal: [number, number, number],
    fill: string,
    stroke?: string,
    strokeWidth = 0.8,
    depthBias = 0,
    noCull = false
  ) {
    const nx = localNormal[0] * c - localNormal[1] * s;
    const ny = localNormal[0] * s + localNormal[1] * c;
    const nz = localNormal[2];

    if (!noCull) {
      const dot = nx + ny + nz;
      if (dot <= 0.0001) return;
    }

    const worldPts: [number, number, number][] = localPts.map(([u, v, z]) => [
      pose.x + u * c - v * s,
      pose.y + u * s + v * c,
      z,
    ]);

    let sumDepth = 0;
    for (let i = 0; i < worldPts.length; i++) {
      sumDepth += worldPts[i][0] + worldPts[i][1] + worldPts[i][2];
    }
    const depth = sumDepth / worldPts.length + depthBias;

    faces.push({
      pts: worldPts,
      fill,
      stroke,
      strokeWidth,
      depth,
    });
  }

  function addBox(
    u1: number,
    u2: number,
    v1: number,
    v2: number,
    z1: number,
    z2: number,
    colorTop: string,
    colorSide: string,
    colorFront: string,
    stroke?: string,
    depthBias = 0
  ) {
    // Top (+Z)
    addFace(
      [[u1, v1, z2], [u2, v1, z2], [u2, v2, z2], [u1, v2, z2]],
      [0, 0, 1],
      colorTop,
      stroke,
      0.8,
      depthBias
    );
    // Front (+U)
    addFace(
      [[u2, v1, z1], [u2, v2, z1], [u2, v2, z2], [u2, v1, z2]],
      [1, 0, 0],
      colorFront,
      stroke,
      0.8,
      depthBias
    );
    // Rear (-U)
    addFace(
      [[u1, v2, z1], [u1, v1, z1], [u1, v1, z2], [u1, v2, z2]],
      [-1, 0, 0],
      shadeColor(colorFront, -0.16),
      stroke,
      0.8,
      depthBias
    );
    // Right (+V)
    addFace(
      [[u1, v2, z1], [u2, v2, z1], [u2, v2, z2], [u1, v2, z2]],
      [0, 1, 0],
      colorSide,
      stroke,
      0.8,
      depthBias
    );
    // Left (-V)
    addFace(
      [[u2, v1, z1], [u1, v1, z1], [u1, v1, z2], [u2, v1, z2]],
      [0, -1, 0],
      shadeColor(colorSide, -0.12),
      stroke,
      0.8,
      depthBias
    );
  }

  // Realistic 3D Wheel with high-density faceted rubber tread and bright alloy rim
  function addWheel3D(uCenter: number, isRightSide: boolean, radius = 5.8, wheelW = 3.2) {
    const vSign = isRightSide ? 1 : -1;
    const vOuter = vSign * (halfW + 0.6);
    const vInner = vOuter - vSign * wheelW;
    const zCenter = radius + 0.5;
    const segs = 10;

    // Tread rings around circumference
    for (let i = 0; i < segs; i++) {
      const a1 = (i / segs) * Math.PI * 2;
      const a2 = ((i + 1) / segs) * Math.PI * 2;
      const u1 = uCenter + radius * Math.cos(a1);
      const z1 = zCenter + radius * Math.sin(a1);
      const u2 = uCenter + radius * Math.cos(a2);
      const z2 = zCenter + radius * Math.sin(a2);

      const midA = (a1 + a2) / 2;
      const nu = Math.cos(midA);
      const nz = Math.sin(midA);

      const quadPts: [number, number, number][] =
        vSign > 0
          ? [
              [u1, vInner, z1],
              [u1, vOuter, z1],
              [u2, vOuter, z2],
              [u2, vInner, z2],
            ]
          : [
              [u1, vOuter, z1],
              [u1, vInner, z1],
              [u2, vInner, z2],
              [u2, vOuter, z2],
            ];

      addFace(quadPts, [nu, 0, nz], '#18181b', '#09090b', 0.6);
    }

    // Outer wheel face (Sidewall, Rim, Hub)
    const rimR = radius * 0.62;
    const sidewallPts: [number, number, number][] = [];
    const rimPts: [number, number, number][] = [];

    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const u = uCenter + radius * Math.cos(a);
      const z = zCenter + radius * Math.sin(a);
      sidewallPts.push([u, vOuter, z]);

      const ur = uCenter + rimR * Math.cos(a);
      const zr = zCenter + rimR * Math.sin(a);
      rimPts.push([ur, vOuter + vSign * 0.1, zr]);
    }

    // Sidewall disc
    addFace(sidewallPts, [0, vSign, 0], '#27272a', '#18181b', 0.8);
    // Silver alloy rim dish
    addFace(rimPts, [0, vSign, 0], '#e2e8f0', '#94a3b8', 0.8, 0.15);

    // Inner dark recessed rim ring
    const innerRimPts: [number, number, number][] = [];
    const innerRimR = rimR * 0.68;
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      innerRimPts.push([
        uCenter + innerRimR * Math.cos(a),
        vOuter + vSign * 0.2,
        zCenter + innerRimR * Math.sin(a),
      ]);
    }
    addFace(innerRimPts, [0, vSign, 0], '#475569', '#334155', 0.6, 0.2);

    // Axle hub cap
    const hubPts: [number, number, number][] = [];
    const hubR = rimR * 0.32;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      hubPts.push([
        uCenter + hubR * Math.cos(a),
        vOuter + vSign * 0.3,
        zCenter + hubR * Math.sin(a),
      ]);
    }
    addFace(hubPts, [0, vSign, 0], '#0f172a', '#000000', 0.6, 0.25);

    // Chrome lug nuts
    [-rimR * 0.48, rimR * 0.48].forEach((lx) => {
      [-rimR * 0.48, rimR * 0.48].forEach((lz) => {
        addFace(
          [
            [uCenter + lx - 0.5, vOuter + vSign * 0.25, zCenter + lz - 0.5],
            [uCenter + lx + 0.5, vOuter + vSign * 0.25, zCenter + lz - 0.5],
            [uCenter + lx + 0.5, vOuter + vSign * 0.25, zCenter + lz + 0.5],
            [uCenter + lx - 0.5, vOuter + vSign * 0.25, zCenter + lz + 0.5],
          ],
          [0, vSign, 0],
          '#ffffff',
          '#94a3b8',
          0.4,
          0.3
        );
      });
    });
  }

  // 1. SOFT VOLUMETRIC GROUND SHADOWS
  addFace(
    [
      [uRear - 6, -halfW - 6, 0],
      [uFront + 6, -halfW - 6, 0],
      [uFront + 6, halfW + 6, 0],
      [uRear - 6, halfW + 6, 0],
    ],
    [0, 0, 1],
    'rgba(15, 23, 42, 0.22)',
    undefined,
    0,
    -100,
    true
  );
  addFace(
    [
      [uRear + 2, -halfW - 1, 0.05],
      [uFront - 2, -halfW - 1, 0.05],
      [uFront - 2, halfW + 1, 0.05],
      [uRear + 2, halfW + 1, 0.05],
    ],
    [0, 0, 1],
    'rgba(15, 23, 42, 0.42)',
    undefined,
    0,
    -95,
    true
  );

  // 2. FORWARD HEADLIGHT BEAMS ON THE ROAD
  addFace(
    [
      [uFront, -wCab + 2, 0.1],
      [uFront + 36, -wCab - 14, 0.1],
      [uFront + 36, wCab + 14, 0.1],
      [uFront, wCab - 2, 0.1],
    ],
    [0, 0, 1],
    'rgba(254, 240, 138, 0.18)',
    undefined,
    0,
    -90,
    true
  );

  // ----------------------------------------------------
  // VEHICLE GEOMETRIES BY TYPE
  // ----------------------------------------------------

  if (type === 'van') {
    // ====================================================
    // TYPE: XE CON / XE VAN (Aerodynamic European Cargo Van)
    // ====================================================
    const zVanTop = zBase + 28;
    const uNoseFront = uFront;
    const uHoodBack = uFront - 9;
    const uWindshieldBack = uFront - 17;

    // Aerodynamic Slanted Nose Hood
    addFace(
      [
        [uNoseFront, -wCab, zBase + 3],
        [uNoseFront, wCab, zBase + 3],
        [uHoodBack, wCab, zBase + 12],
        [uHoodBack, -wCab, zBase + 12],
      ],
      [0.6, 0, 0.8],
      '#ffffff',
      '#cbd5e1'
    );
    // Front Nose Vertical Bumper & Grille
    addFace(
      [
        [uNoseFront, -wCab, zBase],
        [uNoseFront, wCab, zBase],
        [uNoseFront, wCab, zBase + 3],
        [uNoseFront, -wCab, zBase + 3],
      ],
      [1, 0, 0],
      '#f1f5f9',
      '#cbd5e1'
    );
    // Van Front Dark Grille
    addFace(
      [
        [uNoseFront + 0.1, -wCab + 4, zBase + 3.5],
        [uNoseFront + 0.1, wCab - 4, zBase + 3.5],
        [uHoodBack + 0.1, wCab - 4, zBase + 10.5],
        [uHoodBack + 0.1, -wCab + 4, zBase + 10.5],
      ],
      [0.6, 0, 0.8],
      '#1e293b',
      '#0f172a',
      0.6,
      0.1
    );

    // Aerodynamic Sloped Windshield
    addFace(
      [
        [uHoodBack, -wCab + 1.5, zBase + 12],
        [uHoodBack, wCab - 1.5, zBase + 12],
        [uWindshieldBack, wCab - 1.5, zVanTop - 1],
        [uWindshieldBack, -wCab + 1.5, zVanTop - 1],
      ],
      [0.7, 0, 0.7],
      '#090d16',
      '#1e293b',
      0.8,
      0.15
    );
    // Windshield specular gleam
    addFace(
      [
        [uHoodBack - 2, -wCab + 3, zBase + 13],
        [uHoodBack - 4, -wCab + 6, zBase + 13],
        [uWindshieldBack + 1, -wCab + 10, zVanTop - 2],
        [uWindshieldBack + 2, -wCab + 7, zVanTop - 2],
      ],
      [0.7, 0, 0.7],
      'rgba(255, 255, 255, 0.42)',
      undefined,
      0,
      0.2
    );

    // Integrated Van Cabin & Cargo Body
    addBox(
      uRear,
      uWindshieldBack,
      -halfW,
      halfW,
      zBase,
      zVanTop,
      '#ffffff',
      '#f8fafc',
      '#ffffff',
      '#cbd5e1'
    );

    // Curved Van Roof Bevels
    addFace(
      [
        [uRear, -halfW, zVanTop],
        [uWindshieldBack, -halfW, zVanTop],
        [uWindshieldBack, -halfW + 2, zVanTop + 1.5],
        [uRear, -halfW + 2, zVanTop + 1.5],
      ],
      [0, -0.6, 0.8],
      '#ffffff',
      '#e2e8f0'
    );
    addFace(
      [
        [uRear, halfW - 2, zVanTop + 1.5],
        [uWindshieldBack, halfW - 2, zVanTop + 1.5],
        [uWindshieldBack, halfW, zVanTop],
        [uRear, halfW, zVanTop],
      ],
      [0, 0.6, 0.8],
      '#ffffff',
      '#e2e8f0'
    );

    // Van Sides: Cabin Windows + Sliding Door + Teal Livery
    [1, -1].forEach((sign) => {
      const vSide = sign * (halfW + 0.1);
      // Front Cabin Side Window
      addFace(
        [
          [uWindshieldBack, vSide, zBase + 12],
          [uHoodBack, vSide, zBase + 12],
          [uWindshieldBack, vSide, zVanTop - 2],
        ],
        [0, sign, 0],
        '#090d16',
        '#1e293b',
        0.6,
        0.1
      );
      // Sliding Door Privacy Window
      addFace(
        [
          [uRear + 16, vSide, zBase + 14],
          [uWindshieldBack - 2, vSide, zBase + 14],
          [uWindshieldBack - 2, vSide, zVanTop - 3],
          [uRear + 16, vSide, zVanTop - 3],
        ],
        [0, sign, 0],
        '#0f172a',
        '#1e293b',
        0.6,
        0.1
      );
      // Dynamic Teal Fleet Wave Stripe
      addFace(
        [
          [uRear, vSide, zBase + 3],
          [uFront - 8, vSide, zBase + 3],
          [uFront - 8, vSide, zBase + 7],
          [uRear + 20, vSide, zBase + 8],
          [uRear, vSide, zBase + 6],
        ],
        [0, sign, 0],
        '#0d9488',
        undefined,
        0,
        0.15
      );
      // Cyan accent trim
      addFace(
        [
          [uRear, vSide, zBase + 6],
          [uRear + 20, vSide, zBase + 8],
          [uFront - 8, vSide, zBase + 7],
          [uFront - 8, vSide, zBase + 8.2],
          [uRear + 20, vSide, zBase + 9.2],
          [uRear, vSide, zBase + 7.2],
        ],
        [0, sign, 0],
        '#2dd4bf',
        undefined,
        0,
        0.18
      );
    });

    // Van Rear Barn Doors with Windows & Tail Light Pillars
    addFace(
      [
        [uRear - 0.2, -halfW + 1, zBase + 2],
        [uRear - 0.2, halfW - 1, zBase + 2],
        [uRear - 0.2, halfW - 1, zVanTop - 1],
        [uRear - 0.2, -halfW + 1, zVanTop - 1],
      ],
      [-1, 0, 0],
      '#ffffff',
      '#cbd5e1',
      0.8,
      0.1
    );
    // Rear Tinted Windows
    [-halfW + 3, 1].forEach((rv) => {
      addFace(
        [
          [uRear - 0.3, rv, zBase + 15],
          [uRear - 0.3, rv + halfW - 4, zBase + 15],
          [uRear - 0.3, rv + halfW - 4, zVanTop - 3],
          [uRear - 0.3, rv, zVanTop - 3],
        ],
        [-1, 0, 0],
        '#090d16',
        '#1e293b',
        0.6,
        0.15
      );
    });
    // Vertical LED Tail Lights
    [-halfW + 0.5, halfW - 2.5].forEach((tlV) => {
      addFace(
        [
          [uRear - 0.3, tlV, zBase + 5],
          [uRear - 0.3, tlV + 2, zBase + 5],
          [uRear - 0.3, tlV + 2, zBase + 18],
          [uRear - 0.3, tlV, zBase + 18],
        ],
        [-1, 0, 0],
        '#ef4444',
        '#991b1b',
        0.5,
        0.2
      );
    });

    // Van Wheels (Single Front, Single Rear)
    addWheel3D(uFront - 9, true, 5.2);
    addWheel3D(uFront - 9, false, 5.2);
    addWheel3D(uRear + 12, true, 5.2);
    addWheel3D(uRear + 12, false, 5.2);

  } else {
    // ====================================================
    // TRUCK TYPES: 8 TẤN (HERO), 1-5 TẤN, 15 TẤN CONT
    // ====================================================

    // Under-Chassis Steel Rails
    addBox(
      uRear + 2,
      uFront - 2,
      -wCab + 3,
      wCab - 3,
      3,
      zBase,
      '#1e293b',
      '#0f172a',
      '#0f172a'
    );

    // 1. CABIN (PURE WHITE WITH GLOSSY TINTED WINDSHIELD)
    addBox(
      uCabRear,
      uFront,
      -wCab,
      wCab,
      zBase,
      zCabTop,
      '#ffffff',
      '#f8fafc',
      '#ffffff',
      '#cbd5e1'
    );

    // AERODYNAMIC ROOF WIND DEFLECTOR (Matching the reference photo!)
    if (type === 'big' || type === 'small') {
      const deflectorZTop = type === 'big' ? zBoxTop : zBoxTop - 2;
      // Slanted top surface
      addFace(
        [
          [uFront - 4, -wCab, zCabTop],
          [uFront - 4, wCab, zCabTop],
          [uCabRear, wCab, deflectorZTop],
          [uCabRear, -wCab, deflectorZTop],
        ],
        [-0.5, 0, 0.86],
        '#ffffff',
        '#cbd5e1'
      );
      // Deflector side cheeks
      [1, -1].forEach((sign) => {
        addFace(
          [
            [uFront - 4, sign * wCab, zCabTop],
            [uCabRear, sign * wCab, zCabTop],
            [uCabRear, sign * wCab, deflectorZTop],
          ],
          [0, sign, 0],
          '#f1f5f9',
          '#cbd5e1'
        );
      });
    } else if (type === 'cont') {
      // Tractor unit sleeper roof cap
      addBox(
        uCabRear,
        uFront - 3,
        -wCab + 1,
        wCab - 1,
        zCabTop,
        zCabTop + 8,
        '#ffffff',
        '#f1f5f9',
        '#ffffff',
        '#cbd5e1'
      );
      // Twin vertical chrome exhaust pipes behind cab
      [-wCab + 3, wCab - 5].forEach((ev) => {
        addBox(
          uCabRear - 3,
          uCabRear - 1,
          ev,
          ev + 2,
          zBase + 4,
          zCabTop + 14,
          '#e2e8f0',
          '#94a3b8',
          '#cbd5e1',
          '#64748b',
          0.1
        );
      });
    }

    // Panoramic Tinted Windshield
    const zWindshieldBottom = zBase + config.heightCab * 0.45;
    addFace(
      [
        [uFront + 0.1, -wCab + 1.8, zWindshieldBottom],
        [uFront + 0.1, wCab - 1.8, zWindshieldBottom],
        [uFront + 0.1, wCab - 1.8, zCabTop - 2.5],
        [uFront + 0.1, -wCab + 1.8, zCabTop - 2.5],
      ],
      [1, 0, 0],
      '#090d16',
      '#1e293b',
      0.8,
      0.15
    );
    // Double specular glass reflections
    addFace(
      [
        [uFront + 0.2, -wCab + 3, zWindshieldBottom + 2],
        [uFront + 0.2, -wCab + 6.5, zWindshieldBottom + 2],
        [uFront + 0.2, -wCab + 11.5, zCabTop - 4],
        [uFront + 0.2, -wCab + 8, zCabTop - 4],
      ],
      [1, 0, 0],
      'rgba(255, 255, 255, 0.42)',
      undefined,
      0,
      0.22
    );
    addFace(
      [
        [uFront + 0.2, -wCab + 8.5, zWindshieldBottom + 2],
        [uFront + 0.2, -wCab + 10.5, zWindshieldBottom + 2],
        [uFront + 0.2, -wCab + 14, zCabTop - 4],
        [uFront + 0.2, -wCab + 12, zCabTop - 4],
      ],
      [1, 0, 0],
      'rgba(255, 255, 255, 0.2)',
      undefined,
      0,
      0.22
    );

    // Front Cab Horizontal Teal Stripe (Matching User Photo!)
    addFace(
      [
        [uFront + 0.15, -wCab, zWindshieldBottom - 4.5],
        [uFront + 0.15, wCab, zWindshieldBottom - 4.5],
        [uFront + 0.15, wCab, zWindshieldBottom - 1],
        [uFront + 0.15, -wCab, zWindshieldBottom - 1],
      ],
      [1, 0, 0],
      '#0d9488',
      undefined,
      0,
      0.15
    );

    // Dark Horizontal Grille (Matching User Photo!)
    addFace(
      [
        [uFront + 0.15, -wCab + 4.5, zBase + 2.5],
        [uFront + 0.15, wCab - 4.5, zBase + 2.5],
        [uFront + 0.15, wCab - 4.5, zWindshieldBottom - 6.5],
        [uFront + 0.15, -wCab + 4.5, zWindshieldBottom - 6.5],
      ],
      [1, 0, 0],
      '#1e293b',
      '#0f172a',
      0.8,
      0.15
    );
    // Grille horizontal louvers
    for (let gz = zBase + 4.5; gz <= zWindshieldBottom - 8.5; gz += 3) {
      addFace(
        [
          [uFront + 0.25, -wCab + 5.5, gz - 0.4],
          [uFront + 0.25, wCab - 5.5, gz - 0.4],
          [uFront + 0.25, wCab - 5.5, gz + 0.4],
          [uFront + 0.25, -wCab + 5.5, gz + 0.4],
        ],
        [1, 0, 0],
        '#94a3b8',
        undefined,
        0,
        0.22
      );
    }

    // Composite Projector Headlights
    [-wCab + 1, wCab - 4].forEach((hx) => {
      addFace(
        [
          [uFront + 0.2, hx, zBase + 3],
          [uFront + 0.2, hx + 3, zBase + 3],
          [uFront + 0.2, hx + 3, zBase + 7],
          [uFront + 0.2, hx, zBase + 7],
        ],
        [1, 0, 0],
        '#fef08a',
        '#ca8a04',
        0.6,
        0.2
      );
    });

    // Protruding Front Bumper with License Plate (Matching User Photo!)
    addBox(
      uFront,
      uFront + 3,
      -wCab - 0.5,
      wCab + 0.5,
      zBase - 1.5,
      zBase + 2.5,
      '#ffffff',
      '#e2e8f0',
      '#ffffff',
      '#cbd5e1',
      0.1
    );
    // License plate
    addFace(
      [
        [uFront + 3.1, -5, zBase - 0.5],
        [uFront + 3.1, 5, zBase - 0.5],
        [uFront + 3.1, 5, zBase + 1.8],
        [uFront + 3.1, -5, zBase + 1.8],
      ],
      [1, 0, 0],
      '#ffffff',
      '#0f172a',
      0.6,
      0.25
    );

    // Cab Sides: Windows, Continuing Teal Band, Stalk Mirrors
    [1, -1].forEach((sign) => {
      const vSide = sign * (wCab + 0.1);
      // Side Cabin Window
      addFace(
        [
          [uCabRear + 4, vSide, zWindshieldBottom],
          [uFront - 2.5, vSide, zWindshieldBottom],
          [uFront - 2.5, vSide, zCabTop - 2.5],
          [uCabRear + 4, vSide, zCabTop - 2.5],
        ],
        [0, sign, 0],
        '#090d16',
        '#1e293b',
        0.6,
        0.15
      );
      // Continuing Teal Band on Cab
      addFace(
        [
          [uCabRear, vSide + sign * 0.05, zWindshieldBottom - 4.5],
          [uFront, vSide + sign * 0.05, zWindshieldBottom - 4.5],
          [uFront, vSide + sign * 0.05, zWindshieldBottom - 1],
          [uCabRear, vSide + sign * 0.05, zWindshieldBottom - 1],
        ],
        [0, sign, 0],
        '#0d9488',
        undefined,
        0,
        0.18
      );
      // Stalk Side Mirror (Exact match for reference photo!)
      addBox(
        uFront - 3.5,
        uFront - 1.5,
        sign * (wCab + 0.8),
        sign * (wCab + 4.2),
        zWindshieldBottom + 1.5,
        zWindshieldBottom + 7.5,
        '#1e293b',
        '#0f172a',
        '#0f172a',
        undefined,
        0.2
      );
      // Reflective mirror glass
      addFace(
        [
          [uFront - 3.6, sign * (wCab + 1.2), zWindshieldBottom + 2.2],
          [uFront - 3.6, sign * (wCab + 3.8), zWindshieldBottom + 2.2],
          [uFront - 3.6, sign * (wCab + 3.8), zWindshieldBottom + 6.8],
          [uFront - 3.6, sign * (wCab + 1.2), zWindshieldBottom + 6.8],
        ],
        [-1, 0, 0],
        '#cbd5e1',
        undefined,
        0,
        0.25
      );
    });

    // 2. CARGO BOX / CONTAINER
    if (type === 'cont') {
      // ==================================================
      // 15 TẤN: 40FT SHIPPING CONTAINER WITH CORRUGATIONS
      // ==================================================
      // Main container body
      addBox(
        uBoxRear,
        uBoxFront,
        -halfW,
        halfW,
        zBase,
        zBoxTop,
        '#f8fafc',
        '#ffffff',
        '#f1f5f9',
        '#cbd5e1'
      );

      // Heavy Cast Corner Castings (Gù container 4 góc)
      [
        [uBoxRear, -halfW],
        [uBoxRear, halfW - 3],
        [uBoxFront - 3, -halfW],
        [uBoxFront - 3, halfW - 3],
      ].forEach(([cu, cv]) => {
        addBox(cu, cu + 3, cv, cv + 3, zBase, zBase + 4, '#334155', '#1e293b', '#1e293b', undefined, 0.1);
        addBox(cu, cu + 3, cv, cv + 3, zBoxTop - 4, zBoxTop, '#334155', '#1e293b', '#1e293b', undefined, 0.1);
      });

      // Realistic Vertical Corrugation Ribs along Container Sides
      [1, -1].forEach((sign) => {
        const vSide = sign * (halfW + 0.1);
        for (let ru = uBoxRear + 6; ru < uBoxFront - 6; ru += 7) {
          addFace(
            [
              [ru, vSide, zBase + 2],
              [ru + 3.5, vSide, zBase + 2],
              [ru + 3.5, vSide, zBoxTop - 2],
              [ru, vSide, zBoxTop - 2],
            ],
            [0, sign, 0],
            '#e2e8f0',
            undefined,
            0,
            0.05
          );
        }
        // Overlaid Dynamic Teal Livery & Container Brand
        const boxH = config.heightBody;
        addFace(
          [
            [uBoxRear, vSide + sign * 0.1, zBase],
            [uBoxFront, vSide + sign * 0.1, zBase],
            [uBoxFront, vSide + sign * 0.1, zBase + boxH * 0.38],
            [uBoxRear, vSide + sign * 0.1, zBase + boxH * 0.24],
          ],
          [0, sign, 0],
          '#0d9488',
          undefined,
          0,
          0.15
        );
        addFace(
          [
            [uBoxRear, vSide + sign * 0.1, zBase + boxH * 0.24],
            [uBoxFront, vSide + sign * 0.1, zBase + boxH * 0.38],
            [uBoxFront, vSide + sign * 0.1, zBase + boxH * 0.41],
            [uBoxRear, vSide + sign * 0.1, zBase + boxH * 0.27],
          ],
          [0, sign, 0],
          '#2dd4bf',
          undefined,
          0,
          0.18
        );
      });

      // Rear Container Doors with 4 Heavy Vertical Lock Rods
      addFace(
        [
          [uBoxRear - 0.2, -halfW + 1, zBase + 1],
          [uBoxRear - 0.2, halfW - 1, zBase + 1],
          [uBoxRear - 0.2, halfW - 1, zBoxTop - 1],
          [uBoxRear - 0.2, -halfW + 1, zBoxTop - 1],
        ],
        [-1, 0, 0],
        '#f8fafc',
        '#94a3b8',
        0.8,
        0.1
      );
      [-halfW + 5, -halfW + 11, halfW - 12, halfW - 6].forEach((rv) => {
        addFace(
          [
            [uBoxRear - 0.4, rv - 0.6, zBase + 3],
            [uBoxRear - 0.4, rv + 0.6, zBase + 3],
            [uBoxRear - 0.4, rv + 0.6, zBoxTop - 3],
            [uBoxRear - 0.4, rv - 0.6, zBoxTop - 3],
          ],
          [-1, 0, 0],
          '#64748b',
          '#334155',
          0.5,
          0.2
        );
      });

      // Rear Underrun Hazard Chevron Bumper (Red & White Reflective Stripes)
      addFace(
        [
          [uBoxRear - 0.5, -halfW, zBase - 1],
          [uBoxRear - 0.5, halfW, zBase - 1],
          [uBoxRear - 0.5, halfW, zBase + 2],
          [uBoxRear - 0.5, -halfW, zBase + 2],
        ],
        [-1, 0, 0],
        '#ef4444',
        '#dc2626',
        0.6,
        0.2
      );
      for (let chV = -halfW + 2; chV < halfW - 2; chV += 6) {
        addFace(
          [
            [uBoxRear - 0.6, chV, zBase - 1],
            [uBoxRear - 0.6, chV + 3, zBase - 1],
            [uBoxRear - 0.6, chV + 4, zBase + 2],
            [uBoxRear - 0.6, chV + 1, zBase + 2],
          ],
          [-1, 0, 0],
          '#ffffff',
          undefined,
          0,
          0.25
        );
      }

    } else {
      // ==================================================
      // 8 TẤN (HERO) & 1-5 TẤN: CRISP WHITE CARGO BOX + TEAL WAVE
      // ==================================================
      addBox(
        uBoxRear,
        uBoxFront,
        -halfW,
        halfW,
        zBase,
        zBoxTop,
        '#ffffff',
        '#f8fafc',
        '#ffffff',
        '#cbd5e1'
      );

      // Top Edge Bevel & Corner Caps
      addFace(
        [
          [uBoxRear, -halfW, zBoxTop],
          [uBoxFront, -halfW, zBoxTop],
          [uBoxFront, halfW, zBoxTop],
          [uBoxRear, halfW, zBoxTop],
        ],
        [0, 0, 1],
        '#ffffff',
        '#cbd5e1',
        0.8,
        0.05
      );

      // Signature Dynamic Teal Wave Livery (MATCHING REFERENCE IMAGE!)
      [1, -1].forEach((sign) => {
        const vSide = sign * (halfW + 0.15);
        const boxH = config.heightBody;
        const uMid = (uBoxRear + uBoxFront) / 2;

        // Smooth flowing wave curve
        const zFrontWave = zBase + boxH * 0.44;
        const zMidWave = zBase + boxH * 0.22;
        const zRearWave = zBase + boxH * 0.32;

        addFace(
          [
            [uBoxRear, vSide, zBase],
            [uBoxFront, vSide, zBase],
            [uBoxFront, vSide, zFrontWave],
            [uMid + (uBoxFront - uMid) * 0.45, vSide, zMidWave + (zFrontWave - zMidWave) * 0.4],
            [uMid, vSide, zMidWave],
            [uBoxRear + (uMid - uBoxRear) * 0.55, vSide, zMidWave + (zRearWave - zMidWave) * 0.3],
            [uBoxRear, vSide, zRearWave],
          ],
          [0, sign, 0],
          '#0d9488',
          undefined,
          0,
          0.12
        );

        // Bright Cyan Wave Crest Accent Ribbon
        addFace(
          [
            [uBoxRear, vSide, zRearWave],
            [uMid, vSide, zMidWave],
            [uBoxFront, vSide, zFrontWave],
            [uBoxFront, vSide, zFrontWave + 1.8],
            [uMid, vSide, zMidWave + 1.5],
            [uBoxRear, vSide, zRearWave + 1.8],
          ],
          [0, sign, 0],
          '#2dd4bf',
          undefined,
          0,
          0.15
        );

        // Bottom Black Under-chassis Base Rail (Matching Reference Photo!)
        addFace(
          [
            [uBoxRear, vSide, zBase],
            [uBoxFront, vSide, zBase],
            [uBoxFront, vSide, zBase + 2],
            [uBoxRear, vSide, zBase + 2],
          ],
          [0, sign, 0],
          '#18181b',
          undefined,
          0,
          0.18
        );

        // Logistics Brand Logo & "Nordline" Style Emblem
        const logoU = uBoxRear + (uBoxFront - uBoxRear) * 0.28;
        const logoZ = zBase + boxH * 0.68;
        const logoW = 7;
        const logoH = 5.5;

        // Geometric Teal Logo
        addFace(
          [
            [logoU, vSide + sign * 0.05, logoZ],
            [logoU + logoW * 0.5, vSide + sign * 0.05, logoZ + logoH],
            [logoU + logoW, vSide + sign * 0.05, logoZ],
            [logoU + logoW * 0.75, vSide + sign * 0.05, logoZ + logoH * 0.5],
            [logoU + logoW * 0.5, vSide + sign * 0.05, logoZ],
            [logoU + logoW * 0.25, vSide + sign * 0.05, logoZ + logoH * 0.5],
          ],
          [0, sign, 0],
          '#0d9488',
          undefined,
          0,
          0.22
        );
        // Clean Brand Typography Bar
        addFace(
          [
            [logoU + logoW + 2, vSide + sign * 0.05, logoZ + 1.5],
            [logoU + logoW + 18, vSide + sign * 0.05, logoZ + 1.5],
            [logoU + logoW + 18, vSide + sign * 0.05, logoZ + 4.5],
            [logoU + logoW + 2, vSide + sign * 0.05, logoZ + 4.5],
          ],
          [0, sign, 0],
          '#0f172a',
          undefined,
          0,
          0.22
        );
      });

      // Side Underrun Safety Guard Rails (Thanh chắn hông an toàn)
      [1, -1].forEach((sign) => {
        const vGuard = sign * (halfW + 0.3);
        const uGuardFront = uCabRear - 4;
        const uGuardRear = uBoxRear + (type === 'big' ? 36 : 20);
        addBox(
          uGuardRear,
          uGuardFront,
          vGuard - 0.5,
          vGuard + 0.5,
          zBase - 3.5,
          zBase - 1.5,
          '#94a3b8',
          '#64748b',
          '#64748b',
          undefined,
          0.1
        );
      });

      // Cylindrical Fuel Tank on Right Side
      addBox(
        uCabRear - 18,
        uCabRear - 4,
        halfW - 5,
        halfW + 0.2,
        zBase - 4,
        zBase,
        '#64748b',
        '#475569',
        '#334155',
        undefined,
        0.1
      );

      // Rear Cargo Double Doors with Dual Stainless Steel Locking Rods
      addFace(
        [
          [uBoxRear - 0.2, -halfW + 1, zBase + 2],
          [uBoxRear - 0.2, halfW - 1, zBase + 2],
          [uBoxRear - 0.2, halfW - 1, zBoxTop - 2],
          [uBoxRear - 0.2, -halfW + 1, zBoxTop - 2],
        ],
        [-1, 0, 0],
        '#ffffff',
        '#cbd5e1',
        0.8,
        0.1
      );
      // Twin vertical locking rods
      [-halfW + 4, halfW - 4].forEach((rv) => {
        addFace(
          [
            [uBoxRear - 0.4, rv - 0.5, zBase + 3],
            [uBoxRear - 0.4, rv + 0.5, zBase + 3],
            [uBoxRear - 0.4, rv + 0.5, zBoxTop - 3],
            [uBoxRear - 0.4, rv - 0.5, zBoxTop - 3],
          ],
          [-1, 0, 0],
          '#94a3b8',
          '#64748b',
          0.6,
          0.2
        );
      });
      // Rear LED Tail Lights
      [-halfW + 2, halfW - 6].forEach((tlV) => {
        addFace(
          [
            [uBoxRear - 0.3, tlV, zBase + 2],
            [uBoxRear - 0.3, tlV + 4, zBase + 2],
            [uBoxRear - 0.3, tlV + 4, zBase + 5.5],
            [uBoxRear - 0.3, tlV, zBase + 5.5],
          ],
          [-1, 0, 0],
          '#ef4444',
          '#b91c1c',
          0.6,
          0.25
        );
      });
    }

    // 3. WHEELS ACCORDING TO TRUCK TYPE
    // Front Steer Axle (Single wheel on each side)
    const uFrontWheel = uFront - 7;
    addWheel3D(uFrontWheel, true, 5.8);
    addWheel3D(uFrontWheel, false, 5.8);

    if (type === 'big') {
      // 8 TẤN (HERO): TANDEM DUAL REAR AXLES (2 axles = 4 wheels at rear, exactly matching the reference photo!)
      const uRearAxle1 = uBoxRear + 14;
      const uRearAxle2 = uBoxRear + 26;
      addWheel3D(uRearAxle1, true, 5.8);
      addWheel3D(uRearAxle1, false, 5.8);
      addWheel3D(uRearAxle2, true, 5.8);
      addWheel3D(uRearAxle2, false, 5.8);
    } else if (type === 'cont') {
      // 15 TẤN: TRIPLE REAR AXLES (3 axles = 6 wheels on the trailer bogie)
      const uR1 = uBoxRear + 14;
      const uR2 = uBoxRear + 26;
      const uR3 = uBoxRear + 38;
      addWheel3D(uR1, true, 6.0);
      addWheel3D(uR1, false, 6.0);
      addWheel3D(uR2, true, 6.0);
      addWheel3D(uR2, false, 6.0);
      addWheel3D(uR3, true, 6.0);
      addWheel3D(uR3, false, 6.0);
    } else {
      // 1-5 TẤN: SINGLE REAR AXLE
      const uR = uBoxRear + 14;
      addWheel3D(uR, true, 5.6);
      addWheel3D(uR, false, 5.6);
    }
  }

  // ----------------------------------------------------
  // PAINTER'S ALGORITHM: SORT FACES FROM BACK TO FRONT
  // ----------------------------------------------------
  faces.sort((a, b) => a.depth - b.depth);

  let output = '';
  for (let i = 0; i < faces.length; i++) {
    const face = faces[i];
    output += renderPolygon3D(face.pts, face.fill, face.stroke);
  }

  // Blinking Amber Safety Light on Roof
  const [hzX, hzY] = isoPoint(
    pose.x + (uFront - 5) * c,
    pose.y + (uFront - 5) * s,
    zCabTop + 1.5
  );
  output += `<circle class="hazard-indicator" cx="${hzX.toFixed(1)}" cy="${hzY.toFixed(1)}" r="2.5" fill="#f59e0b" stroke="#ffffff" stroke-width="0.8"/>`;

  return output;
}

