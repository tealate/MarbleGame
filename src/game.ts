import { Application, Container, Graphics } from 'pixi.js';
import { marbleConfig, palette, teams } from './config/stage';
import { createMarbleLayout, createScreenLayout } from './marble/layout';
import { createMarbleTeam, label } from './marble/render';

export function createGameScreen(app: Application): void {
  const { stream, battle, marble, teamWidth } = createScreenLayout();
  const background = new Graphics()
    .rect(stream.x, stream.y, stream.width, stream.height).fill(palette.background)
    .rect(battle.x, battle.y, battle.width, battle.height).fill(palette.panel)
    .rect(marble.x, marble.y, marble.width, marble.height).fill(palette.background);
  app.stage.addChild(background);

  app.stage.addChild(label('MARBLE / LIVE', stream.width / 2, 118, 50));
  app.stage.addChild(label('配信情報エリア', stream.width / 2, 268, 36));
  app.stage.addChild(label('コメント・お知らせ・ゲーム説明', stream.width / 2, 326, 25, palette.muted));
  app.stage.addChild(label('レイアウトプレビュー', stream.width / 2, 460, 22, palette.muted));

  const battleCenter = battle.y + battle.height / 2;
  app.stage.addChild(label('戦闘ゾーン', battle.width / 2, battle.y + 90, 32, palette.muted));
  app.stage.addChild(label('RED', battle.width * 0.25, battleCenter, 48, teams[0].color));
  app.stage.addChild(label('VS', battle.width / 2, battleCenter, 38, palette.muted));
  app.stage.addChild(label('BLUE', battle.width * 0.75, battleCenter, 48, teams[1].color));
  app.stage.addChild(label('出撃したマーブルをここへ反映', battle.width / 2, battleCenter + 85, 25, palette.muted));

  const marbleView = new Container({ label: 'marble-zone' });
  marbleView.position.set(marble.x, marble.y);
  const layout = createMarbleLayout(marbleConfig);
  teams.forEach((team, index) => {
    const view = createMarbleTeam(layout, team, teamWidth, marble.height);
    view.x = index * teamWidth;
    marbleView.addChild(view);
  });
  app.stage.addChild(marbleView);
  app.stage.addChild(new Graphics()
    .moveTo(0, battle.y).lineTo(battle.width, battle.y)
    .moveTo(0, marble.y).lineTo(marble.width, marble.y)
    .moveTo(teamWidth, marble.y).lineTo(teamWidth, marble.y + marble.height)
    .stroke({ width: 2, color: palette.line }));
}
