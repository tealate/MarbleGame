import { Application, Container, Graphics } from 'pixi.js';
import { marbleConfig, palette, teams, upperPresentation } from './config/stage';
import { createMarbleLayout, createScreenLayout } from './marble/layout';
import { createMarbleRenderer, createMarbleTeam, label } from './marble/render';
import { MarbleSimulation, type MarbleEvent } from './marble/simulation';
import { physicsConfig } from './config/physics';

export async function createGameScreen(app: Application) {
  const layout = createMarbleLayout(marbleConfig);
  let lastEvent = '待機中';
  const simulation = await MarbleSimulation.create(layout, physicsConfig, (event: MarbleEvent) => {
    const m = event.marble;
    lastEvent = `${m.team} #${m.id} ${event.type} 値=${m.value} 効果=${m.effectId ?? '-'}${event.reason ? ` (${event.reason})` : ''}`;
    if (event.type === 'deploy' || event.type === 'cannon-arrival' || event.type === 'retire' || physicsConfig.debug.logTransitions) {
      console.info(`[marble:${event.type}]`, { team: m.team, id: m.id, value: m.value,
        effectId: m.effectId, rerolls: m.rerolls, reason: event.reason });
    }
  });
  const { stream, battle, marble, teamWidth } = createScreenLayout();
  const background = new Graphics()
    .rect(stream.x, stream.y, stream.width, stream.height).fill(palette.background)
    .rect(battle.x, battle.y, battle.width, battle.height).fill(palette.panel)
    .rect(marble.x, marble.y, marble.width, marble.height).fill(palette.background);
  app.stage.addChild(background);

  // Keep the reserved broadcast area quiet until it has actual content.
  app.stage.addChild(new Graphics()
    .circle(stream.width / 2 - 24, stream.height / 2, 12).fill(teams[0].color)
    .circle(stream.width / 2 + 24, stream.height / 2, 12).fill(teams[1].color));

  const battleCenter = battle.y + battle.height / 2;
  app.stage.addChild(new Graphics()
    .circle(battle.width * 0.25, battleCenter, 24).fill(teams[0].color)
    .circle(battle.width * 0.75, battleCenter, 24).fill(teams[1].color));
  app.stage.addChild(label('VS', battle.width / 2, battleCenter, 38, palette.muted));

  const marbleView = new Container({ label: 'marble-zone' });
  marbleView.position.set(marble.x, marble.y);
  const renderers: ReturnType<typeof createMarbleRenderer>[] = [];
  teams.forEach((team, index) => {
    const view = createMarbleTeam(simulation.teams[index].physics.layout, team, teamWidth, marble.height, simulation.config.obstacles.pinFlow.enabled);
    view.x = index * teamWidth;
    marbleView.addChild(view);
    renderers.push(createMarbleRenderer(view, team, simulation.config));
  });
  // One split central housing covers both barrel pivots symmetrically.
  const housing = new Graphics();
  const centerY = layout.upper.bounds.y + upperPresentation.cannon.pivotY;
  teams.forEach((team, i) => {
    const points = [{ x: teamWidth, y: centerY }];
    for (let step = 0; step <= 24; step++) {
      const angle = -Math.PI / 2 + step / 24 * Math.PI;
      points.push({ x: teamWidth + (i === 0 ? -1 : 1) * Math.cos(angle) * upperPresentation.cannon.hubRadius,
        y: centerY + Math.sin(angle) * upperPresentation.cannon.hubRadius });
    }
    housing.poly(points).fill(team.color);
  });
  marbleView.addChild(housing);
  app.stage.addChild(marbleView);
  app.stage.addChild(new Graphics()
    .moveTo(0, battle.y).lineTo(battle.width, battle.y)
    .moveTo(0, marble.y).lineTo(marble.width, marble.y)
    .moveTo(teamWidth, marble.y + layout.lower.bounds.y).lineTo(teamWidth, marble.y + marble.height)
    .stroke({ width: 2, color: palette.line }));

  // Opt-in diagnostics keep the normal game layout unchanged.
  let paused = false;
  let showColliders = physicsConfig.debug.showColliders;
  let panel: HTMLDivElement | undefined;
  let status: HTMLPreElement | undefined;
  if (new URLSearchParams(window.location.search).has('debug')) {
    panel = document.createElement('div');
    panel.className = 'debug-panel';
    const button = (text: string, action: () => void) => {
      const element = document.createElement('button');
      element.textContent = text;
      element.addEventListener('click', action);
      panel!.appendChild(element);
      return element;
    };
    button('赤を生成', () => simulation.spawn('red'));
    button('青を生成', () => simulation.spawn('blue'));
    const pauseButton = button('一時停止', () => {
      paused = !paused;
      simulation.resetClock();
      pauseButton.textContent = paused ? '再開' : '一時停止';
    });
    button('1ステップ', () => { if (paused) simulation.advance(simulation.config.simulation.fixedTimeStep); });
    button('当たり判定', () => { showColliders = !showColliders; });
    status = document.createElement('pre');
    panel.appendChild(status);
    document.body.appendChild(panel);
  }
  return {
    simulation,
    update(seconds: number) {
      if (!paused) simulation.advance(seconds);
      renderers.forEach((render, i) => render(simulation.teams[i], paused ? 1 : simulation.alpha, showColliders, simulation.time));
      if (status) {
        const text = simulation.teams.map((team, i) => {
          const s = team.stats;
          const obstacles = team.physics.obstacles;
          return `${teams[i].label} 球=${team.marbles.size} 生成=${s.spawned} 効果=${s.effects} 倍率=${s.multipliers} 出撃=${s.deployed} 回収=${s.retired}`
            + ` 障害物=${obstacles.items.size} 追加=${obstacles.stats.created} 削除=${obstacles.stats.removed}`;
        }).join('\n') + `\n${lastEvent}`;
        if (status.textContent !== text) status.textContent = text;
      }
    },
    dispose() { panel?.remove(); simulation.dispose(); },
  };
}
