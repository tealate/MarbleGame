import {
  screenConfig,
  type Team, type DeviceConfig, type MarbleConfig, type Point, type Rect, type SlotDefinition,
} from '../config/stage';

export interface SlotLayout extends Rect {
  definition: SlotDefinition;
  openingWidth: number;
  funnelHeight: number;
  outerEdgeY: number;
  /** Slot-local solid polygons shared verbatim by drawing and Rapier. */
  solids: Point[][];
  /** Inside the pocket, below its open mouth; never a solid collider. */
  sensor: Rect;
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
  mountainOverlap: number;
  mountains: { id: string; position: Point; points: Point[]; width: number; height: number }[];
  pinFlow: { spawnY: number; despawnY: number; spacingY: number; radius: number; rows: number[][] };
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
  const available = width - (row.innerInset ?? 0) - 2 * (wall + row.inset) - row.gap * (row.slots.length - 1);
  const fixed = row.slots.reduce((sum, slot) => sum + (slot.width ?? 0), 0);
  const automatic = row.slots.filter((slot) => slot.width === undefined).length;
  const defaultWidth = automatic ? (available - fixed) / automatic : 0;
  if (wall <= 0 || width <= 2 * wall || height <= 2 * wall || row.slots.length === 0
      || row.inset < 0 || row.gap < 0 || fixed > available) {
    throw new Error(`Invalid device or slot row dimensions: ${config.title}`);
  }
  const ids = new Set<string>();
  let nextX = wall + row.inset + (row.innerInset ?? 0);
  const slots = row.slots.map((definition): SlotLayout => {
    const slotWidth = definition.width ?? defaultWidth;
    const slotHeight = definition.height ?? row.height;
    const open = row.entrance === 'open';
    const openingWidth = open ? slotWidth : definition.openingWidth ?? row.openingWidth;
    if (ids.has(definition.id) || slotWidth <= 0 || slotHeight <= 0
        || openingWidth <= 0 || openingWidth > slotWidth || row.funnelHeight < 0
        || slotHeight + row.funnelHeight >= height - 2 * wall) {
      throw new Error(`Invalid slot dimensions or duplicate ID: ${definition.id}`);
    }
    ids.add(definition.id);
    const thickness = Math.min(wall, 3);
    const left = (slotWidth - openingWidth) / 2;
    const right = left + openingWidth;
    const box = (x: number, y: number, w: number, h: number): Point[] =>
      [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
    const solids = [
      box(0, thickness, thickness, slotHeight - thickness),
      box(slotWidth - thickness, thickness, thickness, slotHeight - thickness),
      box(0, slotHeight - thickness, slotWidth, thickness),
    ];
    const slopeHeight = row.entrance === 'flat' || open ? 0 : row.funnelHeight;
    const outerEdgeY = (row.entrance === 'funnel' || row.entrance === 'bowl') ? -slopeHeight : 0;
    const innerEdgeY = row.entrance === 'crater' ? -slopeHeight : 0;
    if (left > 0) solids.push(
      [{ x: 0, y: outerEdgeY }, { x: left, y: innerEdgeY },
        { x: left, y: thickness }, { x: 0, y: thickness }],
      [{ x: right, y: innerEdgeY }, { x: slotWidth, y: outerEdgeY },
        { x: slotWidth, y: thickness }, { x: right, y: thickness }],
    );
    if (row.entrance === 'bowl') {
      const segments = row.bowlSegments ?? 8;
      if (!Number.isInteger(segments) || segments < 2 || segments > 32) throw new Error('bowlSegments must be 2..32');
      solids.length = 0;
      // Optional flat shoulders form low trapezoids; otherwise use smoothstep bowls.
      // Each convex strip is used unchanged by Pixi and Rapier.
      for (let i = 0; i < segments; i++) {
        const a = i / segments, b = (i + 1) / segments;
        const surface = (t: number) => {
          if (row.plateau === undefined) return (-slopeHeight * (1 - t * t * (3 - 2 * t))) || 0;
          const plateau = row.plateau;
          if (plateau < 0 || plateau >= 1) throw new Error('plateau must be 0..1');
          return -slopeHeight * (1 - Math.max(0, (t - plateau) / (1 - plateau))) || 0;
        };
        const x1 = left * a, x2 = left * b;
        const y1 = surface(a), y2 = surface(b);
        if (left > 0) {
          solids.push([{ x: x1, y: y1 }, { x: x2, y: y2 }, { x: x2, y: slotHeight }, { x: x1, y: slotHeight }]);
          solids.push([{ x: slotWidth - x2, y: y2 }, { x: slotWidth - x1, y: y1 },
            { x: slotWidth - x1, y: slotHeight }, { x: slotWidth - x2, y: slotHeight }]);
        }
      }
    }
    if (slotHeight <= 2 * thickness) throw new Error(`Slot too shallow: ${definition.id}`);
    const slot = {
      definition, x: nextX, y: height - wall - slotHeight,
      width: slotWidth, height: slotHeight, openingWidth, funnelHeight: slopeHeight, outerEdgeY,
      solids: open ? [] : solids,
      sensor: open ? { x: 0, y: 0, width: slotWidth, height: slotHeight }
        : { x: left, y: row.entrance === 'bowl' ? 0 : thickness, width: openingWidth, height: slotHeight - 2 * thickness },
    };
    nextX += slotWidth + row.gap;
    return slot;
  });
  // Close only the gaps BETWEEN pockets, never their openings. These small caps
  // are visible as well as solid, so smaller marbles cannot fall behind the row.
  const caps: Rect[] = [];
  let previousRight = wall;
  slots.forEach((slot) => {
    if (slot.x > previousRight) caps.push({ x: previousRight,
      y: slot.y + slot.outerEdgeY, width: slot.x - previousRight, height: Math.min(wall, 3) });
    previousRight = slot.x + slot.width;
  });
  const last = slots[slots.length - 1];
  if (previousRight < width - wall) caps.push({ x: previousRight,
    y: last.y + last.outerEdgeY, width: width - wall - previousRight, height: Math.min(wall, 3) });
  return {
    bounds: { x, y, width, height }, title: config.title, wallThickness: wall,
    start: { ...config.start }, slots,
    walls: [
      { x: 0, y: 0, width, height: wall },
      { x: 0, y: wall, width: wall, height: height - 2 * wall },
      { x: width - wall, y: wall, width: wall, height: height - 2 * wall },
      { x: 0, y: height - wall, width, height: wall },
      ...(row.entrance === 'open' ? [] : caps),
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
  const rows = [...new Set(positions.map((p) => p.y))].sort((a, b) => a - b)
    .slice(0, 2).map((y) => positions.filter((p) => p.y === y).map((p) => p.x));
  const mountains = config.upper.mountains.map((m) => {
    if (m.width <= 0 || m.height <= 0 || m.topWidth < 0 || m.topWidth >= m.width) {
      throw new Error(`Invalid mountain dimensions: ${m.id}`);
    }
    const points = [{ x: -m.width / 2, y: m.height / 2 },
      { x: m.topWidth === 0 ? 0 : -m.topWidth / 2, y: -m.height / 2 }];
    if (m.topWidth > 0) points.push({ x: m.topWidth / 2, y: -m.height / 2 });
    points.push({ x: m.width / 2, y: m.height / 2 });
    return { id: m.id, position: { x: m.x, y: m.y }, points, width: m.width, height: m.height };
  });
  return {
    upper: createDevice(config.upper),
    lower: createDevice(config.lower),
    pins: positions.map((point) => ({ ...point, radius: pins.radius })),
    mountains,
    mountainOverlap: config.upper.mountainOverlap,
    pinFlow: {
      spawnY: pins.spawnY ?? config.lower.height - config.lower.wallThickness - pins.radius - pins.spawnBottomInset,
      despawnY: pins.despawnY, spacingY: pins.spacingY, radius: pins.radius, rows,
    },
  };
}

/** Mirror only the upper device; lower physics and labels keep their orientation. */
export function layoutForTeam(layout: MarbleLayout, team: Team['id']): MarbleLayout {
  if (team === 'blue') return layout;
  const upper = structuredClone(layout.upper);
  const width = upper.bounds.width;
  upper.start.x = width - upper.start.x;
  upper.walls.forEach(w => { w.x = width - w.x - w.width; });
  upper.slots.forEach(s => { s.x = width - s.x - s.width; });
  return { ...layout, upper };
}
