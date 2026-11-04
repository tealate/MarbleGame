import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer } from 'vite';

// Reuse Vite's TypeScript loader. No server is opened and no test dependency is needed.
const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false },
  optimizeDeps: { noDiscovery: true, entries: [] }, appType: 'custom' });
after(() => server.close());
const { marbleConfig, teams } = await server.ssrLoadModule('/src/config/stage.ts');
const { createScreenLayout, createMarbleLayout } = await server.ssrLoadModule('/src/marble/layout.ts');

test('1080×1920 is divided 3:4:3 with two 540×576 team areas', () => {
  const scene = createScreenLayout();
  assert.deepEqual(scene.stream, { x: 0, y: 0, width: 1080, height: 576 });
  assert.deepEqual(scene.battle, { x: 0, y: 576, width: 1080, height: 768 });
  assert.deepEqual(scene.marble, { x: 0, y: 1344, width: 1080, height: 576 });
  assert.equal(scene.teamWidth, 540);
  assert.deepEqual(teams.map((team) => team.id), ['red', 'blue']);
});

test('default devices, starts, pins and slots fit inside their local areas', () => {
  const layout = createMarbleLayout(marbleConfig);
  assert.equal(layout.upper.slots.length, 7);
  assert.equal(layout.lower.slots.length, 5);
  assert.equal(layout.pins.length, 67);
  assert.equal(540 - layout.lower.bounds.width, 8, 'central gap is 8px');
  assert.equal(layout.lower.bounds.y + layout.lower.bounds.height, 576, 'device reaches screen bottom');
  assert.equal(layout.pinFlow.spawnY + layout.pinFlow.radius, layout.lower.bounds.height - 6);
  for (const device of [layout.upper, layout.lower]) {
    const { bounds, start, wallThickness: wall } = device;
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 540);
    assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= 576);
    assert.ok(start.x - start.radius > wall && start.x + start.radius < bounds.width - wall);
    assert.ok(start.y - start.radius > wall);
    for (const slot of device.slots) {
      assert.ok(slot.x >= wall && slot.x + slot.width <= bounds.width - wall);
      assert.ok(slot.y - slot.funnelHeight > start.y + start.radius);
      assert.equal(slot.y + slot.height, bounds.height - wall);
      assert.ok(slot.openingWidth <= slot.width);
    }
  }
  assert.ok(layout.upper.bounds.y + layout.upper.bounds.height < layout.lower.bounds.y);
  for (const pin of layout.pins) {
    assert.ok(pin.x - pin.radius > layout.lower.wallThickness);
    assert.ok(pin.x + pin.radius < layout.lower.bounds.width - layout.lower.wallThickness);
    assert.ok(pin.y - pin.radius > layout.lower.start.y + layout.lower.start.radius);
    assert.ok(pin.y + pin.radius < layout.lower.bounds.height - layout.lower.wallThickness);
  }
});

test('effects and multipliers target only lower-start; deployment targets battle', () => {
  const layout = createMarbleLayout(marbleConfig);
  const slots = [...layout.upper.slots, ...layout.lower.slots];
  assert.equal(new Set(slots.map((slot) => slot.definition.id)).size, slots.length);
  for (const slot of slots) {
    const action = slot.definition.action;
    assert.equal(action.target, action.kind === 'deploy' ? 'battle' : 'lower-start');
  }
});

test('dimensions, openings, slots, starts and pin settings change generated geometry', () => {
  const config = structuredClone(marbleConfig);
  const original = JSON.stringify(marbleConfig);
  config.upper.width = 480;
  config.upper.height = 196;
  config.upper.wallThickness = 8;
  config.upper.start.x = 95;
  config.upper.row.slots[0].width = 80;
  config.upper.row.slots[0].height = 30;
  config.upper.row.slots[0].openingWidth = 18;
  config.upper.row.slots.push({ id: 'new-effect', label: '新効果', color: 0xffffff,
    action: { kind: 'effect', effectId: 'new-effect', target: 'lower-start' } });
  config.lower.start.x = 230;
  Object.assign(config.lower.pins, { radius: 8, centerX: 250, spacingX: 60, spacingY: 28, firstY: 100, rowCounts: [3, 4] });
  config.lower.row.entrance = 'flat';
  config.lower.row.openingWidth = 16;
  const layout = createMarbleLayout(config);
  assert.equal(layout.upper.bounds.width, 480);
  assert.equal(layout.upper.walls[0].height, 8);
  assert.equal(layout.upper.start.x, 95);
  assert.equal(layout.upper.slots.length, 8);
  assert.equal(layout.upper.slots[0].width, 80);
  assert.equal(layout.upper.slots[0].height, 30);
  assert.equal(layout.upper.slots[0].openingWidth, 18);
  assert.equal(layout.upper.slots[0].y, 158);
  assert.equal(layout.lower.start.x, 230);
  assert.equal(layout.pins.length, 7);
  assert.deepEqual(layout.pins[0], { x: 190, y: 100, radius: 8 });
  assert.deepEqual(layout.pins[3], { x: 160, y: 128, radius: 8 });
  assert.ok(layout.lower.slots.every((slot) => slot.openingWidth === 16));
  assert.equal(JSON.stringify(marbleConfig), original);
});

