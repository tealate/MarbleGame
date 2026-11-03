import { Application } from 'pixi.js';
import { createGameScreen } from './game';
import { fitGameToWindow, GAME_HEIGHT, GAME_WIDTH } from './screen';
import './style.css';

async function start(): Promise<void> {
  const app = new Application();
  await app.init({
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    resolution: 1,
    background: 0x101722,
    antialias: true,
  });
  // This milestone is a static layout: render only on load and resize.
  app.stop();

  document.querySelector<HTMLElement>('#game')!.appendChild(app.canvas);
  createGameScreen(app);
  fitGameToWindow(app);
  app.render();
  window.addEventListener('resize', () => {
    fitGameToWindow(app);
    app.render();
  });
}

void start().catch((error: unknown) => {
  console.error('Failed to start Marble Game:', error);
});
