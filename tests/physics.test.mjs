import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false },
  optimizeDeps: { noDiscovery: true, entries: [] }, appType: 'custom' });
after(() => server.close());
const { marbleConfig } = await server.ssrLoadModule('/src/config/stage.ts');
const { physicsConfig } = await server.ssrLoadModule('/src/config/physics.ts');
const { createMarbleLayout } = await server.ssrLoadModule('/src/marble/layout.ts');
const { initializePhysics, MarblePhysics } = await server.ssrLoadModule('/src/marble/physics.ts');
const { MarbleSimulation, applySlot } = await server.ssrLoadModule('/src/marble/simulation.ts');
await initializePhysics();

const layout = createMarbleLayout(marbleConfig);
function config() {
  const c = structuredClone(physicsConfig);
  c.spawn.automatic = false;
  return c;
}
function seeded(seed = 12345) {
  return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}
async function simulation(t, c = config(), geometry = layout) {
  const events = [];
  const sim = await MarbleSimulation.create(geometry, c, (e) => events.push(e), seeded());
  t.after(() => sim.dispose());
  return { sim, events };
}
function world(t, c = config(), geometry = layout) {
  const physics = new MarblePhysics(geometry, c);
  t.after(() => physics.dispose());
  return physics;
}
function advance(sim, seconds) {
  for (let i = 0; i < Math.round(seconds / sim.config.simulation.fixedTimeStep); i++) {
    sim.advance(sim.config.simulation.fixedTimeStep);
  }
}
function dropInto(sim, id, stage, slotIndex) {
  const team = sim.teams[0];
  const marble = team.marbles.get(id);
  assert.equal(marble.stage, stage);
  // Allow the real warp to finish before setting up the next controlled drop.
  while (marble.waiting) sim.advance(sim.config.simulation.fixedTimeStep);
  const device = layout[stage];
  const slot = device.slots[slotIndex];
  team.physics.remove(id);
  team.physics.add(id, {
    x: device.bounds.x + slot.x + slot.width / 2,
    y: device.bounds.y + slot.y - slot.funnelHeight - 10,
  }, { x: 0, y: 180 });
  const before = { ...team.stats };
  for (let i = 0; i < 240; i++) {
    sim.advance(sim.config.simulation.fixedTimeStep);
    if (JSON.stringify(before) !== JSON.stringify(team.stats)) return;
  }
  assert.fail(`No sensor arrival for ${stage}/${slot.definition.id}`);
}

test('both teams generate moving marbles in independent worlds', async (t) => {
  const c = config();
  c.spawn.automatic = true;
  const { sim } = await simulation(t, c);
  advance(sim, 0.2);
  for (const team of sim.teams) {
    assert.equal(team.stats.spawned, 1);
    const id = [...team.marbles.keys()][0];
    assert.notDeepEqual(team.physics.pose(id), { ...team.physics.start('upper'), angle: 0 });
    assert.equal(team.physics.world.bodies.len(), 1);
  }
  assert.notEqual(sim.teams[0].physics.world, sim.teams[1].physics.world);
  const blueBefore = sim.teams[1].physics.pose(2);
  sim.teams[0].physics.remove(1);
  assert.deepEqual(sim.teams[1].physics.pose(2), blueBefore);
});

test('CCD keeps a fast ball inside the wall and it rebounds', (t) => {
  const c = config(); c.gravity.y = 0;
  const p = world(t, c);
  p.add(1, { x: 490, y: 130 }, { x: 900, y: 0 });
  let furthest = 0;
  for (let i = 0; i < 30; i++) { p.step(); furthest = Math.max(furthest, p.pose(1).x); }
  assert.ok(furthest < layout.upper.bounds.x + layout.upper.bounds.width - layout.upper.wallThickness);
  assert.ok(p.pose(1).x < 490, 'wall reverses velocity');
});

