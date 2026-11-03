import RAPIER from '@dimforge/rapier2d-compat';
import type { PhysicsConfig } from '../config/physics';
import type { Point } from '../config/stage';
import type { MarbleLayout } from './layout';

export type ObstacleShape = { kind: 'circle'; radius: number } | { kind: 'polygon'; points: Point[] };
export interface MovingObstacle {
  id: number;
  kind: 'mountain' | 'pin';
  shape: ObstacleShape;
  position: Point;
  previous: Point;
}
interface BodyRecord {
  body: RAPIER.RigidBody;
  origin: Point;
  motion?: PhysicsConfig['obstacles']['mountains']['motions'][number];
}

/** Fixed-step kinematics. View records contain the same geometry as the colliders. */
export class MovingObstacles {
  readonly items = new Map<number, MovingObstacle>();
  readonly stats = { created: 0, removed: 0, skipped: 0 };
  private readonly bodies = new Map<number, BodyRecord>();
  private nextId = 1;
  private time = 0;
  private countdown: number;
  private rowIndex: number;
  private pinCount = 0;

  constructor(private readonly world: RAPIER.World, private readonly layout: MarbleLayout,
    private readonly config: PhysicsConfig,
    private readonly clear: (position: Point, radius: number) => boolean) {
    const c = config.obstacles;
    if (c.mountains.enabled) for (const mountain of layout.mountains) {
      const motion = c.mountains.motions.find((m) => m.id === mountain.id)!;
      const origin = { x: layout.upper.bounds.x + mountain.position.x, y: layout.upper.bounds.y + mountain.position.y };
      const position = { x: origin.x + motion.amplitude * Math.sin(2 * Math.PI * motion.phase), y: origin.y };
      const id = this.add('mountain', { kind: 'polygon', points: mountain.points }, position);
      this.bodies.set(id, { ...this.bodies.get(id)!, origin, motion });
    }
    if (c.pinFlow.enabled) for (const pin of layout.pins) this.addPin(pin.x, pin.y);
    this.rowIndex = new Set(layout.pins.map((pin) => pin.y)).size;
    const newestY = Math.max(...layout.pins.map((pin) => pin.y));
    this.countdown = c.pinFlow.enabled
      ? Math.max(0, this.interval - (layout.pinFlow.spawnY - newestY) / c.pinFlow.speed) : 0;
  }

  get interval(): number {
    return this.config.obstacles.pinFlow.spawnInterval
      ?? this.layout.pinFlow.spacingY / this.config.obstacles.pinFlow.speed;
  }

  private add(kind: MovingObstacle['kind'], shape: ObstacleShape, position: Point): number {
    const scale = this.config.simulation.pixelsPerMeter;
    const desc = shape.kind === 'circle' ? RAPIER.ColliderDesc.ball(shape.radius / scale)
      : RAPIER.ColliderDesc.convexHull(new Float32Array(shape.points.flatMap((p) => [p.x / scale, p.y / scale])));
    if (!desc) throw new Error('Invalid moving obstacle polygon');
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(position.x / scale, position.y / scale));
    const material = this.config.materials[kind === 'pin' ? 'pin' : 'mountain'];
    this.world.createCollider(desc.setRestitution(material.restitution).setFriction(material.friction)
      .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Average)
      .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Average), body);
    const id = this.nextId++;
    this.items.set(id, { id, kind, shape, position: { ...position }, previous: { ...position } });
    this.bodies.set(id, { body, origin: { ...position } });
    this.stats.created++;
    if (kind === 'pin') this.pinCount++;
    return id;
  }

  private addPin(x: number, y: number): void {
    const position = { x: this.layout.lower.bounds.x + x, y: this.layout.lower.bounds.y + y };
    const radius = this.layout.pinFlow.radius;
    // Skip occupied spawn positions instead of inserting a collider inside a ball.
    if (this.pinCount >= this.config.obstacles.pinFlow.maxPins || !this.clear(position, radius)
      || [...this.items.values()].some((item) => item.kind === 'pin'
        && Math.hypot(item.position.x - position.x, item.position.y - position.y) < 2 * radius)) {
      this.stats.skipped++;
      return;
    }
    this.add('pin', { kind: 'circle', radius }, position);
  }

  private remove(id: number): void {
    const record = this.bodies.get(id)!;
    this.world.removeRigidBody(record.body);
    if (this.items.get(id)!.kind === 'pin') this.pinCount--;
    this.bodies.delete(id);
    this.items.delete(id);
    this.stats.removed++;
  }

  /** Called before world.step; setNextKinematicTranslation supplies contact velocity. */
  step(dt: number): void {
    this.time += dt;
    const scale = this.config.simulation.pixelsPerMeter;
    const flow = this.config.obstacles.pinFlow;
    for (const [id, item] of this.items) {
      const record = this.bodies.get(id)!;
      const next = item.kind === 'mountain'
        ? { x: record.origin.x + record.motion!.amplitude
          * Math.sin(2 * Math.PI * (this.time / record.motion!.period + record.motion!.phase)), y: record.origin.y }
        : { x: item.position.x, y: item.position.y - flow.speed * dt };
      if (item.kind === 'pin' && next.y <= this.layout.lower.bounds.y + this.layout.pinFlow.despawnY) {
        this.remove(id);
        continue;
      }
      item.previous = item.position;
      item.position = next;
      record.body.setNextKinematicTranslation({ x: next.x / scale, y: next.y / scale });
    }
    if (flow.enabled) {
      this.countdown -= dt;
      if (this.countdown <= 0) {
        const rows = this.layout.pinFlow.rows;
        const row = rows[this.rowIndex++ % rows.length];
        for (const x of row) this.addPin(x, this.layout.pinFlow.spawnY);
        // Validation requires interval >= dt, so at most one row per tick.
        this.countdown += this.interval;
      }
    }
  }

  dispose(): void {
    for (const id of this.items.keys()) this.remove(id);
  }
}
