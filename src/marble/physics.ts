import RAPIER from '@dimforge/rapier2d-compat';
import type { PhysicsConfig } from '../config/physics';
import type { Point, Rect } from '../config/stage';
import type { MarbleLayout, SlotLayout } from './layout';
import { MovingObstacles } from './obstacles';

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
  readonly obstacles: MovingObstacles;
  private readonly marbles = new Map<number, PhysicalMarble>();
  private readonly sensors = new Map<number, Omit<Arrival, 'marbleId'> & { top: number; left: number; right: number }>();
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
        this.sensors.set(sensor.handle, { stage, slot, top: origin.y + slot.sensor.y,
          left: origin.x + slot.sensor.x, right: origin.x + slot.sensor.x + slot.sensor.width });
      }
    }
    if (!config.obstacles.pinFlow.enabled) for (const pin of layout.pins) {
      const desc = RAPIER.ColliderDesc.ball(pin.radius / scale)
        .setTranslation((layout.lower.bounds.x + pin.x) / scale, (layout.lower.bounds.y + pin.y) / scale);
      this.world.createCollider(this.material(desc, 'pin'));
    }
    this.obstacles = new MovingObstacles(this.world, layout, config,
      (position, radius) => this.isCircleClear(position, radius));
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
    return this.isCircleClear(this.start(stage), this.config.marble.radius);
  }

  private isCircleClear(position: Point, radius: number): boolean {
    const distance = this.config.marble.radius + radius + this.config.spawn.clearance;
    for (const { body } of this.marbles.values()) {
      const p = body.translation();
      if (Math.hypot(p.x * this.scale - position.x, p.y * this.scale - position.y) < distance) return false;
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
    this.limitVelocity(body);
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

  private limitVelocity(body: RAPIER.RigidBody): void {
    const velocity = body.linvel();
    const speed = Math.hypot(velocity.x, velocity.y);
    const ratio = Math.min(1, this.config.marble.maxSpeed / this.scale / speed);
    const x = velocity.x * ratio;
    const y = Math.min(velocity.y * ratio, this.config.marble.maxFallSpeed / this.scale);
    if (x !== velocity.x || y !== velocity.y) body.setLinvel({ x, y }, true);
  }

  step(): Arrival[] {
    for (const [id, marble] of this.marbles) {
      marble.previous = this.pose(id)!;
      this.limitVelocity(marble.body);
    }
    this.obstacles.step(this.config.simulation.fixedTimeStep);
    this.world.step();
    // Gravity and contact impulses can accelerate a ball during this step.
    for (const marble of this.marbles.values()) this.limitVelocity(marble.body);
    const arrivals: Arrival[] = [];
    for (const [marbleId, marble] of this.marbles) {
      let arrival: Arrival | undefined;
      // Poll only current sensor intersections; no persistent collision-event queue.
      this.world.intersectionPairsWith(marble.collider, (other) => {
        const sensor = this.sensors.get(other.handle);
        const center = marble.body.translation();
        // Contiguous open bands may both touch a ball; its center chooses one result.
        if (sensor && !arrival && center.x * this.scale >= sensor.left && center.x * this.scale < sensor.right
          && center.y * this.scale >= sensor.top + this.config.marble.radius) {
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
    this.obstacles.dispose();
    this.marbles.clear();
    this.sensors.clear();
    this.world.free();
  }
}
