/** All dimensions are logical pixels. Device coordinates are local to each team. */
export interface Point { x: number; y: number }
export interface Rect extends Point { width: number; height: number }

// Meaning is independent of the label/color; the simulation consumes these actions.
export type SlotAction =
  | { kind: 'effect'; effectId: string; target: 'lower-start' }
  | { kind: 'multiplier'; factor: number; target: 'lower-start' }
  | { kind: 'deploy'; target: 'battle' };

export interface SlotDefinition {
  id: string;
  label: string;
  color: number;
  action: SlotAction;
  /** Omit to share the remaining row width equally. */
  width?: number;
  height?: number;
  openingWidth?: number;
}

export interface SlotRowConfig {
  inset: number;
  gap: number;
  height: number;
  openingWidth: number;
  funnelHeight: number;
  /** Open = sensor-only band, without any solid plates or dividers. */
  entrance: 'open' | 'flat' | 'funnel' | 'crater' | 'bowl';
  bowlSegments?: number;
  /** Flat fraction of each shoulder; omit for the original rounded bowl. */
  plateau?: number;
  /** Space reserved for the central cannon base before the first hole. */
  innerInset?: number;
  slots: SlotDefinition[];
}

export interface DeviceConfig extends Rect {
  wallThickness: number;
  title: string;
  /** Local to this device, not the whole team. */
  start: Point & { radius: number; label: string };
  row: SlotRowConfig;
}

export interface MarbleConfig {
  upper: DeviceConfig & {
    mountainOverlap: number;
    mountains: { id: string; x: number; y: number; width: number; height: number; topWidth: number }[];
  };
  lower: DeviceConfig & {
    pins: {
      radius: number;
      spacingX: number;
      spacingY: number;
      firstY: number;
      centerX: number;
      rowCounts: number[];
      /** null follows the inside bottom edge when the device size changes. */
      spawnY: number | null;
      spawnBottomInset: number;
      despawnY: number;
      /** Optional explicit device-local positions replace the generated rows. */
      positions?: Point[];
    };
  };
}

export const screenConfig = {
  width: 1080,
  height: 1920,
  // Ordered top to bottom. Heights and origins are calculated from these weights.
  ratios: { stream: 3, battle: 4, marble: 3 },
};

export const teams = [
  { id: 'red', label: '赤陣営', color: 0xf27786 },
  { id: 'blue', label: '青陣営', color: 0x70b5ff },
] as const;
export type Team = typeof teams[number];

export const palette = {
  background: 0x0d1522,
  panel: 0x142033,
  device: 0x0b1422,
  wall: 0x62768e,
  line: 0x2a3b52,
  text: 0xeaf1fb,
  muted: 0x9aacc3,
  pin: 0xd8e4f4,
};

// Display grouping only: effect actions remain unchanged.
export const upperPresentation = {
  cannon: { pivotX: 10, pivotY: 35, length: 38, width: 20, hubRadius: 24 },
  bandY: 48, bandHeight: 42, labelSize: 23,
  zones: [
    { label: 'Missile', effects: ['straight'], red: 0xffe84a, blue: 0x983dff },
    { label: 'Shotgun', effects: ['left', 'right'], red: 0x9af526, blue: 0x25e4ed },
    { label: 'Gatling', effects: ['heal'], red: 0xff941f, blue: 0x2692ff },
  ],
};

export const effectGroups = [
  { id: 'straight', label: 'S', color: 0xffe84a, count: 3 },
  { id: 'left', label: 'L', color: 0x25e4ed, count: 1 },
  { id: 'right', label: 'R', color: 0xf34de2, count: 1 },
  { id: 'heal', label: 'H', color: 0x48ee68, count: 2 },
];
export function createEffectSlots(groups = effectGroups): SlotDefinition[] {
  return groups.flatMap(group => {
    if (!Number.isInteger(group.count) || group.count < 0) throw new Error(`Invalid effect count: ${group.id}`);
    return Array.from({ length: group.count }, (_, i) => ({
      id: `${group.id}-${i + 1}`, label: group.label, color: group.color,
      action: { kind: 'effect' as const, effectId: group.id, target: 'lower-start' as const },
    }));
  });
}

/** Shared by both teams. Edit here; Vite reloads the layout automatically. */
export const marbleConfig: MarbleConfig = {
  upper: {
    x: 4, y: 4, width: 532, height: 130,
    title: '01  効果取得',
    wallThickness: 5,
    start: { x: 58, y: 35, radius: 9, label: '生成地点' },
    mountainOverlap: 8, // Allowed base overlap into the effect row, in pixels.
    mountains: [
      { id: 'left', x: 266, y: 81.5, width: 18, height: 51, topWidth: 0 },
      { id: 'right', x: 266, y: 81.5, width: 18, height: 51, topWidth: 0 },
    ],
    row: {
      inset: 0, gap: 0, height: 24, openingWidth: 20, funnelHeight: 6, entrance: 'bowl', bowlSegments: 8, plateau: 0.5, innerInset: 48,
      slots: createEffectSlots(),
    },
  },
  lower: {
    x: 4, y: 138, width: 532, height: 438,
    title: '02  倍率変更・出撃抽選',
    wallThickness: 5,
    start: { x: 266, y: 26, radius: 10, label: 'ワープ先 / 再抽選' },
    pins: {
      radius: 5, spacingX: 66, spacingY: 32, firstY: 70,
      centerX: 266, rowCounts: [7, 8, 7, 8, 7, 8, 7, 8, 7],
      spawnY: null, spawnBottomInset: 1, despawnY: 54,
    },
    row: {
      inset: 0, gap: 0, height: 42, openingWidth: 30, funnelHeight: 0, entrance: 'open',
      slots: [
        { id: 'double-left', label: '×2', color: 0xf3bb65, action: { kind: 'multiplier', factor: 2, target: 'lower-start' } },
        { id: 'deploy-left', label: '出撃', color: 0x83d5ad, action: { kind: 'deploy', target: 'battle' } },
        { id: 'triple', label: '×3', color: 0xb79af5, action: { kind: 'multiplier', factor: 3, target: 'lower-start' } },
        { id: 'deploy-right', label: '出撃', color: 0x83d5ad, action: { kind: 'deploy', target: 'battle' } },
        { id: 'double-right', label: '×2', color: 0xf3bb65, action: { kind: 'multiplier', factor: 2, target: 'lower-start' } },
      ],
    },
  },
};
