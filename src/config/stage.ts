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
  upper: DeviceConfig;
  lower: DeviceConfig & {
    pins: {
      radius: number;
      spacingX: number;
      spacingY: number;
      firstY: number;
      centerX: number;
      rowCounts: number[];
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

/** Shared by both teams. Edit here; Vite reloads the layout automatically. */
export const marbleConfig: MarbleConfig = {
  upper: {
    x: 20, y: 52, width: 500, height: 188,
    title: '01  効果取得',
    wallThickness: 5,
    start: { x: 58, y: 72, radius: 9, label: '生成地点' },
    row: {
      inset: 10, gap: 6, height: 36, openingWidth: 54, funnelHeight: 16,
      slots: [
        { id: 'effect-a', label: '効果 A', color: 0xf3bb65, action: { kind: 'effect', effectId: 'effect-a', target: 'lower-start' } },
        { id: 'effect-b', label: '効果 B', color: 0x83d5ad, action: { kind: 'effect', effectId: 'effect-b', target: 'lower-start' } },
        { id: 'effect-c', label: '効果 C', color: 0xb79af5, action: { kind: 'effect', effectId: 'effect-c', target: 'lower-start' } },
        { id: 'effect-d', label: '効果 D', color: 0x7dcee0, action: { kind: 'effect', effectId: 'effect-d', target: 'lower-start' } },
      ],
    },
  },
  lower: {
    x: 20, y: 280, width: 500, height: 276,
    title: '02  倍率変更・出撃抽選',
    wallThickness: 5,
    start: { x: 250, y: 58, radius: 10, label: 'ワープ先 / 再抽選' },
    pins: {
      radius: 5, spacingX: 70, spacingY: 32, firstY: 94,
      centerX: 250, rowCounts: [5, 6, 5],
    },
    row: {
      inset: 10, gap: 6, height: 42, openingWidth: 30, funnelHeight: 26,
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
