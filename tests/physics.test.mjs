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
  // Isolate base collisions/rules from moving geometry in the focused tests.
  c.obstacles.mountains.enabled = false;
  c.obstacles.pinFlow.enabled = false;
  return c;
}
function movingConfig() {
  const c = structuredClone(physicsConfig);
  // Explicitly exercise the optional legacy obstacle system. Default gameplay disables it.
  c.obstacles.mountains.enabled = true;
  // Keep the legacy moving needles clear of the current upper start markers.
  c.obstacles.mountains.motions.forEach(motion => { motion.amplitude = 170; });
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
function dropInto(sim, id, stage, slotIndex, horizontalFraction = 0.5) {
  const team = sim.teams[0];
  const marble = team.marbles.get(id);
  assert.equal(marble.stage, stage);
  // Allow the real warp to finish before setting up the next controlled drop.
  while (marble.waiting) sim.advance(sim.config.simulation.fixedTimeStep);
  const device = team.physics.layout[stage];
  const slot = device.slots[slotIndex];
  team.physics.remove(id);
  team.physics.add(id, {
    x: device.bounds.x + slot.x + slot.width * horizontalFraction,
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
  p.add(1, { x: 490, y: 80 }, { x: 900, y: 0 });
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
  p.add(1, { x: 200, y: 80 }, { x: 150, y: 0 });
  p.add(2, { x: 240, y: 80 }, { x: -150, y: 0 });
  let smallestGap = Infinity;
  for (let i = 0; i < 45; i++) {
    p.step(); smallestGap = Math.min(smallestGap, p.pose(2).x - p.pose(1).x);
  }
  assert.ok(smallestGap >= 2 * c.marble.radius - 0.5);
  assert.ok(p.pose(1).x < 210 && p.pose(2).x > 230);
});

test('every upper and lower opening accepts a real falling marble via its sensor', (t) => {
  // Isolate sensors from pins; moving-pin integration is covered by the long runs.
  const p = world(t, config(), { ...layout, pins: [] });
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
  assert.equal(sim.teams[0].marbles.get(id).effectId, 'straight');
  assert.equal(sim.teams[0].physics.world.bodies.len(), 0, 'warp removes the old body');
  for (let step = 0; step < 600 && sim.teams[0].marbles.get(id).waiting; step++) {
    sim.advance(sim.config.simulation.fixedTimeStep);
  }
  const position = sim.teams[0].physics.pose(id);
  const start = sim.teams[0].physics.start('lower');
  assert.ok(Math.hypot(position.x - start.x, position.y - start.y) < 5);
  assert.ok(Math.abs(position.angle) < 0.001, 'warp resets angular state');
  dropInto(sim, id, 'lower', 0);
  dropInto(sim, id, 'lower', 0);
  dropInto(sim, id, 'lower', 1);
  assert.deepEqual(events.map((e) => e.type), ['effect', 'multiplier', 'multiplier', 'deploy']);
  assert.equal(events.at(-1).marble.value, 4);
  assert.equal(events.at(-1).marble.effectId, 'straight');
  assert.equal(sim.teams[0].marbles.get(id).transfer.target, 'battle-cannon');
  assert.equal(sim.teams[0].physics.world.bodies.len(), 0);
  assert.equal(sim.teams[0].physics.world.colliders.len(), baseline);
  for (let step = 0; step < 1200 && sim.teams[0].marbles.has(id); step++) {
    sim.advance(sim.config.simulation.fixedTimeStep);
  }
  assert.equal(sim.teams[0].marbles.size, 0);
  assert.deepEqual(events.map((e) => e.type), ['effect', 'multiplier', 'multiplier', 'deploy', 'cannon-arrival']);
  assert.equal(sim.teams[0].physics.world.bodies.len(), 0, 'old contacts cannot fire after transfer');
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
  const firstX = first.teams[0].physics.pose(i).x, secondX = second.teams[0].physics.pose(j).x;
  advance(first, 0.1); advance(second, 0.1);
  assert.ok(secondX - second.teams[0].physics.pose(j).x > firstX - first.teams[0].physics.pose(i).x + 8);
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
  assert.equal(arrival?.slot.definition.id, 'straight-1');
  // A point that was inside the wide opening now belongs to its solid shoulder.
  const probeX = narrow.upper.bounds.x + slot.x + slot.width / 2 - 9.5;
  const probeY = narrow.upper.bounds.y + slot.y + 1;
  let hit = false;
  p.world.intersectionsWithPoint({ x: probeX / p.scale, y: probeY / p.scale }, (collider) => {
    if (!collider.isSensor()) hit = true;
    return true;
  });
  assert.ok(hit);
});

test('fixed stepping gives equivalent results at 30 and 60 FPS and limits long frames', async (t) => {
  const { sim: a } = await simulation(t, movingConfig());
  const { sim: b } = await simulation(t, movingConfig());
  a.spawn('red'); b.spawn('red');
  for (let i = 0; i < 15; i++) a.advance(1 / 30);
  for (let i = 0; i < 30; i++) b.advance(1 / 60);
  assert.deepEqual(a.teams[0].physics.pose(1), b.teams[0].physics.pose(1));
  assert.deepEqual([...a.teams[0].physics.obstacles.items.values()], [...b.teams[0].physics.obstacles.items.values()]);
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
  const c = movingConfig(); c.spawn.automatic = true; c.spawn.interval = 0.02;
  c.spawn.batchSize = 8; c.spawn.maxPerTeam = 48;
  const { sim, events } = await simulation(t, c);
  const base = sim.teams.map((team) => team.physics.world.colliders.len() - team.physics.obstacles.items.size);
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
  const c = movingConfig(); c.spawn.automatic = true;
  const { sim, events } = await simulation(t, c);
  const base = sim.teams.map((team) => team.physics.world.colliders.len() - team.physics.obstacles.items.size);
  advance(sim, 120);
  sim.teams.forEach((team, i) => {
    assert.ok(team.stats.effects > 30);
    assert.ok(team.stats.multipliers > 10);
    assert.ok(team.stats.deployed > 20);
    assert.ok(team.marbles.size <= c.spawn.maxPerTeam);
    const active = [...team.marbles.values()].filter((m) => !m.waiting).length;
    assert.equal(team.physics.world.bodies.len(), active + team.physics.obstacles.items.size);
    assert.equal(team.physics.world.colliders.len(), base[i] + active + team.physics.obstacles.items.size);
  });
  assert.equal(events.filter((e) => e.reason === 'out-of-bounds').length, 0);
  t.diagnostic(JSON.stringify(sim.teams.map((team) => team.stats)));
  t.diagnostic(`Mean upper-stage time: ${(events.filter((e) => e.type === 'effect')
    .reduce((sum, e) => sum + e.marble.age, 0) / events.filter((e) => e.type === 'effect').length).toFixed(2)}s`);
});

test('flat, funnel and crater entrances share open geometry with functioning sensors', (t) => {
  for (const entrance of ['flat', 'funnel', 'crater']) {
    const stage = structuredClone(marbleConfig);
    stage.upper.row.entrance = entrance;
    const geometry = createMarbleLayout(stage);
    const slot = geometry.upper.slots[0];
    const shoulder = slot.solids[3];
    if (entrance === 'flat') assert.equal(shoulder[0].y, shoulder[1].y);
    if (entrance === 'funnel') assert.ok(shoulder[0].y < shoulder[1].y);
    if (entrance === 'crater') assert.ok(shoulder[0].y > shoulder[1].y);
    const p = world(t, config(), geometry);
    p.add(1, { x: geometry.upper.bounds.x + slot.x + slot.width / 2,
      y: geometry.upper.bounds.y + slot.y - slot.funnelHeight - 15 }, { x: 0, y: 180 });
    let result;
    for (let i = 0; i < 180 && !result; i++) result = p.step()[0];
    assert.equal(result?.slot.definition.id, 'straight-1', entrance);
  }
});

test('two narrow needles cross at the center and travel to both edges', (t) => {
  const c = movingConfig(); c.obstacles.pinFlow.enabled = false;
  const p = world(t, c);
  const mountains = [...p.obstacles.items.values()];
  assert.equal(mountains.length, 2);
  assert.equal(mountains[0].shape.points, layout.mountains[0].points);
  const angle = 2 * Math.atan(layout.mountains[0].width / (2 * layout.mountains[0].height)) * 180 / Math.PI;
  assert.ok(Math.abs(angle - 20) < 1);
  assert.equal(mountains[0].shape.points.length, 3);
  const edges = mountains.map((m) => m.position.x);
  const stepCount = Math.round(c.obstacles.mountains.motions[0].period / 4 / c.simulation.fixedTimeStep);
  for (let i = 0; i < stepCount; i++) p.step();
  assert.ok(mountains.every((m, i) => Math.abs(m.position.x - (layout.upper.bounds.x + layout.mountains[i].position.x)) < 0.01));
  for (const body of p.world.bodies.getAll()) {
    assert.ok(body.isKinematic());
    assert.ok(mountains.some((m) => Math.hypot(m.position.x - body.translation().x * p.scale,
      m.position.y - body.translation().y * p.scale) < 0.001));
  }
  for (let i = 0; i < stepCount; i++) p.step();
  assert.ok(Math.abs(mountains[0].position.x - edges[1]) < 0.01);
  assert.ok(Math.abs(mountains[1].position.x - edges[0]) < 0.01);
  for (let i = 0; i < stepCount * 2; i++) p.step();
  assert.ok(Math.abs(mountains[0].position.x - edges[0]) < 0.01);
  assert.ok(Math.abs(mountains[1].position.x - edges[1]) < 0.01);
  assert.ok(mountains.every((m) => m.position.x >= layout.upper.bounds.x + layout.upper.wallThickness - 0.01
    && m.position.x <= layout.upper.bounds.x + layout.upper.bounds.width - layout.upper.wallThickness + 0.01));
});

test('a moving mountain physically pushes a stationary marble', (t) => {
  const c = movingConfig(); c.gravity.y = 0; c.obstacles.pinFlow.enabled = false;
  const p = world(t, c, { ...layout, upper: { ...layout.upper, slots: [] } });
  const m = layout.mountains[0];
  const start = { x: layout.upper.bounds.x + m.position.x - c.obstacles.mountains.motions[0].amplitude
      + m.width / 2 + c.marble.radius + 2,
    y: layout.upper.bounds.y + m.position.y + m.height / 2 - 2 };
  p.add(1, start, { x: 0, y: 0 });
  for (let i = 0; i < 45; i++) p.step();
  assert.ok(p.pose(1).x > start.x + 5, `mountain should transfer horizontal momentum: ${JSON.stringify(p.pose(1))}`);
});

test('an upward-moving pin transfers momentum without moving the marble by script', (t) => {
  const c = movingConfig(); c.gravity.y = 0; c.obstacles.mountains.enabled = false;
  const p = world(t, c);
  const pin = layout.pins[5];
  const start = { x: layout.lower.bounds.x + pin.x,
    y: layout.lower.bounds.y + pin.y - pin.radius - c.marble.radius - 4 };
  p.add(1, start, { x: 0, y: 0 });
  for (let i = 0; i < 60; i++) p.step();
  assert.ok(p.pose(1).y < start.y - 5);
  const stationary = structuredClone(c); stationary.obstacles.pinFlow.enabled = false;
  const fixed = world(t, stationary);
  fixed.add(1, start, { x: 0, y: 0 });
  for (let i = 0; i < 60; i++) fixed.step();
  assert.ok(Math.abs(fixed.pose(1).y - start.y) < 0.001);
});

test('new pin rows keep alternating A/B offsets after the initial rows', (t) => {
  const c = movingConfig(); c.obstacles.mountains.enabled = false;
  const p = world(t, c);
  assert.equal(layout.pinFlow.rows.length, 2);
  const initialYs = [...new Set(layout.pins.map((pin) => pin.y))].sort((a, b) => a - b);
  assert.equal(initialYs.length, marbleConfig.lower.pins.rowCounts.length);
  initialYs.forEach((y, index) => {
    assert.deepEqual(layout.pins.filter((pin) => pin.y === y).map((pin) => pin.x),
      layout.pinFlow.rows[index % 2]);
  });
  let lastId = Math.max(...p.obstacles.items.keys());
  for (let rowIndex = 0; rowIndex < 4; rowIndex++) {
    let generated = [];
    for (let step = 0; step < 300 && generated.length === 0; step++) {
      p.step();
      generated = [...p.obstacles.items.values()].filter((item) => item.id > lastId);
    }
    assert.ok(generated.length > 0, `row ${rowIndex} was not generated`);
    assert.deepEqual(generated.map((item) => item.position.x - layout.lower.bounds.x),
      layout.pinFlow.rows[(initialYs.length + rowIndex) % 2]);
    lastId = generated.at(-1).id;
  }
  const [a, b] = layout.pinFlow.rows;
  assert.equal(Math.abs(a[0] - b[0]), marbleConfig.lower.pins.spacingX / 2);
});

test('fall speed cap slows real falling bodies without changing sideways or upward motion', (t) => {
  const slow = config(); slow.gravity.y = 700; // Fixed reference gravity isolates the speed cap.
  const fast = structuredClone(slow); fast.marble.maxFallSpeed = fast.marble.maxSpeed;
  const geometry = { ...layout, pins: [] };
  const a = world(t, slow, geometry), b = world(t, fast, geometry);
  const start = { x: layout.lower.bounds.x + 80, y: layout.lower.bounds.y + 50 };
  a.add(1, start, { x: 60, y: 0 }); b.add(1, start, { x: 60, y: 0 });
  for (let i = 0; i < 72; i++) {
    a.step(); b.step();
    assert.ok(a.world.bodies.getAll()[0].linvel().y * a.scale <= slow.marble.maxFallSpeed + 0.001);
  }
  assert.ok(a.pose(1).y - start.y < (b.pose(1).y - start.y) * 0.7);
  assert.ok(Math.abs(a.pose(1).x - b.pose(1).x) < 0.001);
  t.diagnostic(`0.6s free fall: cap160=${(a.pose(1).y - start.y).toFixed(1)}px, cap900=${(b.pose(1).y - start.y).toFixed(1)}px`);

  const upwardA = world(t, slow, geometry), upwardB = world(t, fast, geometry);
  upwardA.add(1, start, { x: 30, y: -200 }); upwardB.add(1, start, { x: 30, y: -200 });
  for (let i = 0; i < 12; i++) { upwardA.step(); upwardB.step(); }
  assert.deepEqual(upwardA.pose(1), upwardB.pose(1));
  const launched = world(t, slow, geometry);
  launched.add(1, start, { x: 30, y: 400 });
  assert.ok(Math.abs(launched.world.bodies.getAll()[0].linvel().y * launched.scale - 160) < 0.001);
});

test('fall speed must be finite and positive', async () => {
  for (const speed of [0, -1, NaN, Infinity]) {
    const c = config(); c.marble.maxFallSpeed = speed;
    await assert.rejects(MarbleSimulation.create(layout, c), /maxFallSpeed/);
  }
});

test('former lower plates are passable and adjacent bands choose only the ball center result', (t) => {
  const c = config(); c.gravity.y = 0;
  const p = world(t, c, { ...layout, pins: [] });
  const b = layout.lower.bounds;
  let id = 0;
  for (const slot of layout.lower.slots) {
    for (const fraction of [0.2, 0.8]) {
      const x = b.x + slot.x + slot.width * fraction;
      p.add(++id, { x, y: b.y + slot.y - 20 }, { x: 0, y: 150 });
      let found;
      for (let step = 0; step < 100 && !found; step++) found = p.step().find((a) => a.marbleId === id);
      assert.equal(found?.slot.definition.id, slot.definition.id);
      p.remove(id);
    }
  }
  const boundary = b.x + layout.lower.slots[1].x;
  for (const offset of [-0.5, 0.5]) {
    p.add(++id, { x: boundary + offset, y: b.y + layout.lower.slots[1].y + 20 }, { x: 0, y: 0 });
    const arrivals = p.step().filter((a) => a.marbleId === id);
    assert.equal(arrivals.length, 1);
    assert.equal(arrivals[0].slot.definition.id, layout.lower.slots[offset < 0 ? 0 : 1].definition.id);
    p.remove(id);
  }
});

test('flow spawns at the bottom inside the result bands and rejects solid exits or floor overlap', async (t) => {
  const c = movingConfig(); c.obstacles.mountains.enabled = false;
  const { sim } = await simulation(t, c);
  const p = sim.teams[0].physics;
  const firstId = Math.max(...p.obstacles.items.keys());
  let newPin;
  for (let step = 0; step < 300 && !newPin; step++) {
    p.step();
    newPin = [...p.obstacles.items.values()].find((pin) => pin.id > firstId);
  }
  assert.ok(newPin);
  const bottom = layout.lower.bounds.y + layout.lower.bounds.height;
  assert.ok(Math.abs(newPin.position.y + layout.pinFlow.radius - (bottom - 6)) < 0.001);
  assert.ok(newPin.position.y > layout.lower.bounds.y + layout.lower.slots[0].y);
  const stage = structuredClone(marbleConfig);
  stage.lower.pins.spawnY = stage.lower.height;
  await assert.rejects(MarbleSimulation.create(createMarbleLayout(stage), c), /boundaries/);
  stage.lower.pins.spawnY = null;
  stage.lower.row.entrance = 'flat';
  await assert.rejects(MarbleSimulation.create(createMarbleLayout(stage), c), /boundaries/);
});

test('lower result bands have no solid plates and retain full-width sensors', (t) => {
  const p = world(t);
  assert.equal(marbleConfig.lower.row.entrance, 'open');
  for (const slot of layout.lower.slots) {
    assert.equal(slot.funnelHeight, 0);
    assert.deepEqual(slot.solids, []);
    assert.equal(slot.sensor.width, slot.width);
    assert.ok(slot.sensor.width > 2 * physicsConfig.marble.radius);
  }
  assert.ok(p.world.colliders.len() > 0);
});

test('flow recycles bodies and colliders for five minutes with bounded active counts', (t) => {
  const c = movingConfig();
  const p = world(t, c);
  const fixedCount = p.world.colliders.len() - p.obstacles.items.size;
  const original = [...p.obstacles.items.values()].find((item) => item.kind === 'pin').id;
  let maxActive = 0;
  for (let i = 0; i < 300 / c.simulation.fixedTimeStep; i++) {
    p.step();
    maxActive = Math.max(maxActive, p.obstacles.items.size);
    if (i % 120 === 0) {
      assert.equal(p.world.bodies.len(), p.obstacles.items.size);
      assert.equal(p.world.colliders.len(), fixedCount + p.obstacles.items.size);
    }
  }
  assert.equal(p.obstacles.items.has(original), false);
  assert.ok(p.obstacles.stats.created > 500 && p.obstacles.stats.removed > 500);
  assert.ok(maxActive <= c.obstacles.pinFlow.maxPins + layout.mountains.length);
  p.obstacles.dispose(); p.obstacles.dispose();
  assert.equal(p.obstacles.items.size, 0);
  assert.equal(p.world.bodies.len(), 0);
  assert.equal(p.world.colliders.len(), fixedCount);
});

test('speed, period, amplitude, row cadence and shape can be adjusted from configuration', (t) => {
  const c = movingConfig(); c.obstacles.pinFlow.speed = 40; c.obstacles.pinFlow.spawnInterval = 0.5;
  c.obstacles.mountains.motions[0].amplitude = 25; c.obstacles.mountains.motions[0].period = 2;
  const stage = structuredClone(marbleConfig); stage.upper.mountains[0].width = 60;
  stage.upper.mountains[0].topWidth = 0;
  const geometry = createMarbleLayout(stage);
  const p = world(t, c, geometry);
  const mountain = [...p.obstacles.items.values()].find((o) => o.kind === 'mountain');
  const pin = [...p.obstacles.items.values()].filter((o) => o.kind === 'pin')[marbleConfig.lower.pins.rowCounts[0]];
  const initialX = mountain.position.x, initialY = pin.position.y;
  assert.equal(mountain.shape.points.length, 3);
  assert.equal(Math.max(...mountain.shape.points.map((v) => v.x)), 30);
  for (let i = 0; i < 60; i++) p.step();
  assert.ok(Math.abs(mountain.position.x - initialX - 25) < 0.01);
  assert.ok(Math.abs(pin.position.y - initialY + 20) < 0.01);
  assert.equal(p.obstacles.interval, 0.5);
  assert.ok(p.obstacles.stats.created > layout.mountains.length + layout.pins.length);
});

test('moving geometry rejects obstructed starts, exits, excessive speed and unbounded spawn cadence', async () => {
  const badMountain = movingConfig(); badMountain.obstacles.mountains.motions[0].amplitude = 300;
  await assert.rejects(MarbleSimulation.create(layout, badMountain), /mountain sweep/);
  const badSpeed = movingConfig(); badSpeed.obstacles.pinFlow.speed = 0;
  await assert.rejects(MarbleSimulation.create(layout, badSpeed), /pin flow/);
  const badInterval = movingConfig(); badInterval.obstacles.pinFlow.spawnInterval = 0.0001;
  await assert.rejects(MarbleSimulation.create(layout, badInterval), /pin flow/);
  const stage = structuredClone(marbleConfig); stage.lower.pins.despawnY = stage.lower.start.y + 10;
  await assert.rejects(MarbleSimulation.create(createMarbleLayout(stage), movingConfig()), /boundaries/);
});

test('Pixi obstacle graphics match shared shapes and poses, and are destroyed with retired pins', async (t) => {
  // Pixi's module-level browser detection expects navigator on Node 20.
  // No canvas/GPU is mocked: this test verifies real display-object lifecycle only.
  if (!globalThis.navigator) {
    Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'node' }, configurable: true });
    t.after(() => { delete globalThis.navigator; });
  }
  const { Container } = await import('pixi.js');
  const { createMarbleRenderer } = await server.ssrLoadModule('/src/marble/render.ts');
  const c = movingConfig();
  const { sim } = await simulation(t, c);
  const parent = new Container();
  t.after(() => parent.destroy({ children: true }));
  const render = createMarbleRenderer(parent, { id: 'red', label: '赤', color: 0xff0000 }, c);
  const team = sim.teams[0];
  render(team, 1, false);
  const layer = parent.children.find((child) => child.label === 'moving-obstacles');
  const firstGraphics = [...layer.children];
  const transportedId = sim.spawn('red');
  dropInto(sim, transportedId, 'upper', 2);
  sim.advance(c.simulation.fixedTimeStep);
  render(team, 0.5, false);
  const transport = team.marbles.get(transportedId).transfer;
  const { transferPose } = await server.ssrLoadModule('/src/marble/transfer.ts');
  const expected = transferPose(transport, 0.5);
  const ballLayer = parent.children.find(child => child.label === 'moving-marbles');
  assert.equal(ballLayer.children.length, 1);
  assert.equal(ballLayer.children[0].visible, true);
  assert.equal(team.physics.pose(transportedId), undefined);
  assert.ok(Math.hypot(ballLayer.children[0].x - expected.x, ballLayer.children[0].y - expected.y) < 0.001);
  const valueLabel = ballLayer.children[0].children.find(child => child.label === 'marble-value');
  assert.equal(valueLabel.text, '1');
  assert.equal(valueLabel.rotation, 0);
  assert.ok(valueLabel.y < -c.marble.radius);
  dropInto(sim, transportedId, 'lower', 0);
  render(team, 1, false);
  assert.equal(valueLabel.text, '2');
  assert.ok(team.marbles.get(transportedId).rerollFrom);
  assert.equal(ballLayer.children[0].visible, true, 'waiting reroll keeps the updated value visible');
  for (let step = 0; step < 600 && team.marbles.get(transportedId).waiting; step++) sim.advance(c.simulation.fixedTimeStep);
  const trail = team.marbles.get(transportedId).rerollTrail;
  assert.ok(trail);
  assert.ok(trail.from.y > trail.to.y);
  assert.deepEqual(trail.to, team.physics.start('lower'));
  render(team, 1, false);
  const trailGraphic = parent.children.find(child => child.label === 'reroll-trails');
  assert.ok(trailGraphic.getLocalBounds().height > 100);
  advance(sim, c.reroll.trailDuration + 0.1);
  render(team, 1, false);
  assert.equal(team.marbles.get(transportedId).rerollTrail, undefined);
  assert.equal(trailGraphic.getLocalBounds().height, 0);
  dropInto(sim, transportedId, 'lower', 2, 0.75);
  render(team, 1, false);
  assert.equal(valueLabel.text, '6');
  dropInto(sim, transportedId, 'lower', 1);
  render(team, 1, false);
  assert.equal(team.marbles.get(transportedId).transfer.target, 'battle-cannon');
  for (let frame = 0; frame < 900; frame++) {
    sim.advance(1 / 60);
    render(team, 0.5, false);
    assert.equal(layer.children.length, team.physics.obstacles.items.size);
  }
  assert.equal(ballLayer.children.length, 0);
  assert.equal(valueLabel.destroyed, true);
  assert.ok(firstGraphics.slice(2).every((graphic) => graphic.destroyed));
  const records = [...team.physics.obstacles.items.values()];
  layer.children.forEach((graphic, i) => {
    const item = records[i];
    assert.ok(Math.abs(graphic.x - (item.previous.x + item.position.x) / 2) < 0.001);
    assert.ok(Math.abs(graphic.y - (item.previous.y + item.position.y) / 2) < 0.001);
    const bounds = graphic.getLocalBounds();
    const expectedWidth = item.shape.kind === 'circle' ? 2 * item.shape.radius
      : Math.max(...item.shape.points.map((p) => p.x)) - Math.min(...item.shape.points.map((p) => p.x));
    assert.ok(Math.abs(bounds.width - expectedWidth) < 0.001);
  });
});


