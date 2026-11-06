import { battleConfig, type DefenseMaterial } from '../config/battle';
import { teams, type Point, type Team } from '../config/stage';
import { battleCannonPose } from '../marble/cannon';
import { createScreenLayout } from '../marble/layout';

type TeamId = Team['id'];
export const TAU = Math.PI * 2;
export const radians = (degrees: number) => degrees * Math.PI / 180;
export const normalizeAngle = (angle: number) => (angle % TAU + TAU) % TAU;
export interface WallSegment { material: DefenseMaterial; hp: number; maxHp: number }
export interface BattleTeam {
  id: TeamId;
  center: Point;
  angle: number;
  walls: (WallSegment | null)[][];
  revision: number;
  arrivals: number;
  stats: { built: number; repaired: number; wasted: number; hits: number; destroyed: number };
}
export interface BattleProjectile extends Point {
  team: TeamId;
  kind: 'defense' | 'attack';
  material: DefenseMaterial;
  angle: number;
  radius: number;
  speed: number;
  distance: number;
  passedRing: number;
  touched: Set<string>;
}
export interface BattleFlash extends Point { color: number; age: number }

/** Rendering and collision use precisely the same annular sector bounds. */
export function sectorBounds(ring: number, slot: number) {
  const radius = battleConfig.radii[ring];
  const half = (TAU / battleConfig.segments - radians(battleConfig.gapDegrees)) / 2;
  return { inner: radius - battleConfig.wallThickness / 2,
    outer: radius + battleConfig.wallThickness / 2,
    angle: (slot + 0.5) * TAU / battleConfig.segments, half };
}

/** Distance from a point to the filled sector, including its radial end faces. */
function sectorDistance(radius: number, localAngle: number, ring: number, slot: number): number {
  const b = sectorBounds(ring, slot);
  const delta = Math.abs(normalizeAngle(localAngle - b.angle + Math.PI) - Math.PI);
  if (delta <= b.half) return Math.max(b.inner - radius, radius - b.outer, 0);
  const angle = delta - b.half;
  const along = Math.max(b.inner, Math.min(b.outer, radius * Math.cos(angle)));
  return Math.hypot(radius * Math.cos(angle) - along, radius * Math.sin(angle));
}

export class BattleSimulation {
  readonly teams: BattleTeam[] = teams.map(team => ({
    id: team.id, center: battleCannonPose(team.id).pivot, angle: 0, walls: [], revision: 0,
    arrivals: 0, stats: { built: 0, repaired: 0, wasted: 0, hits: 0, destroyed: 0 },
  }));
  projectiles: BattleProjectile[] = [];
  flashes: BattleFlash[] = [];
  autoFire = false;
  selectedTeam: TeamId = 'red';
  selectedMaterial: DefenseMaterial = 'wood';
  direction: 'random' | 'fixed' = battleConfig.defense.direction;
  angleDegrees: number | null = null;
  private countdown = 0;

  constructor() {
    const c = battleConfig;
    const numbers = [c.wallThickness, c.gapDegrees, c.maxRadius, c.defense.speed, c.attack.speed,
      c.defense.radius, c.attack.radius, c.defense.interval, c.attack.damage, c.attack.angleOffsetDegrees,
      ...Object.values(c.rotationDegreesPerSecond), ...Object.values(c.defense.angleDegrees)];
    if (numbers.some(value => !Number.isFinite(value))
      || Object.values(c.materials).some(m => !Number.isFinite(m.maxHp) || m.maxHp <= 0
        || !Number.isFinite(m.repair) || m.repair <= 0)
      || !Number.isInteger(c.segments) || c.segments < 3 || c.radii.length === 0
      || c.wallThickness <= 0 || c.gapDegrees < 0 || c.gapDegrees >= 360 / c.segments
      || c.maxRadius <= 0 || c.defense.speed <= 0 || c.attack.speed <= 0
      || c.defense.radius <= 0 || c.attack.radius <= 0 || c.defense.interval <= 0
      || c.attack.damage <= 0
      || c.radii.some((r, i) => !Number.isFinite(r) || r <= c.wallThickness / 2
        || (i > 0 && r - c.radii[i - 1] <= c.wallThickness))) {
      throw new Error('Invalid battle geometry or projectile settings');
    }
    this.reset();
  }

