import {
  screenConfig,
  type DeviceConfig, type MarbleConfig, type Point, type Rect, type SlotDefinition,
} from '../config/stage';

export interface SlotLayout extends Rect {
  definition: SlotDefinition;
  openingWidth: number;
  funnelHeight: number;
}

export interface DeviceLayout {
  bounds: Rect;
  title: string;
  wallThickness: number;
  walls: Rect[];
  start: DeviceConfig['start'];
  slots: SlotLayout[];
}

/** Plain, serializable geometry; no Pixi objects or game state. */
export interface MarbleLayout {
  upper: DeviceLayout;
  lower: DeviceLayout;
  pins: (Point & { radius: number })[];
}

export function createScreenLayout(config = screenConfig) {
  const { width, height, ratios } = config;
  const unit = height / (ratios.stream + ratios.battle + ratios.marble);
  const stream = { x: 0, y: 0, width, height: unit * ratios.stream };
  const battle = { x: 0, y: stream.height, width, height: unit * ratios.battle };
  const marble = { x: 0, y: battle.y + battle.height, width, height: unit * ratios.marble };
  return { stream, battle, marble, teamWidth: width / 2 };
}

function createDevice(config: DeviceConfig): DeviceLayout {
  const { x, y, width, height, wallThickness: wall, row } = config;
  const available = width - 2 * (wall + row.inset) - row.gap * (row.slots.length - 1);
  const fixed = row.slots.reduce((sum, slot) => sum + (slot.width ?? 0), 0);
  const automatic = row.slots.filter((slot) => slot.width === undefined).length;
  const defaultWidth = automatic ? (available - fixed) / automatic : 0;
  if (wall <= 0 || width <= 2 * wall || height <= 2 * wall || row.slots.length === 0
      || row.inset < 0 || row.gap < 0 || fixed > available) {
    throw new Error(`Invalid device or slot row dimensions: ${config.title}`);
  }
  const ids = new Set<string>();
  let nextX = wall + row.inset;
  const slots = row.slots.map((definition): SlotLayout => {
    const slotWidth = definition.width ?? defaultWidth;
    const slotHeight = definition.height ?? row.height;
    const openingWidth = definition.openingWidth ?? row.openingWidth;
    if (ids.has(definition.id) || slotWidth <= 0 || slotHeight <= 0
        || openingWidth <= 0 || openingWidth > slotWidth || row.funnelHeight < 0
        || slotHeight + row.funnelHeight >= height - 2 * wall) {
      throw new Error(`Invalid slot dimensions or duplicate ID: ${definition.id}`);
    }
    ids.add(definition.id);
    const slot = {
      definition, x: nextX, y: height - wall - slotHeight,
      width: slotWidth, height: slotHeight, openingWidth, funnelHeight: row.funnelHeight,
    };
    nextX += slotWidth + row.gap;
    return slot;
  });
  return {
    bounds: { x, y, width, height }, title: config.title, wallThickness: wall,
    start: { ...config.start }, slots,
    walls: [
      { x: 0, y: 0, width, height: wall },
      { x: 0, y: wall, width: wall, height: height - 2 * wall },
      { x: width - wall, y: wall, width: wall, height: height - 2 * wall },
      { x: 0, y: height - wall, width, height: wall },
    ],
  };
}

export function createMarbleLayout(config: MarbleConfig): MarbleLayout {
  const pins = config.lower.pins;
  const positions = pins.positions ?? pins.rowCounts.flatMap((count, row) =>
    Array.from({ length: count }, (_, column) => ({
      x: pins.centerX + (column - (count - 1) / 2) * pins.spacingX,
      y: pins.firstY + row * pins.spacingY,
    })),
  );
  return {
    upper: createDevice(config.upper),
    lower: createDevice(config.lower),
    pins: positions.map((point) => ({ ...point, radius: pins.radius })),
  };
}
