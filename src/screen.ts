import type { Application } from 'pixi.js';

export const GAME_WIDTH = 1080;
export const GAME_HEIGHT = 1920;

export function fitGameToWindow(app: Application): void {
  const fitScale = Math.min(
    window.innerWidth / GAME_WIDTH,
    window.innerHeight / GAME_HEIGHT,
  );

  // Keep the internal coordinate system fixed while avoiding oversized framebuffers.
  const renderScale = Math.min(fitScale, 1);
  const renderWidth = Math.max(1, Math.round(GAME_WIDTH * renderScale));
  const renderHeight = Math.max(1, Math.round(GAME_HEIGHT * renderScale));

  app.renderer.resize(renderWidth, renderHeight);
  app.stage.scale.set(renderWidth / GAME_WIDTH, renderHeight / GAME_HEIGHT);

  app.canvas.style.width = `${GAME_WIDTH * fitScale}px`;
  app.canvas.style.height = `${GAME_HEIGHT * fitScale}px`;
}