test('default bowl stage has no needles and completes effect, reroll and deployment loops', async (t) => {
  const c = structuredClone(physicsConfig);
  const { sim, events } = await simulation(t, c);
  assert.ok(sim.teams.every(team => [...team.physics.obstacles.items.values()].every(o => o.kind !== 'mountain')));
  advance(sim, 120);
  for (const team of sim.teams) {
    assert.ok(team.stats.effects > 20);
    assert.ok(team.stats.deployed > 10);
    assert.ok(team.stats.multipliers > 10);
  }
  assert.equal(events.filter(e => e.reason === 'out-of-bounds').length, 0);
});

test('balls roll down the shared bowl shoulders into effect sensors', (t) => {
  const p = world(t, config(), { ...layout, pins: [] });
  for (const [i, slot] of layout.upper.slots.entries()) {
    p.add(i + 1, { x: layout.upper.bounds.x + slot.x + (slot.width - slot.openingWidth) / 2 * 0.8,
      y: layout.upper.bounds.y + slot.y - slot.funnelHeight - 16 }, { x: 0, y: 0 });
    let found;
    for (let step = 0; step < 600 && !found; step++) found = p.step().find(a => a.marbleId === i + 1);
    assert.ok(found, slot.definition.id);
    assert.equal(found.stage, 'upper');
    p.remove(i + 1);
  }
});


