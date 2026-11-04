import { Container, Graphics, Text } from 'pixi.js';
import { palette, upperPresentation, type Team } from '../config/stage';
import type { DeviceLayout, MarbleLayout, SlotLayout } from './layout';
import type { PhysicsConfig } from '../config/physics';
import type { TeamSimulation } from './simulation';
import { cannonPose } from './cannon';

export function label(text: string, x: number, y: number, size: number, color = palette.text): Text {
  const item = new Text({
    text,
    style: { fontFamily: '"Yu Gothic", "Meiryo", sans-serif', fontSize: size, fontWeight: 'bold', fill: color },
  });
  item.anchor.set(0.5);
  item.position.set(x, y);
  return item;
}

function drawSlot(slot: SlotLayout, effectColor?: number): Container {
  const view = new Container({ label: slot.definition.id });
  view.position.set(slot.x, slot.y);
  const { width, height, definition } = slot;
  const shape = new Graphics()
    .rect(0, 0, width, height).fill({ color: definition.color, alpha: 0.17 });
  if (effectColor !== undefined) {
    const mouth = (width - slot.openingWidth) / 2;
    shape.rect(mouth, 0, slot.openingWidth, height).fill({ color: effectColor, alpha: 0.8 });
    shape.rect(mouth, height - 4, slot.openingWidth, 4).fill(effectColor);
  }
  slot.solids.forEach((points) => shape.poly(points).fill({ color: effectColor === undefined ? definition.color : palette.wall, alpha: 1 }));
  view.addChild(shape);
  if (effectColor !== undefined) return view;
  // Actions carry meaning; editable labels remain available for tools/debugging.
  if (definition.action.kind === 'deploy') {
    const size = Math.min(12, width / 4, height / 3);
    shape.poly([{ x: width / 2, y: height / 2 - size },
      { x: width / 2 + size, y: height / 2 + size },
      { x: width / 2, y: height / 2 + size / 2 },
      { x: width / 2 - size, y: height / 2 + size }]).fill(definition.color);
    return view;
  }
  const text = definition.action.kind === 'multiplier' ? `×${definition.action.factor}`
    : definition.label;
  const title = label(text, width / 2, height / 2, 21, definition.color);
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
  if (isLower) graphics.circle(start.x, start.y, start.radius).stroke({ width: 3, color: team.color });
  view.addChild(graphics);
  if (!isLower) {
    for (const zone of upperPresentation.zones) {
      const slots = device.slots.filter(s => s.definition.action.kind === 'effect' && zone.effects.includes(s.definition.action.effectId));
      if (!slots.length) continue;
      const left = Math.min(...slots.map(s => s.x));
      const right = Math.max(...slots.map(s => s.x + s.width));
      const color = zone[team.id];
      graphics.rect(left, upperPresentation.bandY, right - left, upperPresentation.bandHeight).fill({ color, alpha: 0.12 });
      const title = label(zone.label, (left + right) / 2, upperPresentation.bandY + upperPresentation.bandHeight / 2,
        upperPresentation.labelSize, color);
      title.scale.set(Math.min(1, (right - left - 8) / title.width));
      view.addChild(title);
    }
  }
  device.slots.forEach((slot) => {
    const action = slot.definition.action;
    const zone = action.kind === 'effect' ? upperPresentation.zones.find(z => z.effects.includes(action.effectId)) : undefined;
    view.addChild(drawSlot(slot, isLower ? undefined : zone?.[team.id] ?? slot.definition.color));
  });
  return view;
}

export function createMarbleTeam(layout: MarbleLayout, team: Team, width: number, height: number, movingPins = false): Container {
  const view = new Container({ label: team.id });
  view.addChild(new Graphics()
    .rect(0, 0, width, height).fill({ color: team.color, alpha: 0.045 }));
  view.addChild(drawDevice(layout.upper, team, false));
  const lower = drawDevice(layout.lower, team, true);
  const pins = new Graphics({ label: 'pins' });
  if (!movingPins) layout.pins.forEach((pin) => pins.circle(pin.x, pin.y, pin.radius).fill(palette.pin));
  lower.addChild(pins);
  view.addChild(lower);

  // Team identity uses narrow color rails instead of a separate heading row.
  const rails = new Graphics();
  for (const device of [layout.upper, layout.lower]) {
    rails.rect(device.bounds.x, device.bounds.y, device.bounds.width, 3).fill(team.color);
  }
  view.addChild(rails);
  return view;
}

/** Reuse each ball graphic until its game record is removed. No physics decisions here. */
export function createMarbleRenderer(parent: Container, team: Team, config: PhysicsConfig) {
  const layer = new Container({ label: 'moving-marbles' });
  const obstacleLayer = new Container({ label: 'moving-obstacles' });
  const debug = new Graphics({ label: 'physics-colliders' });
  parent.addChild(obstacleLayer, layer, debug);
  const cannon = new Graphics({ label: 'swinging-cannon' });
  const c = upperPresentation.cannon;
  cannon.roundRect(0, -c.width / 2, c.length, c.width, 3).fill(team.color)
    .rect(c.length - 5, -c.width / 2 - 2, 5, c.width + 4).fill(team.color)
    .rect(c.length - 2, -c.width / 2 + 3, 2, c.width - 6).fill(palette.device)
    .circle(0, 0, 12).fill(team.color)
    .circle(0, 0, 9).fill(palette.wall);
  parent.addChild(cannon);
  const balls = new Map<number, Graphics>();
  const obstacles = new Map<number, Graphics>();
  return (state: TeamSimulation, alpha: number, showColliders: boolean, time = 0) => {
    const pose = cannonPose(state.physics.layout.upper, team.id, time, config);
    cannon.position.set(pose.pivot.x, pose.pivot.y);
    cannon.rotation = pose.angle;
    for (const [id, graphic] of obstacles) {
      if (!state.physics.obstacles.items.has(id)) { graphic.destroy(); obstacles.delete(id); }
    }
    for (const item of state.physics.obstacles.items.values()) {
      let graphic = obstacles.get(item.id);
      if (!graphic) {
        graphic = new Graphics();
        if (item.shape.kind === 'circle') graphic.circle(0, 0, item.shape.radius).fill(palette.pin);
        else graphic.poly(item.shape.points).fill(palette.wall);
        obstacles.set(item.id, graphic);
        obstacleLayer.addChild(graphic);
      }
      graphic.position.set(item.previous.x + (item.position.x - item.previous.x) * alpha,
        item.previous.y + (item.position.y - item.previous.y) * alpha);
    }
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