  reset(empty = false): void {
    this.projectiles = [];
    this.flashes = [];
    this.autoFire = false;
    this.countdown = 0;
    const materials: DefenseMaterial[] = ['wood', 'concrete', 'glass'];
    for (const team of this.teams) {
      team.angle = 0;
      team.arrivals = 0;
      team.stats = { built: 0, repaired: 0, wasted: 0, hits: 0, destroyed: 0 };
      team.walls = battleConfig.radii.map((_, ring) => Array.from({ length: battleConfig.segments }, (_, slot) => {
        // 初期見本：多層の欠け・素材・損傷。外周の一部は増築用に空ける。
        if (empty || !this.buildable(ring) || (slot + ring * 3) % 12 < 3
          || (ring === battleConfig.radii.length - 1 && slot % 12 < 7)) return null;
        const material = materials[(Math.floor(slot / 6) + ring) % materials.length];
        const maxHp = battleConfig.materials[material].maxHp;
        return { material, maxHp, hp: slot % 5 === 0 ? Math.max(1, maxHp - 1) : maxHp };
      }));
      team.revision++;
    }
  }

  team(id: TeamId): BattleTeam { return this.teams[id === 'red' ? 0 : 1]; }
  private buildable(ring: number): boolean {
    return battleConfig.radii[ring] + battleConfig.wallThickness / 2 <= battleConfig.maxRadius;
  }
  arrival(id: TeamId): void {
    const team = this.team(id);
    team.arrivals++;
    this.flash(team.center, 0xffffff); // 効果ID/倍率の意味はまだ変換しない。
  }
  fireDefense(id = this.selectedTeam, material = this.selectedMaterial): void {
    const angle = this.direction === 'random' ? Math.random() * TAU
      : radians(this.angleDegrees ?? battleConfig.defense.angleDegrees[id]);
    this.spawn(id, 'defense', material, angle);
  }
  fireAttack(id = this.selectedTeam): void {
    const from = this.team(id).center, to = this.team(id === 'red' ? 'blue' : 'red').center;
    this.spawn(id, 'attack', this.selectedMaterial,
      Math.atan2(to.y - from.y, to.x - from.x) + radians(battleConfig.attack.angleOffsetDegrees));
  }
  private spawn(id: TeamId, kind: BattleProjectile['kind'], material: DefenseMaterial, angle: number): void {
    const c = battleConfig[kind];
    this.projectiles.push({ ...this.team(id).center, team: id, kind, material, angle,
      radius: c.radius, speed: c.speed, distance: 0, passedRing: -1, touched: new Set() });
  }
  private flash(point: Point, color: number): void { this.flashes.push({ ...point, color, age: 0 }); }

  advance(seconds: number): void {
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    // Adaptive substeps bound relative ball/wall motion to <= half a pixel,
    // including rotation; high configured speeds do not skip entire walls.
    const speed = Math.max(battleConfig.defense.speed, battleConfig.attack.speed);
    const rotation = Math.max(...Object.values(battleConfig.rotationDegreesPerSecond).map(v => Math.abs(radians(v))));
    const distanceStep = Math.min(0.5, battleConfig.defense.radius / 2, battleConfig.attack.radius / 2, battleConfig.wallThickness / 4);
    const duration = Math.min(seconds, 0.1);
    const steps = Math.max(1, Math.ceil(duration * (speed + rotation * battleConfig.maxRadius) / distanceStep));
    const dt = duration / steps;
    for (let step = 0; step < steps; step++) {
      for (const team of this.teams) team.angle = normalizeAngle(team.angle + radians(battleConfig.rotationDegreesPerSecond[team.id]) * dt);
      if (this.autoFire) {
        this.countdown -= dt;
        if (this.countdown <= 0) { this.fireDefense(); this.countdown += battleConfig.defense.interval; }
      } else this.countdown = 0;
      this.flashes.forEach(flash => { flash.age += dt; });
      this.flashes = this.flashes.filter(flash => flash.age < 0.35);
      this.projectiles = this.projectiles.filter(ball => this.move(ball, dt));
    }
  }