test('mirrored cannons launch outward from their swinging muzzles at every phase', async (t) => {
  const { cannonPose } = await server.ssrLoadModule('/src/marble/cannon.ts');
  const c = config();
  const { sim } = await simulation(t, c);
  for (const phase of [0, 0.25, 0.5, 0.75]) {
    sim.time = phase * c.launch.upper.swingPeriod;
    const poses = [];
    for (const [index, name] of ['red', 'blue'].entries()) {
      const team = sim.teams[index];
      const pose = cannonPose(team.physics.layout.upper, name, sim.time, c);
      poses.push(pose);
      const id = sim.spawn(name);
      assert.ok(id);
      const actual = team.physics.pose(id);
      assert.ok(Math.hypot(actual.x - pose.muzzle.x, actual.y - pose.muzzle.y) < 0.001);
      const body = team.physics.world.bodies.getAll()[0];
      const velocity = body.linvel();
      assert.ok(name === 'red' ? velocity.x < 0 : velocity.x > 0);
      assert.ok(Math.abs(velocity.y / velocity.x - pose.direction.y / pose.direction.x) < 0.001);
      team.physics.remove(id); team.marbles.delete(id);
    }
    assert.ok(Math.abs(poses[0].muzzle.x + poses[1].muzzle.x - 540) < 0.001);
    assert.equal(poses[0].muzzle.y, poses[1].muzzle.y);
  }
});