test('a pin rebounds a falling ball', (t) => {
  const c = config(); c.gravity.y = 0;
  const p = world(t, c);
  const pin = layout.pins[0];
  p.add(1, { x: layout.lower.bounds.x + pin.x, y: layout.lower.bounds.y + pin.y - 32 }, { x: 0, y: 180 });
  let previous = p.pose(1).y;
  let bounced = false;
  for (let i = 0; i < 40; i++) {
    p.step(); const y = p.pose(1).y;
    if (y < previous) bounced = true;
    previous = y;
  }
  assert.ok(bounced);
});

test('marble-to-marble contact transfers momentum and prevents overlap', (t) => {
  const c = config(); c.gravity.y = 0;
  const p = world(t, c);
  p.add(1, { x: 200, y: 130 }, { x: 150, y: 0 });
  p.add(2, { x: 240, y: 130 }, { x: -150, y: 0 });
  let smallestGap = Infinity;
  for (let i = 0; i < 45; i++) {
    p.step(); smallestGap = Math.min(smallestGap, p.pose(2).x - p.pose(1).x);
  }
  assert.ok(smallestGap >= 2 * c.marble.radius - 0.5);
  assert.ok(p.pose(1).x < 210 && p.pose(2).x > 230);
});

test('every upper and lower opening accepts a real falling marble via its sensor', (t) => {
  const p = world(t);
  let id = 0;
  for (const stage of ['upper', 'lower']) for (const slot of layout[stage].slots) {
    id++;
    const b = layout[stage].bounds;
    p.add(id, { x: b.x + slot.x + slot.width / 2, y: b.y + slot.y - slot.funnelHeight - 10 }, { x: 0, y: 180 });
    let found;
    for (let i = 0; i < 180 && !found; i++) found = p.step().find((a) => a.marbleId === id);
    assert.equal(found?.slot.definition.id, slot.definition.id);
    assert.equal(found?.stage, stage);
    p.remove(id);
  }
});

test('effect once → ×2 → ×2 → deployment with value 4; bodies and colliders are removed', async (t) => {
  const { sim, events } = await simulation(t);
  const baseline = sim.teams[0].physics.world.colliders.len();
  const id = sim.spawn('red');
  dropInto(sim, id, 'upper', 1);
  assert.equal(sim.teams[0].marbles.get(id).effectId, 'effect-b');
  assert.equal(sim.teams[0].physics.world.bodies.len(), 0, 'warp removes the old body');
  sim.advance(sim.config.simulation.fixedTimeStep);
  const position = sim.teams[0].physics.pose(id);
  const start = sim.teams[0].physics.start('lower');
  assert.ok(Math.hypot(position.x - start.x, position.y - start.y) < 5);
  assert.ok(Math.abs(position.angle) < 0.001, 'warp resets angular state');
  dropInto(sim, id, 'lower', 0);
  dropInto(sim, id, 'lower', 0);
  dropInto(sim, id, 'lower', 1);
  assert.deepEqual(events.map((e) => e.type), ['effect', 'multiplier', 'multiplier', 'deploy']);
  assert.equal(events.at(-1).marble.value, 4);
  assert.equal(events.at(-1).marble.effectId, 'effect-b');
  assert.equal(sim.teams[0].marbles.size, 0);
  assert.equal(sim.teams[0].physics.world.bodies.len(), 0);
  assert.equal(sim.teams[0].physics.world.colliders.len(), baseline);
  advance(sim, 0.5);
  assert.equal(events.length, 4, 'old contacts cannot fire after warp or disposal');
});

test('rule state rejects duplicate effects and waiting contacts; rerolls and values are bounded', () => {
  const c = config(); c.rules.maxValue = 3; c.rules.maxRerolls = 1;
  const m = { id: 1, team: 'red', stage: 'upper', waiting: false, value: 1, rerolls: 0, age: 0 };
  const effect = { kind: 'effect', effectId: 'a', target: 'lower-start' };
  const double = { kind: 'multiplier', factor: 2, target: 'lower-start' };
  assert.equal(applySlot(m, effect, c).type, 'effect');
  assert.equal(applySlot(m, effect, c), undefined);
  m.waiting = false;
  assert.equal(applySlot(m, effect, c), undefined);
  assert.equal(applySlot(m, double, c).type, 'multiplier');
  assert.equal(applySlot(m, double, c), undefined);
  m.waiting = false;
  assert.equal(applySlot(m, double, c).reason, 'reroll-limit');
  assert.equal(m.value, 3);
});

