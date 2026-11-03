import { physicsConfig, type PhysicsConfig } from '../config/physics';
import { teams, type Team, type SlotAction, type Point } from '../config/stage';
import type { MarbleLayout } from './layout';
import { initializePhysics, MarblePhysics, type Stage } from './physics';

export interface MarbleState {
  id: number;
  team: Team['id'];
  stage: Stage;
  waiting: boolean;
  value: number;
  effectId?: string;
  rerolls: number;
  age: number;
}
export type MarbleEvent = {
  type: 'effect' | 'multiplier' | 'deploy' | 'retire';
  marble: Readonly<MarbleState>;
  reason?: 'reroll-limit' | 'lifetime-limit' | 'out-of-bounds';
};
export interface TeamSimulation {
  physics: MarblePhysics;
  marbles: Map<number, MarbleState>;
  spawnCountdown: number;
  pendingSpawns: number;
  stats: { spawned: number; effects: number; multipliers: number; deployed: number; retired: number };
}

/** Rules know slot meanings, but nothing about Rapier or Pixi. */
export function applySlot(marble: MarbleState, action: SlotAction, config: PhysicsConfig): MarbleEvent | undefined {
  if (marble.waiting) return;
  if (action.kind === 'effect') {
    if (marble.stage !== 'upper' || marble.effectId !== undefined) return;
    marble.effectId = action.effectId;
    marble.stage = 'lower';
    marble.waiting = true;
    return { type: 'effect', marble: { ...marble } };
  }
  if (marble.stage !== 'lower' || marble.effectId === undefined) return;
  if (action.kind === 'deploy') return { type: 'deploy', marble: { ...marble } };
  marble.value = Math.min(config.rules.maxValue, marble.value * action.factor);
  marble.rerolls++;
  if (marble.rerolls > config.rules.maxRerolls) {
    return { type: 'retire', marble: { ...marble }, reason: 'reroll-limit' };
  }
  marble.waiting = true;
  return { type: 'multiplier', marble: { ...marble } };
}

function validate(layout: MarbleLayout, c: PhysicsConfig): void {
  const fail = (message: string): never => { throw new Error(`Invalid physics configuration: ${message}`); };
  const finite = (object: object) => Object.entries(object).forEach(([key, value]) => {
    if (typeof value === 'number' && !Number.isFinite(value)) fail(`${key} must be finite`);
    if (value && typeof value === 'object') finite(value);
  });
  finite(c);
  finite(layout);
  for (const [key, value] of Object.entries({ ...c.simulation, radius: c.marble.radius,
    density: c.marble.density, maxSpeed: c.marble.maxSpeed, interval: c.spawn.interval,
    maxPerTeam: c.spawn.maxPerTeam, batchSize: c.spawn.batchSize, maxLifetime: c.rules.maxLifetime,
    initialValue: c.rules.initialValue, maxValue: c.rules.maxValue })) {
    if (value <= 0) fail(`${key} must be positive`);
  }
  for (const value of [c.simulation.maxSubsteps, c.simulation.solverIterations,
    c.simulation.maxCcdSubsteps, c.spawn.maxPerTeam, c.spawn.batchSize, c.rules.maxRerolls]) {
    if (!Number.isInteger(value) || value < 0) fail('counts must be nonnegative integers');
  }
  if (c.spawn.clearance < 0 || c.marble.linearDamping < 0 || c.marble.angularDamping < 0
    || c.rules.maxValue < c.rules.initialValue) fail('invalid clearance, damping or value limit');
  for (const material of [c.marble, ...Object.values(c.materials)]) {
    if (material.restitution < 0 || material.restitution > 1 || material.friction < 0) fail('invalid material');
  }
  for (const launch of Object.values(c.launch)) {
    if (launch.speedMin < 0 || launch.speedMax < launch.speedMin || launch.speedMax > c.marble.maxSpeed
      || launch.angleMax < launch.angleMin) fail('invalid launch range');
  }
  for (const stage of ['upper', 'lower'] as const) {
    const device = layout[stage];
    const r = c.marble.radius;
    const { start, bounds, wallThickness: wall } = device;
    if (start.x - r <= wall || start.x + r >= bounds.width - wall || start.y - r <= wall
      || start.y + r >= Math.min(...device.slots.map((s) => s.y - s.funnelHeight))) fail(`${stage} start is obstructed`);
    if (stage === 'lower' && layout.pins.some((p) => Math.hypot(p.x - start.x, p.y - start.y) <= p.radius + r)) {
      fail('lower start overlaps a pin');
    }
    for (const slot of device.slots) {
      const clearWidth = Math.min(slot.openingWidth, slot.width - 2 * Math.min(wall, 3));
      if (clearWidth <= 2 * r || slot.sensor.height <= 2 * r) fail(`marble does not fit ${slot.definition.id}`);
      // CCD does not sweep sensors. Bound travel so the full-depth acceptance
      // region cannot be skipped even at the configured speed cap + gravity.
      const travel = (c.marble.maxSpeed + Math.hypot(c.gravity.x, c.gravity.y) * c.simulation.fixedTimeStep)
        * c.simulation.fixedTimeStep;
      if (travel >= slot.sensor.height - r) fail('reduce fixedTimeStep or maxSpeed to sample pocket sensors safely');
      const action = slot.definition.action;
      if ((stage === 'upper') !== (action.kind === 'effect')) fail(`wrong action stage: ${slot.definition.id}`);
      if (action.kind === 'effect' && !action.effectId) fail('effectId must not be empty');
      if (action.kind === 'multiplier' && (!Number.isFinite(action.factor) || action.factor <= 0)) fail('invalid multiplier');
    }
  }
  if (layout.pins.some((p) => p.radius <= 0)) fail('pin radius must be positive');
}

