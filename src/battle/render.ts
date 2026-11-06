import { Container, Graphics } from 'pixi.js';
import { battleConfig, type MaterialStyle } from '../config/battle';
import { palette, teams } from '../config/stage';
import { label } from '../marble/render';
import { BattleSimulation, sectorBounds, type WallSegment } from './simulation';

/** Material drawing stays here, separate from simulation, for later asset replacement. */
function drawSegment(g: Graphics, ring: number, slot: number, wall: WallSegment): void {
  const b = sectorBounds(ring, slot);
  const material: MaterialStyle = battleConfig.materials[wall.material];
  const start = b.angle - b.half, end = b.angle + b.half;
  g.moveTo(Math.cos(start) * b.inner, Math.sin(start) * b.inner)
    .lineTo(Math.cos(start) * b.outer, Math.sin(start) * b.outer)
    .arc(0, 0, b.outer, start, end)
    .lineTo(Math.cos(end) * b.inner, Math.sin(end) * b.inner)
    .arc(0, 0, b.inner, end, start, true).closePath()
    .fill({ color: material.color, alpha: material.alpha });
  const radius = battleConfig.radii[ring];
  const length = radius * Math.sin(b.half) * 0.7;
  const width = battleConfig.wallThickness * 0.28;
  // Pattern coordinates: u along the tangent, v along the radius.
  const point = (u: number, v: number) => ({
    x: Math.cos(b.angle) * (radius + v) - Math.sin(b.angle) * u,
    y: Math.sin(b.angle) * (radius + v) + Math.cos(b.angle) * u,
  });
  const line = (...points: [number, number][]) => {
    points.forEach(([u, v], i) => { const p = point(u, v); if (i === 0) g.moveTo(p.x, p.y); else g.lineTo(p.x, p.y); });
    g.stroke({ width: 1, color: material.detailColor, alpha: 0.85 });
  };
  if (material.pattern === 'grain') {
    line([-length, -width / 2], [0, -width / 3], [length, -width / 2]);
    line([-length, width / 2], [length, width / 2]);
    line([length / 3, -width], [length / 3, width]);
  } else if (material.pattern === 'blocks') {
    line([-length, 0], [length, 0]);
    line([0, -width], [0, 0]);
    line([-length / 2, 0], [-length / 2, width]);
  } else {
    line([-length, width / 2], [length / 3, -width]);
    line([0, width], [length, -width / 2]);
  }
  if (wall.hp < wall.maxHp) {
    line([-length / 3, -width], [length / 4, -width / 4], [-length / 4, width / 3], [length / 3, width]);
    // Remaining durability, inside the outer edge; never a separate collider.
    const hpStart = start + b.half * 0.15;
    g.moveTo(Math.cos(hpStart) * (b.outer - 2), Math.sin(hpStart) * (b.outer - 2))
      .arc(0, 0, b.outer - 2, hpStart, hpStart + b.half * 1.7 * wall.hp / wall.maxHp)
      .stroke({ width: 2, color: 0xffe6a1 });
  }
}

export function createBattleRenderer(simulation: BattleSimulation) {
  const view = new Container({ label: 'battle-walls-and-projectiles' });
  const walls = simulation.teams.map((team, i) => {
    const boundary = new Graphics().circle(team.center.x, team.center.y, battleConfig.maxRadius)
      .stroke({ width: 1, color: teams[i].color, alpha: 0.18 });
    const shape = new Graphics();
    shape.position.set(team.center.x, team.center.y);
    view.addChild(boundary, shape);
    view.addChild(label(teams[i].label, team.center.x, team.center.y + battleConfig.maxRadius + 22, 20, teams[i].color));
    return { shape, revision: -1 };
  });
  const moving = new Graphics();
  view.addChild(moving);
  const render = () => {
    simulation.teams.forEach((team, i) => {
      const entry = walls[i];
      if (entry.revision !== team.revision) {
        entry.shape.clear();
        team.walls.forEach((ring, r) => ring.forEach((wall, s) => { if (wall) drawSegment(entry.shape, r, s, wall); }));
        entry.revision = team.revision;
      }
      entry.shape.rotation = team.angle;
    });
    moving.clear();
    for (const ball of simulation.projectiles) {
      const color = ball.kind === 'defense' ? battleConfig.materials[ball.material].color : 0xffce75;
      moving.circle(ball.x, ball.y, ball.radius).fill(color);
      moving.circle(ball.x, ball.y, ball.radius * 0.4).fill(ball.kind === 'attack' ? palette.device : 0xffffff);
    }
    for (const flash of simulation.flashes) {
      moving.circle(flash.x, flash.y, 4 + flash.age * 40)
        .stroke({ width: 2, color: flash.color, alpha: 1 - flash.age / 0.35 });
    }
  };
  render();
  return { view, render, dispose: () => view.destroy({ children: true }) };
}