test('gravity, launch speed, radius and material configuration affect real bodies', async (t) => {
  const a = config(); a.gravity.y = 0; a.launch.upper.speedMin = a.launch.upper.speedMax = 50;
  a.launch.upper.angleMin = a.launch.upper.angleMax = 0;
  const b = structuredClone(a); b.gravity.y = 400; b.marble.radius = 6;
  b.launch.upper.speedMin = b.launch.upper.speedMax = 150; b.marble.restitution = 0.3; b.marble.friction = 0.2;
  const { sim: first } = await simulation(t, a);
  const { sim: second } = await simulation(t, b);
  const i = first.spawn('red'), j = second.spawn('red');
  advance(first, 0.1); advance(second, 0.1);
  assert.ok(second.teams[0].physics.pose(j).x > first.teams[0].physics.pose(i).x + 8);
  assert.ok(second.teams[0].physics.pose(j).y > first.teams[0].physics.pose(i).y + 1);
  const collider = [...second.teams[0].physics.world.bodies.getAll()][0].collider(0);
  assert.ok(Math.abs(collider.radius() * b.simulation.pixelsPerMeter - 6) < 0.001);
  assert.ok(Math.abs(collider.restitution() - 0.3) < 0.001);
  assert.ok(Math.abs(collider.friction() - 0.2) < 0.001);
});

test('narrowed openings change the real collision geometry and remain passable', (t) => {
  const modified = structuredClone(marbleConfig);
  modified.upper.row.openingWidth = 18;
  const narrow = createMarbleLayout(modified);
  const p = world(t, config(), narrow);
  const slot = narrow.upper.slots[0];
  assert.equal(slot.sensor.width, 18);
  assert.notDeepEqual(slot.solids, layout.upper.slots[0].solids);
  p.add(1, { x: narrow.upper.bounds.x + slot.x + slot.width / 2, y: narrow.upper.bounds.y + slot.y - 25 }, { x: 0, y: 180 });
  let arrival;
  for (let i = 0; i < 180 && !arrival; i++) arrival = p.step()[0];
  assert.equal(arrival?.slot.definition.id, 'effect-a');
  // A point that was inside the wide opening now belongs to its solid shoulder.
  const probeX = narrow.upper.bounds.x + slot.x + slot.width / 2 - 18;
  const probeY = narrow.upper.bounds.y + slot.y + 1;
  let hit = false;
  p.world.intersectionsWithPoint({ x: probeX / p.scale, y: probeY / p.scale }, (collider) => {
    if (!collider.isSensor()) hit = true;
    return true;
  });
  assert.ok(hit);
});

test('fixed stepping gives equivalent results at 30 and 60 FPS and limits long frames', async (t) => {
  const { sim: a } = await simulation(t);
  const { sim: b } = await simulation(t);
  a.spawn('red'); b.spawn('red');
  for (let i = 0; i < 15; i++) a.advance(1 / 30);
  for (let i = 0; i < 30; i++) b.advance(1 / 60);
  assert.deepEqual(a.teams[0].physics.pose(1), b.teams[0].physics.pose(1));
  const before = a.teams[0].marbles.get(1).age;
  a.advance(1000);
  assert.ok(a.teams[0].marbles.get(1).age - before <= 0.101);
  a.advance(Infinity);
  assert.ok(Number.isFinite(a.alpha));
});

