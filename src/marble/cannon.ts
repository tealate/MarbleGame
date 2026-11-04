import { upperPresentation, type Team } from '../config/stage';
import type { PhysicsConfig } from '../config/physics';
import type { DeviceLayout } from './layout';

export function cannonPivot(device: DeviceLayout, team: Team['id']) {
  const c = upperPresentation.cannon;
  return { x: device.bounds.x + (team === 'red' ? device.bounds.width - c.pivotX : c.pivotX),
    y: device.bounds.y + c.pivotY };
}

/** Shared pose for the drawn barrel and the physical launch. */
export function cannonPose(device: DeviceLayout, team: Team['id'], time: number, config: PhysicsConfig) {
  const c = upperPresentation.cannon;
  const launch = config.launch.upper;
  const elevation = (launch.angleMin + launch.angleMax) / 2
    + (launch.angleMax - launch.angleMin) / 2 * Math.sin(time * 2 * Math.PI / launch.swingPeriod);
  const direction = team === 'red' ? -1 : 1;
  const radians = elevation * Math.PI / 180;
  const dx = direction * Math.cos(radians), dy = Math.sin(radians);
  const pivot = cannonPivot(device, team);
  const distance = c.length + config.marble.radius + config.spawn.clearance;
  return { pivot, angle: Math.atan2(dy, dx), direction: { x: dx, y: dy },
    muzzle: { x: pivot.x + dx * distance, y: pivot.y + dy * distance } };
}