test('explicit pin positions override rows and remain JSON serializable', () => {
  const config = structuredClone(marbleConfig);
  config.lower.pins.positions = [{ x: 40, y: 100 }, { x: 90, y: 140 }];
  const layout = createMarbleLayout(config);
  assert.deepEqual(layout.pins, [{ x: 40, y: 100, radius: 5 }, { x: 90, y: 140, radius: 5 }]);
  assert.deepEqual(JSON.parse(JSON.stringify(layout)), layout);
});

test('impossible opening widths and duplicate slot IDs fail with actionable errors', () => {
  const config = structuredClone(marbleConfig);
  config.lower.row.entrance = 'flat';
  config.lower.row.openingWidth = 600;
  assert.throws(() => createMarbleLayout(config), /Invalid slot.*double-left/);
  config.lower.row.openingWidth = 30;
  config.lower.row.slots[1].id = config.lower.row.slots[0].id;
  assert.throws(() => createMarbleLayout(config), /duplicate ID/);
});

test('open result bands cover the floor with no plates, even after resizing', () => {
  const config = structuredClone(marbleConfig);
  config.lower.height += 20;
  config.lower.width -= 20;
  config.lower.pins.radius = 8;
  config.lower.pins.spawnBottomInset = 2;
  const layout = createMarbleLayout(config);
  const { lower } = layout;
  assert.equal(lower.walls.length, 4, 'only outer walls remain');
  assert.equal(layout.pinFlow.spawnY, lower.bounds.height - lower.wallThickness - 8 - 2);
  assert.equal(lower.slots[0].x, lower.wallThickness);
  lower.slots.forEach((slot, i) => {
    assert.deepEqual(slot.solids, []);
    assert.equal(slot.sensor.width, slot.width);
    assert.equal(slot.openingWidth, slot.width);
    if (i) assert.ok(Math.abs(lower.slots[i - 1].x + lower.slots[i - 1].width - slot.x) < 1e-8);
  });
  const last = lower.slots.at(-1);
  assert.ok(Math.abs(last.x + last.width - (lower.bounds.width - lower.wallThickness)) < 1e-8);
});


test('bowl row reserves the cannon base and meets the outer wall and staggered pins fill the edges', () => {
  const l = createMarbleLayout(marbleConfig);
  assert.equal(marbleConfig.upper.row.entrance, 'bowl');
  assert.equal(l.upper.slots[0].x, l.upper.wallThickness + marbleConfig.upper.row.innerInset);
  const last = l.upper.slots.at(-1);
  assert.ok(Math.abs(last.x + last.width - (l.upper.bounds.width - l.upper.wallThickness)) < 1e-8);
  for (const slot of l.upper.slots) assert.equal(slot.solids[0][1].y, slot.solids[0][0].y);
  for (const m of l.mountains) {
    const overlap = m.position.y + m.height / 2 - l.upper.slots[0].y;
    assert.equal(overlap, 6);
    assert.ok(overlap <= l.mountainOverlap);
  }
  const xs = l.pins.map(p => p.x);
  assert.equal(Math.min(...xs), 35);
  assert.equal(Math.max(...xs), 497);
  assert.ok(Math.min(...xs) - l.pinFlow.radius - l.lower.wallThickness > 14);
});


test('effect groups generate editable S3 L1 R1 H2 counts with unique slot IDs', async () => {
  const { createEffectSlots, effectGroups } = await server.ssrLoadModule('/src/config/stage.ts');
  const slots = createEffectSlots();
  assert.equal(slots.map(s => s.label).join(''), 'SSSLRHH');
  assert.equal(new Set(slots.map(s => s.id)).size, 7);
  assert.deepEqual(effectGroups.map(g => g.color), [0xffe84a, 0x25e4ed, 0xf34de2, 0x48ee68]);
  const groups = structuredClone(effectGroups); groups[0].count = 4;
  assert.equal(createEffectSlots(groups).length, 8);
  const modified = structuredClone(marbleConfig);
  modified.upper.row.slots = createEffectSlots(groups);
  modified.upper.row.funnelHeight = 4;
  modified.upper.row.bowlSegments = 6;
  const result = createMarbleLayout(modified);
  assert.equal(result.upper.slots[0].solids.length, 12);
  assert.equal(result.upper.slots[0].outerEdgeY, -4);
});