test('spawn cap, crowded starts, lifetime expiry and disposal are bounded', async (t) => {
  const c = config(); c.spawn.maxPerTeam = 1; c.rules.maxLifetime = 0.2;
  const { sim, events } = await simulation(t, c);
  const base = sim.teams[0].physics.world.colliders.len();
  assert.equal(sim.spawn('red'), 1);
  assert.equal(sim.spawn('red'), undefined);
  advance(sim, 0.3);
  assert.equal(events.at(-1).reason, 'lifetime-limit');
  assert.equal(sim.teams[0].physics.world.colliders.len(), base);
  assert.equal(sim.teams[0].physics.world.bodies.len(), 0);
  assert.ok(sim.spawn('red'));
  sim.dispose(); sim.dispose(); sim.advance(1);
  assert.equal(sim.spawn('red'), undefined);
});

test('unsafe geometry or numerical settings fail before starting WASM worlds', async () => {
  const c = config(); c.marble.radius = 16;
  await assert.rejects(MarbleSimulation.create(layout, c), /does not fit/);
  c.marble.radius = 7; c.simulation.fixedTimeStep = 1;
  await assert.rejects(MarbleSimulation.create(layout, c), /sample pocket sensors safely/);
  c.simulation.fixedTimeStep = 0;
  await assert.rejects(MarbleSimulation.create(layout, c), /positive/);
});

test('configured batches wait for spawn clearance and respect capacity', async (t) => {
  const c = config(); c.spawn.automatic = true; c.spawn.batchSize = 3;
  c.spawn.interval = 10; c.spawn.maxPerTeam = 3;
  const { sim } = await simulation(t, c);
  sim.advance(c.simulation.fixedTimeStep);
  assert.equal(sim.teams[0].stats.spawned, 1);
  assert.equal(sim.teams[0].pendingSpawns, 2);
  advance(sim, 0.5);
  assert.equal(sim.teams[0].stats.spawned, 3);
  assert.equal(sim.teams[0].pendingSpawns, 0);
  assert.ok(sim.teams.every((team) => team.marbles.size <= 3));
});

test('crowded 30-second run bounds spawning, live bodies, pending batches and contacts', async (t) => {
  const c = config(); c.spawn.automatic = true; c.spawn.interval = 0.02;
  c.spawn.batchSize = 8; c.spawn.maxPerTeam = 48;
  const { sim, events } = await simulation(t, c);
  const base = sim.teams.map((team) => team.physics.world.colliders.len());
  for (let second = 0; second < 30; second++) {
    advance(sim, 1);
    sim.teams.forEach((team, i) => {
      assert.ok(team.marbles.size <= c.spawn.maxPerTeam);
      assert.ok(team.pendingSpawns <= c.spawn.maxPerTeam);
      assert.equal(team.physics.world.colliders.len(), base[i] + team.physics.world.bodies.len());
    });
  }
  assert.ok(sim.teams.every((team) => team.stats.deployed > 20));
  assert.equal(events.filter((e) => e.reason === 'out-of-bounds').length, 0);
  t.diagnostic(JSON.stringify(sim.teams.map((team) => team.stats)));
});

test('seeded 120-second run completes both loops and leaves no orphan colliders', async (t) => {
  const c = config(); c.spawn.automatic = true;
  const { sim, events } = await simulation(t, c);
  const base = sim.teams.map((team) => team.physics.world.colliders.len());
  advance(sim, 120);
  sim.teams.forEach((team, i) => {
    assert.ok(team.stats.effects > 30);
    assert.ok(team.stats.multipliers > 10);
    assert.ok(team.stats.deployed > 20);
    assert.ok(team.marbles.size <= c.spawn.maxPerTeam);
    const active = [...team.marbles.values()].filter((m) => !m.waiting).length;
    assert.equal(team.physics.world.bodies.len(), active);
    assert.equal(team.physics.world.colliders.len(), base[i] + active);
  });
  assert.equal(events.filter((e) => e.reason === 'out-of-bounds').length, 0);
  t.diagnostic(JSON.stringify(sim.teams.map((team) => team.stats)));
});
