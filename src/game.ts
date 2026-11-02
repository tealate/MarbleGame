import { Application, Graphics, Text } from 'pixi.js';
import { GAME_HEIGHT, GAME_WIDTH } from './screen';

const COLORS = {
  background: 0x101722,
  border: 0x66748b,
  zone: 0x1c293a,
  text: 0xe9eff8,
  red: 0xe65363,
  blue: 0x4c9bea,
};

function label(text: string, x: number, y: number, color: number, size: number): Text {
  const item = new Text({
    text,
    style: {
      fontFamily: 'Arial, sans-serif',
      fontSize: size,
      fontWeight: 'bold',
      fill: color,
    },
  });
  item.anchor.set(0.5);
  item.position.set(x, y);
  return item;
}

export function createGameScreen(app: Application): void {
  const graphics = new Graphics()
    .rect(0, 0, GAME_WIDTH, GAME_HEIGHT)
    .fill(COLORS.background)
    .rect(24, 24, GAME_WIDTH - 48, GAME_HEIGHT - 48)
    .stroke({ width: 8, color: COLORS.border })
    .roundRect(120, 490, 840, 860, 48)
    .fill(COLORS.zone)
    .stroke({ width: 6, color: COLORS.border })
    .roundRect(90, 1540, 410, 230, 32)
    .fill({ color: COLORS.red, alpha: 0.18 })
    .stroke({ width: 6, color: COLORS.red })
    .roundRect(580, 1540, 410, 230, 32)
    .fill({ color: COLORS.blue, alpha: 0.18 })
    .stroke({ width: 6, color: COLORS.blue });

  app.stage.addChild(graphics);
  app.stage.addChild(label('MARBLE ZONE', 540, 920, COLORS.text, 88));
  app.stage.addChild(label('RED CANNON', 295, 1655, COLORS.red, 51));
  app.stage.addChild(label('BLUE CANNON', 785, 1655, COLORS.blue, 51));
}