  private move(ball: BattleProjectile, dt: number): boolean {
    const previousDistance = ball.distance;
    ball.distance += ball.speed * dt;
    const origin = this.team(ball.team).center;
    ball.x = origin.x + Math.cos(ball.angle) * ball.distance;
    ball.y = origin.y + Math.sin(ball.angle) * ball.distance;
    const target = this.team(ball.kind === 'defense' ? ball.team : ball.team === 'red' ? 'blue' : 'red');
    const radius = Math.hypot(ball.x - target.center.x, ball.y - target.center.y);
    const localAngle = normalizeAngle(Math.atan2(ball.y - target.center.y, ball.x - target.center.x) - target.angle);
    for (let ring = 0; ring < target.walls.length; ring++) {
      if (Math.abs(radius - battleConfig.radii[ring]) > battleConfig.wallThickness / 2 + ball.radius) continue;
      for (let slot = 0; slot < battleConfig.segments; slot++) {
        const wall = target.walls[ring][slot];
        const key = `${ring}:${slot}`;
        if (!wall || ball.touched.has(key) || sectorDistance(radius, localAngle, ring, slot) > ball.radius) continue;
        ball.touched.add(key);
        if (ball.kind === 'attack') {
          wall.hp = Math.max(0, wall.hp - battleConfig.attack.damage);
          target.stats.hits++;
          if (wall.hp === 0) { target.walls[ring][slot] = null; target.stats.destroyed++; }
          target.revision++;
          this.flash(ball, 0xffce75);
          return false;
        }
        ball.passedRing = Math.max(ball.passedRing, ring);
        if (wall.material === ball.material && wall.hp < wall.maxHp) {
          wall.hp = Math.min(wall.maxHp, wall.hp + battleConfig.materials[ball.material].repair);
          target.stats.repaired++;
          target.revision++;
          this.flash(ball, 0xa7f0be);
          return false;
        }
      }
    }
    if (ball.kind === 'attack') {
      const b = createScreenLayout().battle;
      return ball.x + ball.radius >= b.x && ball.x - ball.radius <= b.x + b.width
        && ball.y + ball.radius >= b.y && ball.y - ball.radius <= b.y + b.height;
    }
    if (ball.distance >= battleConfig.maxRadius) {
      target.stats.wasted++;
      this.flash({ x: origin.x + Math.cos(ball.angle) * battleConfig.maxRadius,
        y: origin.y + Math.sin(ball.angle) * battleConfig.maxRadius }, 0x9aacc3);
      return false;
    }
    const slot = Math.floor(localAngle / TAU * battleConfig.segments);
    // At each reached ring, look only along this ray at the CURRENT shared angle.
    // Never search a different angular slot, never backfill rings already passed.
    let outermost = ball.passedRing;
    target.walls.forEach((walls, ring) => {
      if (walls[slot] && sectorDistance(battleConfig.radii[ring], localAngle, ring, slot) === 0) {
        outermost = Math.max(outermost, ring);
      }
    });
    for (let ring = 0; ring < target.walls.length; ring++) {
      const r = battleConfig.radii[ring];
      if (previousDistance >= r || ball.distance < r || ring <= outermost
        || !this.buildable(ring) || target.walls[ring][slot]) continue;
      const maxHp = battleConfig.materials[ball.material].maxHp;
      target.walls[ring][slot] = { material: ball.material, hp: maxHp, maxHp };
      target.revision++;
      target.stats.built++;
      this.flash(ball, battleConfig.materials[ball.material].color);
      return false;
    }
    return true;
  }

  dispose(): void { this.projectiles = []; this.flashes = []; this.teams.forEach(team => { team.walls = []; }); }
}
