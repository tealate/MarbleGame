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
  app.stop();

  const root = document.querySelector<HTMLElement>('#game')!;
  root.textContent = '物理エンジンを読み込み中…';
  let game: Awaited<ReturnType<typeof createGameScreen>>;
  try {
    game = await createGameScreen(app);
  } catch (error) {
    app.destroy(true, { children: true });
    throw error;
  }
  root.replaceChildren(app.canvas);
  fitGameToWindow(app);
  const resize = () => {
    fitGameToWindow(app);
    app.render();
  };
  const visibility = () => {
    game.simulation.resetClock();
    if (document.hidden) app.stop();
    else app.start();
  };
  app.ticker.add((ticker) => game.update(ticker.elapsedMS / 1000));
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', visibility);
  visibility();
  const dispose = () => {
    window.removeEventListener('resize', resize);
    document.removeEventListener('visibilitychange', visibility);
    game.dispose();
    app.destroy(true, { children: true });
  };
  import.meta.hot?.dispose(dispose);
}

void start().catch((error: unknown) => {
  console.error('Failed to start Marble Game:', error);
  const root = document.querySelector<HTMLElement>('#game');
  if (root) root.textContent = '起動できませんでした。設定値とブラウザのコンソールを確認してください。';
});
