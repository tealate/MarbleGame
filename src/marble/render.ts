import { Assets, Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import { palette, battlePresentation, upperPresentation, marblePresentation, effectPresentation, defaultEffectPresentation,
  deployPresentation, type Team } from '../config/stage';
import type { DeviceLayout, MarbleLayout, SlotLayout } from './layout';
import type { PhysicsConfig } from '../config/physics';
import type { TeamSimulation } from './simulation';
import { battleCannonPose, cannonPose } from './cannon';
import { createDeployTransfer, transferPose } from './transfer';

export function label(text: string, x: number, y: number, size: number, color = palette.text): Text {
  const item = new Text({
    text,
    style: { fontFamily: '"Yu Gothic", "Meiryo", sans-serif', fontSize: size, fontWeight: 'bold', fill: color },
  });
  item.anchor.set(0.5);
  item.position.set(x, y);
  return item;
}

/** Drawn barrel is updated from the battle simulation pose. */
export function createBattleCannon(team: Team) {
  const c = battlePresentation;
  const pose = battleCannonPose(team.id);
  const view = new Container({ label: `battle-cannon-${team.id}` });
  view.position.set(pose.pivot.x, pose.pivot.y);
  view.scale.set(pose.scale);
  const base = new Graphics()
    .roundRect(-c.baseWidth / 2, c.hubRadius / 2, c.baseWidth, c.baseHeight, 5).fill(palette.wall);
  const barrel = new Graphics()
    .roundRect(0, -c.barrelWidth / 2, c.barrelLength, c.barrelWidth, 5).fill(team.color)
    .rect(c.barrelLength - 8, -c.barrelWidth / 2 - 3, 8, c.barrelWidth + 6).fill(palette.wall)
    .rect(c.barrelLength - 3, -c.barrelWidth / 2 + 4, 3, c.barrelWidth - 8).fill(palette.device);
  barrel.rotation = pose.angle;
  const hub = new Graphics().circle(0, 0, c.hubRadius).fill(team.color)
    .circle(0, 0, c.hubRadius * 0.55).fill(palette.wall);
  view.addChild(base, barrel, hub);
  return { view, render: (angle: number) => { barrel.rotation = angle; } };
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
  const title = label(text, width / 2, height / 2, marblePresentation.slotFontSize, definition.color);
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
  device.ramps.forEach(points => graphics.poly(points).fill(palette.wall));
  view.addChild(graphics);
  if (!isLower) {
    for (const zone of upperPresentation.zones) {
      const slots = device.slots.filter(s => s.definition.action.kind === 'effect' && zone.effects.includes(s.definition.action.effectId));
      if (!slots.length) continue;
      const left = Math.min(...slots.map(s => s.x));
      const right = Math.max(...slots.map(s => s.x + s.width));
      const color = zone[team.id];
      graphics.rect(left, upperPresentation.bandY, right - left, upperPresentation.bandHeight).fill({ color, alpha: 0.12 });
      const title = label(zone.label, (left + right) / 2, upperPresentation.bandY + upperPresentation.bandHeight * 0.78,
        upperPresentation.labelSize, color);
      title.scale.set(Math.min(1, (right - left - 8) / title.width, upperPresentation.bandHeight * 0.4 / title.height));
      view.addChild(title);
      const path = effectPresentation[zone.effects[0]]?.icon;
      if (path) {
        const url = /^(?:[a-z]+:|\/)/i.test(path) ? path : `${import.meta.env.BASE_URL}${path}`;
        void Assets.load<Texture>(url).then(texture => {
          if (view.destroyed) return;
          const icon = new Sprite(texture);
          icon.anchor.set(0.5);
          icon.position.set((left + right) / 2, upperPresentation.bandY + upperPresentation.bandHeight * 0.27);
          icon.scale.set(Math.min(18, right - left - 8) / Math.max(texture.width, texture.height));
          icon.tint = color;
          view.addChild(icon);
        }).catch(() => { /* The label remains available if the icon cannot load. */ });
      }
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
  // Behind the devices: only the outside lanes and bottom openings are visible.
  const returnChannel = new Graphics({ label: 'deploy-channel' });
  for (const slot of layout.lower.slots) {
    if (slot.definition.action.kind !== 'deploy') continue;
    const from = { x: layout.lower.bounds.x + slot.x + slot.width / 2,
      y: layout.lower.bounds.y + layout.lower.bounds.height };
    const route = createDeployTransfer(layout, team.id, from);
    for (const [width, color] of [[deployPresentation.width + 2, palette.line],
      [deployPresentation.width, palette.panel], [1, team.color]]) {
      returnChannel.moveTo(route.points[0].x, route.points[0].y);
      route.points.slice(1).forEach(p => returnChannel.lineTo(p.x, p.y));
      returnChannel.stroke({ width, color });
    }
  }
  view.addChild(returnChannel);
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
  // Nonphysical conveyor openings and channel are drawn over the device rims.
  const channel = new Graphics({ label: 'transfer-channel' });
  const top = layout.upper.bounds.y + layout.upper.bounds.height;
  const gap = layout.lower.bounds.y - top;
  const middle = top + gap / 2;
  channel.rect(layout.upper.bounds.x, top, layout.upper.bounds.width, gap).fill(palette.panel);
  for (const slot of layout.upper.slots) {
    const x = layout.upper.bounds.x + slot.x + slot.width / 2;
    channel.rect(x - slot.openingWidth / 2, top - layout.upper.wallThickness,
      slot.openingWidth, layout.upper.wallThickness).fill(palette.panel);
  }
  const entryX = layout.lower.bounds.x + layout.lower.start.x;
  channel.rect(entryX - gap / 2, layout.lower.bounds.y, gap, layout.lower.wallThickness).fill(palette.panel);
  channel.moveTo(layout.upper.bounds.x + layout.upper.wallThickness, middle)
    .lineTo(layout.upper.bounds.x + layout.upper.bounds.width - layout.upper.wallThickness, middle)
    .stroke({ width: 1, color: team.color, alpha: 0.25 });
  view.addChild(channel);
  const openings = new Graphics({ label: 'deploy-openings' });
  for (const slot of layout.lower.slots) {
    if (slot.definition.action.kind !== 'deploy') continue;
    // Accept any x within the result band, matching the physical sensor.
    openings.rect(layout.lower.bounds.x + slot.x,
      layout.lower.bounds.y + layout.lower.bounds.height - layout.lower.wallThickness,
      slot.width, layout.lower.wallThickness + deployPresentation.bottomOffset + deployPresentation.width / 2)
      .fill(palette.panel);
  }
  view.addChild(openings);
  return view;
}

/** Reuse each ball graphic until its game record is removed. No physics decisions here. */
export function createMarbleRenderer(parent: Container, team: Team, config: PhysicsConfig) {
  const layer = new Container({ label: 'moving-marbles' });
  const obstacleLayer = new Container({ label: 'moving-obstacles' });
  const debug = new Graphics({ label: 'physics-colliders' });
  const trails = new Graphics({ label: 'reroll-trails' });
  parent.addChild(obstacleLayer, trails, layer, debug);
  const cannon = new Graphics({ label: 'swinging-cannon' });
  const c = upperPresentation.cannon;
  cannon.roundRect(0, -c.width / 2, c.length, c.width, 3).fill(team.color)
    .rect(c.length - 5, -c.width / 2 - 2, 5, c.width + 4).fill(team.color)
    .rect(c.length - 2, -c.width / 2 + 3, 2, c.width - 6).fill(palette.device)
    .circle(0, 0, 12).fill(team.color)
    .circle(0, 0, 9).fill(palette.wall);
  parent.addChild(cannon);
  const balls = new Map<number, { view: Container; shape: Graphics; value: Text;
    ring: Graphics; fallback: Graphics; icon: Sprite; effectId?: string }>();
  // Assets caches textures across teams. Never destroy these shared textures with a ball.
  const icons = new Map<string, Texture | null>();
  const iconTexture = (path: string): Texture | null => {
    if (!icons.has(path)) {
      icons.set(path, null);
      const url = /^(?:[a-z]+:|\/)/i.test(path) ? path : `${import.meta.env.BASE_URL}${path}`;
      void Assets.load<Texture>(url).then(texture => {
        if (!layer.destroyed) icons.set(path, texture);
      }).catch(() => { /* Keep the fallback for missing or invalid images. */ });
    }
    return icons.get(path) ?? null;
  };
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
      if (!state.marbles.has(id)) { ball.view.destroy({ children: true }); balls.delete(id); }
    }
    trails.clear();
    for (const marble of state.marbles.values()) {
      let ball = balls.get(marble.id);
      if (!ball) {
        const r = config.marble.radius;
        const shape = new Graphics().circle(0, 0, r).fill(team.color)
          .stroke({ width: 1, color: 0xffffff })
          .circle(r * 0.35, -r * 0.3, r * 0.23).fill(0xffffff);
        const value = label(String(marble.value), 0, -r - marblePresentation.valueGap, marblePresentation.valueFontSize);
        value.label = 'marble-value';
        value.anchor.set(0.5, 1);
        value.style.stroke = { color: palette.device, width: 3 };
        const view = new Container({ label: `marble-${marble.id}` });
        const ring = new Graphics({ label: 'effect-ring' });
        const fallback = new Graphics({ label: 'effect-fallback' });
        const icon = new Sprite({ label: 'effect-icon' });
        icon.anchor.set(0.5);
        icon.visible = false;
        view.addChild(ring, shape, fallback, icon, value);
        ball = { view, shape, value, ring, fallback, icon };
        balls.set(marble.id, ball);
        layer.addChild(view);
      }
      const text = String(marble.value);
      if (ball.value.text !== text) ball.value.text = text;
      const effect = marble.effectId === undefined ? undefined
        : effectPresentation[marble.effectId] ?? defaultEffectPresentation;
      if (ball.effectId !== marble.effectId) {
        ball.effectId = marble.effectId;
        ball.ring.clear();
        ball.fallback.clear();
        if (effect) {
          const r = config.marble.radius;
          ball.ring.circle(0, 0, r + effect.ringWidth / 2)
            .stroke({ width: effect.ringWidth, color: effect.color });
          const size = marblePresentation.effectIconSize;
          const y = r + effect.ringWidth + marblePresentation.effectIconGap + size / 2;
          ball.fallback.circle(0, y, size / 2).fill(effect.color)
            .stroke({ width: 1, color: palette.device });
          ball.icon.position.set(0, y);
          ball.value.y = -r - effect.ringWidth - marblePresentation.valueGap;
        }
      }
      const path = marble.effectId === undefined ? undefined : effectPresentation[marble.effectId]?.icon;
      const texture = path ? iconTexture(path) : null;
      ball.icon.visible = effect !== undefined && texture !== null;
      ball.fallback.visible = effect !== undefined && texture === null;
      if (texture && effect) {
        ball.icon.texture = texture;
        ball.icon.scale.set(marblePresentation.effectIconSize / Math.max(texture.width, texture.height));
        ball.icon.tint = effect.color;
      }
      const pose = marble.transfer ? transferPose(marble.transfer, alpha)
        : marble.rerollFrom ? { ...marble.rerollFrom, angle: 0 } : state.physics.pose(marble.id, alpha);
      ball.view.visible = pose !== undefined;
      if (pose) { ball.view.position.set(pose.x, pose.y); ball.shape.rotation = pose.angle; }
      const trail = marble.rerollTrail;
      if (trail) {
        const opacity = Math.max(0, Math.min(1, trail.remaining / config.reroll.trailDuration));
        const count = marblePresentation.rerollAfterimageCount;
        for (let i = 0; i < count; i++) {
          const t = i / count;
          const x = trail.from.x + (trail.to.x - trail.from.x) * t;
          const y = trail.from.y + (trail.to.y - trail.from.y) * t;
          // Older silhouettes are fainter and disappear first; no connecting line.
          const fade = Math.pow(opacity, 1.3 - 0.3 * t) * (0.65 + 0.35 * t);
          const alpha = fade * marblePresentation.rerollAfterimageOpacity;
          const r = config.marble.radius;
          trails.circle(x, y, r).fill({ color: team.color, alpha })
            .circle(x + r * 0.35, y - r * 0.3, r * 0.23).fill({ color: 0xffffff, alpha });
        }
      }
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