test('all mirrored red holes preserve their original effect actions', async (t) => {
  const { sim } = await simulation(t);
  for (let index = 0; index < layout.upper.slots.length; index++) {
    const id = sim.spawn('red');
    assert.ok(id);
    dropInto(sim, id, 'upper', index);
    const team = sim.teams[0];
    assert.equal(team.marbles.get(id).effectId, layout.upper.slots[index].definition.action.effectId);
    team.physics.remove(id); team.marbles.delete(id);
  }
});


test('effect transfer stays visible without a body, follows the gap and resumes at the same endpoint', async (t) => {
  const { transferPose } = await server.ssrLoadModule('/src/marble/transfer.ts');
  const { sim, events } = await simulation(t);
  const team = sim.teams[0];
  const id = sim.spawn('red');
  dropInto(sim, id, 'upper', 0);
  const marble = team.marbles.get(id);
  const transfer = marble.transfer;
  assert.ok(transfer);
  const effectId = marble.effectId;
  assert.equal(team.physics.pose(id), undefined);
  assert.ok(layout.lower.bounds.y - (layout.upper.bounds.y + layout.upper.bounds.height) >= 2 * sim.config.marble.radius);
  assert.equal(transfer.points[1].y, transfer.points[2].y);
  assert.deepEqual(transfer.points.at(-1), team.physics.start('lower'));
  let traversedChannel = false;
  for (let step = 0; step < 600 && marble.transfer; step++) {
    const before = transferPose(transfer);
    sim.advance(sim.config.simulation.fixedTimeStep);
    const after = marble.transfer ? transferPose(transfer) : team.physics.pose(id);
    assert.ok(Math.hypot(after.x - before.x, after.y - before.y) < 5, 'continuous movement at handoff');
    if (marble.transfer) {
      assert.equal(team.physics.pose(id), undefined);
      if (Math.abs(after.y - transfer.points[1].y) < 0.001) traversedChannel = true;
    }
  }
  assert.ok(traversedChannel);
  assert.equal(marble.transfer, undefined);
  assert.equal(marble.waiting, false);
  assert.equal(marble.effectId, effectId);
  assert.ok(team.physics.pose(id));
  assert.equal(events.filter(e => e.type === 'effect').length, 1);
});