export class MarbleSimulation {
  readonly teams: TeamSimulation[];
  readonly config: PhysicsConfig;
  private accumulator = 0;
  private nextId = 1;
  private disposed = false;

  static async create(layout: MarbleLayout, config = physicsConfig,
    onEvent: (event: MarbleEvent) => void = () => {}, random: () => number = Math.random): Promise<MarbleSimulation> {
    const snapshot = structuredClone(config);
    validate(layout, snapshot);
    await initializePhysics();
    return new MarbleSimulation(layout, snapshot, onEvent, random);
  }

  private constructor(layout: MarbleLayout, config: PhysicsConfig,
    private readonly onEvent: (event: MarbleEvent) => void, private readonly random: () => number) {
    this.config = config;
    this.teams = teams.map(() => ({ physics: new MarblePhysics(layout, config), marbles: new Map(),
      spawnCountdown: 0, pendingSpawns: 0,
      stats: { spawned: 0, effects: 0, multipliers: 0, deployed: 0, retired: 0 } }));
  }

  private velocity(stage: Stage): Point {
    const c = this.config.launch[stage];
    const speed = c.speedMin + (c.speedMax - c.speedMin) * this.random();
    const angle = (c.angleMin + (c.angleMax - c.angleMin) * this.random()) * Math.PI / 180;
    return { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed };
  }

  /** Manual generation uses the same limits and clearance checks as auto-spawn. */
  spawn(teamId: Team['id']): number | undefined {
    if (this.disposed) return;
    const index = teams.findIndex((team) => team.id === teamId);
    const team = this.teams[index];
    if (!team || team.marbles.size >= this.config.spawn.maxPerTeam || !team.physics.isStartClear('upper')) return;
    const id = this.nextId++;
    const marble: MarbleState = { id, team: teamId, stage: 'upper', waiting: false,
      value: this.config.rules.initialValue, rerolls: 0, age: 0 };
    team.physics.add(id, team.physics.start('upper'), this.velocity('upper'));
    team.marbles.set(id, marble);
    team.stats.spawned++;
    return id;
  }

  advance(seconds: number): void {
    if (this.disposed || !Number.isFinite(seconds) || seconds <= 0) return;
    const c = this.config.simulation;
    this.accumulator += Math.min(seconds, c.maxFrameDelta);
    let steps = 0;
    while (this.accumulator + Number.EPSILON >= c.fixedTimeStep && steps < c.maxSubsteps) {
      this.tick();
      this.accumulator = Math.max(0, this.accumulator - c.fixedTimeStep);
      steps++;
    }
    // Drop excess elapsed time, never build an unbounded catch-up backlog.
    if (this.accumulator >= c.fixedTimeStep) this.accumulator %= c.fixedTimeStep;
  }

  get alpha(): number { return this.accumulator / this.config.simulation.fixedTimeStep; }
  resetClock(): void { this.accumulator = 0; }

  private finish(team: TeamSimulation, marble: MarbleState, event: MarbleEvent): void {
    team.physics.remove(marble.id);
    team.marbles.delete(marble.id);
    if (event.type === 'deploy') team.stats.deployed++;
    else team.stats.retired++;
    this.onEvent(event);
  }

  private tick(): void {
    const dt = this.config.simulation.fixedTimeStep;
    this.teams.forEach((team, index) => {
      // Warp bodies are removed at arrival. Retry the shared start on later ticks
      // if occupied; waiting marbles still count toward the cap and lifetime.
      for (const marble of team.marbles.values()) {
        marble.age += dt;
        if (marble.age >= this.config.rules.maxLifetime) {
          this.finish(team, marble, { type: 'retire', marble: { ...marble }, reason: 'lifetime-limit' });
        } else if (marble.waiting && team.physics.isStartClear('lower')) {
          team.physics.add(marble.id, team.physics.start('lower'), this.velocity('lower'));
          marble.waiting = false;
        }
      }
      if (this.config.spawn.automatic) {
        team.spawnCountdown -= dt;
        if (team.spawnCountdown <= 0) {
          team.pendingSpawns = Math.min(this.config.spawn.maxPerTeam - team.marbles.size,
            team.pendingSpawns + this.config.spawn.batchSize);
          team.spawnCountdown = this.config.spawn.interval;
        }
        // A batch is released as the single spawn point clears, never overlapping
        // multiple new bodies at the same position or growing an unbounded queue.
        if (team.pendingSpawns > 0 && this.spawn(teams[index].id) !== undefined) team.pendingSpawns--;
      }
      for (const arrival of team.physics.step()) {
        const marble = team.marbles.get(arrival.marbleId);
        if (!marble || marble.stage !== arrival.stage) continue;
        const event = applySlot(marble, arrival.slot.definition.action, this.config);
        if (!event) continue;
        if (event.type === 'deploy' || event.type === 'retire') this.finish(team, marble, event);
        else {
          team.physics.remove(marble.id);
          if (event.type === 'effect') team.stats.effects++;
          else team.stats.multipliers++;
          this.onEvent(event);
        }
      }
      for (const marble of team.marbles.values()) {
        const p = team.physics.pose(marble.id);
        const b = team.physics.layout[marble.stage].bounds;
        if (p && (!Number.isFinite(p.x + p.y) || p.x < b.x || p.x > b.x + b.width
          || p.y < b.y || p.y > b.y + b.height)) {
          this.finish(team, marble, { type: 'retire', marble: { ...marble }, reason: 'out-of-bounds' });
        }
      }
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.teams.forEach((team) => { team.physics.dispose(); team.marbles.clear(); });
  }
}
