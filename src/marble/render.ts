import { Container, Graphics, Text } from 'pixi.js';
import { palette, type Team } from '../config/stage';
import type { DeviceLayout, MarbleLayout, SlotLayout } from './layout';
import type { PhysicsConfig } from '../config/physics';
import type { TeamSimulation } from './simulation';

export function label(text: string, x: number, y: number, size: number, color = palette.text): Text {
  const item = new Text({
    text,
    style: { fontFamily: '"Yu Gothic", "Meiryo", sans-serif', fontSize: size, fontWeight: 'bold', fill: color },
  });
  item.anchor.set(0.5);
  item.position.set(x, y);
  return item;
}

function drawSlot(slot: SlotLayout): Container {
  const view = new Container({ label: slot.definition.id });
  view.position.set(slot.x, slot.y);
  const { width, height, definition } = slot;
  const shape = new Graphics()
    .rect(0, 0, width, height).fill({ color: definition.color, alpha: 0.17 });
  slot.solids.forEach((points) => shape.poly(points).fill({ color: definition.color, alpha: 0.85 }));
  view.addChild(shape);
  const title = label(definition.label, width / 2, height / 2, 21, definition.color);
  const fit = Math.min(1, Math.max(1, width - 8) / title.width, Math.max(1, height - 4) / title.height);
  title.scale.set(fit);
  view.addChild(title);
  return view;
}

function drawDevice(device: DeviceLayout, team: Team, isLower: boolean): Container {
  const view = new Container({ label: isLower ? 'lower' : 'upper' });
  view.position.set(device.bounds.x, device.bounds.y);
  const graphics = new Graphics()
    .rect(0, 0, device.bounds.width, device.bounds.height).fill(palette.device);
  device.walls.forEach((wall) => graphics.rect(wall.x, wall.y, wall.width, wall.height).fill(palette.wall));
  const start = device.start;
  graphics.circle(start.x, start.y, start.radius);
  if (isLower) graphics.stroke({ width: 3, color: team.color });
  else graphics.fill(team.color);
  view.addChild(graphics);
  const title = label(device.title, 16, 22, 18, palette.muted);
  title.anchor.x = 0;
  view.addChild(title);
  const startLabel = label(start.label, start.x + start.radius + 12, start.y, 16, palette.muted);
  startLabel.anchor.x = 0;
  view.addChild(startLabel);
  device.slots.forEach((slot) => view.addChild(drawSlot(slot)));
  return view;
}

export function createMarbleTeam(layout: MarbleLayout, team: Team, width: number, height: number): Container {
  const view = new Container({ label: team.id });
  view.addChild(new Graphics()
    .rect(0, 0, width, height).fill({ color: team.color, alpha: 0.045 })
    .rect(20, 16, 5, 22).fill(team.color));
  const heading = label(team.label, 36, 27, 24, team.color);
  heading.anchor.x = 0;
  view.addChild(heading);
  const caption = label('MARBLE ZONE', width - 20, 27, 16, palette.muted);
  caption.anchor.x = 1;
  view.addChild(caption);
  view.addChild(drawDevice(layout.upper, team, false));
  const lower = drawDevice(layout.lower, team, true);
  const pins = new Graphics({ label: 'pins' });
  layout.pins.forEach((pin) => pins.circle(pin.x, pin.y, pin.radius).fill(palette.pin));
  lower.addChild(pins);
  view.addChild(lower);

  const gapTop = layout.upper.bounds.y + layout.upper.bounds.height;
  const gapBottom = layout.lower.bounds.y;
  view.addChild(label('↓ 効果取得後、下段へワープ', width / 2, (gapTop + gapBottom) / 2, 17, palette.muted));
  return view;
}

/** Reuse each ball graphic until its game record is removed. No physics decisions here. */
export function createMarbleRenderer(parent: Container, team: Team, config: PhysicsConfig) {
  const layer = new Container({ label: 'moving-marbles' });
  const debug = new Graphics({ label: 'physics-colliders' });
  parent.addChild(layer, debug);
  const balls = new Map<number, Graphics>();
  return (state: TeamSimulation, alpha: number, showColliders: boolean) => {
    for (const [id, ball] of balls) {
      if (!state.marbles.has(id)) { ball.destroy(); balls.delete(id); }
    }
    for (const marble of state.marbles.values()) {
      let ball = balls.get(marble.id);
      if (!ball) {
        const r = config.marble.radius;
        ball = new Graphics().circle(0, 0, r).fill(team.color)
          .stroke({ width: 1, color: 0xffffff })
          .circle(r * 0.35, -r * 0.3, r * 0.23).fill(0xffffff);
        balls.set(marble.id, ball);
        layer.addChild(ball);
      }
      const pose = state.physics.pose(marble.id, alpha);
      ball.visible = pose !== undefined;
      if (pose) { ball.position.set(pose.x, pose.y); ball.rotation = pose.angle; }
    }
    debug.clear();
    if (showColliders) {
      const vertices = state.physics.debugLines();
      const scale = state.physics.scale;
      for (let i = 0; i < vertices.length; i += 4) {
        debug.moveTo(vertices[i] * scale, vertices[i + 1] * scale)
          .lineTo(vertices[i + 2] * scale, vertices[i + 3] * scale);
      }
      debug.stroke({ width: 1, color: 0x4dffca, alpha: 0.9 });
    }
  };
}