test('transfer waits visibly at an occupied entry and expires without an orphan body', async (t) => {
  const { transferPose } = await server.ssrLoadModule('/src/marble/transfer.ts');
  const c = config(); c.gravity.y = 0;
  const { sim, events } = await simulation(t, c);
  const team = sim.teams[0];
  const id = sim.spawn('red');
  dropInto(sim, id, 'upper', 0);
  const marble = team.marbles.get(id);
  const end = team.physics.start('lower');
  team.physics.add(999, end, { x: 0, y: 0 });
  advance(sim, 3);
  assert.ok(marble.transfer);
  assert.deepEqual(transferPose(marble.transfer), { ...end, angle: 0 });
  assert.equal(team.physics.pose(id), undefined);
  marble.age = c.rules.maxLifetime;
  sim.advance(c.simulation.fixedTimeStep);
  assert.equal(team.marbles.has(id), false);
  assert.equal(events.at(-1).reason, 'lifetime-limit');
  team.physics.remove(999);
  assert.equal(team.physics.world.bodies.len(), 0);
});


test('balls resting on either shallow trapezoid top roll into a hole without a launch impulse', (t) => {
  const p = world(t, config(), { ...layout, pins: [] });
  for (const slot of layout.upper.slots) {
    const shoulder = (slot.width - slot.openingWidth) / 2;
    const offset = shoulder * marbleConfig.upper.row.plateau / 2;
    for (const x of [offset, slot.width - offset]) {
      p.add(1, { x: layout.upper.bounds.x + slot.x + x,
        y: layout.upper.bounds.y + slot.y - slot.funnelHeight - physicsConfig.marble.radius - 0.5 }, { x: 0, y: 0 });
      let arrival;
      for (let step = 0; step < 1200 && !arrival; step++) arrival = p.step().find(a => a.marbleId === 1);
      assert.equal(arrival?.stage, 'upper', `shallow top stayed occupied: ${slot.definition.id}/${x}`);
      p.remove(1);
    }
  }
});


test('cannon-side ramps carry resting balls outward into holes on both teams', async (t) => {
  const { layoutForTeam } = await server.ssrLoadModule('/src/marble/layout.ts');
  for (const team of ['red', 'blue']) {
    const geometry = layoutForTeam(layout, team);
    const p = world(t, config(), { ...geometry, pins: [] });
    const points = geometry.upper.ramps[0];
    assert.ok(points);
    const x = geometry.upper.bounds.x + (team === 'blue' ? 25 : geometry.upper.bounds.width - 25);
    p.add(1, { x, y: geometry.upper.bounds.y + Math.min(...points.map(p => p.y)) - physicsConfig.marble.radius - 1 }, { x: 0, y: 0 });
    let arrival;
    for (let step = 0; step < 1200 && !arrival; step++) arrival = p.step().find(a => a.marbleId === 1);
    assert.equal(arrival?.stage, 'upper', team);
  }
});
