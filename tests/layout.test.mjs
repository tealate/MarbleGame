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
  assert.equal(layout.upper.slots.length, 4);
  assert.equal(layout.lower.slots.length, 5);
  assert.equal(layout.pins.length, 16);
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
    assert.ok(pin.y + pin.radius < Math.min(...layout.lower.slots.map((s) => s.y - s.funnelHeight)));
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
  Object.assign(config.lower.pins, { radius: 8, spacingX: 60, spacingY: 28, firstY: 100, rowCounts: [3, 4] });
  config.lower.row.openingWidth = 16;
  const layout = createMarbleLayout(config);
  assert.equal(layout.upper.bounds.width, 480);
  assert.equal(layout.upper.walls[0].height, 8);
  assert.equal(layout.upper.start.x, 95);
  assert.equal(layout.upper.slots.length, 5);
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
  config.lower.row.openingWidth = 600;
  assert.throws(() => createMarbleLayout(config), /Invalid slot.*double-left/);
  config.lower.row.openingWidth = 30;
  config.lower.row.slots[1].id = config.lower.row.slots[0].id;
  assert.throws(() => createMarbleLayout(config), /duplicate ID/);
});
