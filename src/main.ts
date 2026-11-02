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
  app.ticker.maxFPS = 60;

  document.querySelector<HTMLElement>('#game')!.appendChild(app.canvas);
  createGameScreen(app);
  fitGameToWindow(app);
  window.addEventListener('resize', () => fitGameToWindow(app));
}

void start().catch((error: unknown) => {
  console.error('Failed to start Marble Game:', error);
});
