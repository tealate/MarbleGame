import type { Point } from '../config/stage';
import type { MarbleLayout } from './layout';

export interface Transfer {
  points: Point[];
  distance: number;
  previousDistance: number;
  length: number;
}

export function createTransfer(layout: MarbleLayout, from: Point): Transfer {
  const { upper, lower } = layout;
  const channelY = (upper.bounds.y + upper.bounds.height + lower.bounds.y) / 2;
  const end = { x: lower.bounds.x + lower.start.x, y: lower.bounds.y + lower.start.y };
  const points = [{ ...from }, { x: from.x, y: channelY }, { x: end.x, y: channelY }, end];
  const length = points.slice(1).reduce((total, p, i) => total + Math.hypot(p.x - points[i].x, p.y - points[i].y), 0);
  return { points, distance: 0, previousDistance: 0, length };
}

export function transferPose(transfer: Transfer, alpha = 1) {
  let distance = transfer.previousDistance + (transfer.distance - transfer.previousDistance) * alpha;
  for (let i = 1; i < transfer.points.length; i++) {
    const a = transfer.points[i - 1], b = transfer.points[i];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (distance < length) {
      const t = distance / length;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, angle: 0 };
    }
    distance -= length;
  }
  return { ...transfer.points[transfer.points.length - 1], angle: 0 };
}
