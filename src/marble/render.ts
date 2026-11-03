import { Container, Graphics, Text } from 'pixi.js';
import { palette, type Team } from '../config/stage';
import type { DeviceLayout, MarbleLayout, SlotLayout } from './layout';

export function label(text: string, x: number, y: number, size: number, color = palette.text): Text {
  const item = new Text({
    text,
    style: { fontFamily: '"Yu Gothic", "Meiryo", sans-serif', fontSize: size, fontWeight: 'bold', fill: color },
  });
  item.anchor.set(0.5);
  item.position.set(x, y);
  return item;
}

function drawSlot(slot: SlotLayout, wall: number): Container {
  const view = new Container({ label: slot.definition.id });
  view.position.set(slot.x, slot.y);
  const { width, height, openingWidth, funnelHeight, definition } = slot;
  const left = (width - openingWidth) / 2;
  const right = left + openingWidth;
  // The two shoulders leave a real gap of openingWidth in the top edge.
  const shape = new Graphics()
    .rect(0, 0, width, height).fill({ color: definition.color, alpha: 0.17 })
    .moveTo(0, -funnelHeight).lineTo(left, 0).lineTo(0, 0)
    .lineTo(0, height).lineTo(width, height).lineTo(width, 0)
    .lineTo(right, 0).lineTo(width, -funnelHeight)
    .stroke({ width: Math.min(wall, 3), color: definition.color });
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
  device.slots.forEach((slot) => view.addChild(drawSlot(slot, device.wallThickness)));
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
