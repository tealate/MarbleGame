/** Speeds/distances use logical pixels, time uses seconds, angles use degrees.
 * +x points right, +y points down; launch angle 0 = right, 90 = down.
 * Geometry and slot actions belong in stage.ts. Edit these values and reload.
 */
export const physicsConfig = {
  simulation: {
    pixelsPerMeter: 100,
    fixedTimeStep: 1 / 120,
    maxSubsteps: 12,
    maxFrameDelta: 0.1,
    solverIterations: 8,
    maxCcdSubsteps: 4,
  },
  gravity: { x: 0, y: 700 },
  marble: {
    radius: 7,
    density: 1,
    restitution: 0.65,
    friction: 0.08,
    linearDamping: 0.08,
    angularDamping: 0.1,
    maxSpeed: 900,
    ccd: true,
  },
  materials: {
    wall: { restitution: 0.55, friction: 0.08 },
    pin: { restitution: 0.75, friction: 0.04 },
    funnel: { restitution: 0.2, friction: 0.04 },
  },
  launch: {
    upper: { speedMin: 260, speedMax: 460, angleMin: -65, angleMax: 20 },
    lower: { speedMin: 170, speedMax: 300, angleMin: 20, angleMax: 160 },
  },
  spawn: {
    automatic: true,
    interval: 1.4,
    batchSize: 1,
    maxPerTeam: 24,
    clearance: 1,
  },
  rules: {
    initialValue: 1,
    maxValue: 1_000_000,
    maxRerolls: 12,
    maxLifetime: 90,
  },
  debug: { showColliders: false, logTransitions: false },
};

export type PhysicsConfig = typeof physicsConfig;
