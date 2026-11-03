import RAPIER from '@dimforge/rapier2d-compat';
import type { PhysicsConfig } from '../config/physics';
import type { Point, Rect } from '../config/stage';
import type { MarbleLayout, SlotLayout } from './layout';

export type Stage = 'upper' | 'lower';
export interface Arrival { marbleId: number; stage: Stage; slot: SlotLayout }
export interface Pose extends Point { angle: number }
interface PhysicalMarble {
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  previous: Pose;
}

let initialization: Promise<void> | undefined;
export function initializePhysics(): Promise<void> {
  return initialization ??= RAPIER.init();
}

/** One independent team world. All external coordinates are team-local pixels. */
export class MarblePhysics {
  readonly world: RAPIER.World;
  private readonly marbles = new Map<number, PhysicalMarble>();
  private readonly sensors = new Map<number, Omit<Arrival, 'marbleId'> & { top: number }>();
  private disposed = false;

  constructor(readonly layout: MarbleLayout, readonly config: PhysicsConfig) {
    const scale = config.simulation.pixelsPerMeter;
    this.world = new RAPIER.World({ x: config.gravity.x / scale, y: config.gravity.y / scale });
    this.world.timestep = config.simulation.fixedTimeStep;
    this.world.integrationParameters.numSolverIterations = config.simulation.solverIterations;
    this.world.integrationParameters.maxCcdSubsteps = config.simulation.maxCcdSubsteps;
    for (const stage of ['upper', 'lower'] as const) {
      const device = layout[stage];
      for (const wall of device.walls) this.addBox(wall, device.bounds, 'wall');
      for (const slot of device.slots) {
        const origin = { x: device.bounds.x + slot.x, y: device.bounds.y + slot.y };
        for (const polygon of slot.solids) {
          const vertices = new Float32Array(polygon.flatMap((p) => [p.x / scale, p.y / scale]));
          const desc = RAPIER.ColliderDesc.convexHull(vertices);
          if (!desc) throw new Error(`Invalid slot polygon: ${slot.definition.id}`);
          desc.setTranslation(origin.x / scale, origin.y / scale);
          this.world.createCollider(this.material(desc, 'funnel'));
        }
        const sensor = this.addBox(slot.sensor, origin, 'funnel', true);
        this.sensors.set(sensor.handle, { stage, slot, top: origin.y + slot.sensor.y });
      }
    }
    for (const pin of layout.pins) {
      const desc = RAPIER.ColliderDesc.ball(pin.radius / scale)
        .setTranslation((layout.lower.bounds.x + pin.x) / scale, (layout.lower.bounds.y + pin.y) / scale);
      this.world.createCollider(this.material(desc, 'pin'));
    }
  }

  private material(desc: RAPIER.ColliderDesc, kind: keyof PhysicsConfig['materials']) {
    const material = this.config.materials[kind];
    return desc.setRestitution(material.restitution).setFriction(material.friction)
      .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Average)
      .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Average);
  }

  private addBox(rect: Rect, origin: Point, kind: keyof PhysicsConfig['materials'], sensor = false) {
    const scale = this.config.simulation.pixelsPerMeter;
    return this.world.createCollider(this.material(
      RAPIER.ColliderDesc.cuboid(rect.width / scale / 2, rect.height / scale / 2)
        .setTranslation((origin.x + rect.x + rect.width / 2) / scale,
          (origin.y + rect.y + rect.height / 2) / scale).setSensor(sensor), kind));
  }

  start(stage: Stage): Point {
    const { bounds, start } = this.layout[stage];
    return { x: bounds.x + start.x, y: bounds.y + start.y };
  }

  /** Also checks bodies created since the last step (query broad phase can lag). */
  isStartClear(stage: Stage): boolean {
    const start = this.start(stage);
    const distance = this.config.marble.radius * 2 + this.config.spawn.clearance;
    for (const { body } of this.marbles.values()) {
      const p = body.translation();
      if (Math.hypot(p.x * this.scale - start.x, p.y * this.scale - start.y) < distance) return false;
    }
    return true;
  }

  add(id: number, position: Point, velocity: Point): void {
    if (this.marbles.has(id)) throw new Error(`Duplicate physical marble ${id}`);
    const c = this.config.marble;
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(position.x / this.scale, position.y / this.scale)
      .setLinvel(velocity.x / this.scale, velocity.y / this.scale)
      .setLinearDamping(c.linearDamping).setAngularDamping(c.angularDamping)
      .setCcdEnabled(c.ccd).setCanSleep(false));
    const collider = this.world.createCollider(RAPIER.ColliderDesc.ball(c.radius / this.scale)
      .setDensity(c.density).setRestitution(c.restitution).setFriction(c.friction)
      .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Average)
      .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Average), body);
    this.marbles.set(id, { body, collider, previous: { ...position, angle: 0 } });
  }

  remove(id: number): void {
    const marble = this.marbles.get(id);
    if (!marble) return;
    this.world.removeRigidBody(marble.body); // Rapier also removes attached colliders.
    this.marbles.delete(id);
  }

  get scale(): number { return this.config.simulation.pixelsPerMeter; }

  pose(id: number, alpha = 1): Pose | undefined {
    const marble = this.marbles.get(id);
    if (!marble) return;
    const current = marble.body.translation();
    return {
      x: marble.previous.x + (current.x * this.scale - marble.previous.x) * alpha,
      y: marble.previous.y + (current.y * this.scale - marble.previous.y) * alpha,
      angle: marble.previous.angle + (marble.body.rotation() - marble.previous.angle) * alpha,
    };
  }

  step(): Arrival[] {
    for (const [id, marble] of this.marbles) {
      marble.previous = this.pose(id)!;
      const velocity = marble.body.linvel();
      const speed = Math.hypot(velocity.x, velocity.y);
      const max = this.config.marble.maxSpeed / this.scale;
      if (speed > max) marble.body.setLinvel({ x: velocity.x * max / speed, y: velocity.y * max / speed }, true);
    }
    this.world.step();
    const arrivals: Arrival[] = [];
    for (const [marbleId, marble] of this.marbles) {
      let arrival: Arrival | undefined;
      // Poll only current sensor intersections; no persistent collision-event queue.
      this.world.intersectionPairsWith(marble.collider, (other) => {
        const sensor = this.sensors.get(other.handle);
        if (sensor && !arrival && marble.body.translation().y * this.scale >= sensor.top + this.config.marble.radius) {
          arrival = { marbleId, stage: sensor.stage, slot: sensor.slot };
        }
      });
      if (arrival) arrivals.push(arrival);
    }
    return arrivals;
  }

  debugLines(): Float32Array {
    return this.world.debugRender().vertices;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.marbles.clear();
    this.sensors.clear();
    this.world.free();
  }
}
