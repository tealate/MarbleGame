import { battleConfig, type DefenseMaterial } from '../config/battle';
import { BattleSimulation } from './simulation';

export function addBattleDebug(panel: HTMLElement, battle: BattleSimulation): () => void {
  const controls = document.createElement('div');
  controls.className = 'battle-debug';
  const title = document.createElement('div');
  title.textContent = '戦闘：素材を選んで防御／選択陣営から相手へ攻撃';
  controls.appendChild(title);
  const select = (name: string, options: [string, string][], change: (value: string) => void) => {
    const field = document.createElement('label');
    field.textContent = `${name} `;
    const input = document.createElement('select');
    options.forEach(([value, text]) => { const option = document.createElement('option'); option.value = value; option.textContent = text; input.appendChild(option); });
    input.addEventListener('change', () => change(input.value));
    field.appendChild(input);
    controls.appendChild(field);
    return input;
  };
  select('陣営', [['red', '赤'], ['blue', '青']], value => { battle.selectedTeam = value as 'red' | 'blue'; });
  select('素材', Object.entries(battleConfig.materials).map(([id, m]) => [id, m.label]), value => { battle.selectedMaterial = value as DefenseMaterial; });
  const direction = select('方向', [['random', 'ランダム'], ['fixed', '固定角度']], value => { battle.direction = value as 'random' | 'fixed'; });
  direction.value = battle.direction;
  const angleLabel = document.createElement('label');
  angleLabel.textContent = '角度° ';
  const angle = document.createElement('input');
  angle.type = 'number';
  angle.placeholder = '設定値';
  angle.title = '固定方向：右0°、下90°、左180°。空欄は陣営別設定値。';
  angle.addEventListener('input', () => { battle.angleDegrees = angle.value === '' || !Number.isFinite(angle.valueAsNumber) ? null : angle.valueAsNumber; });
  angleLabel.appendChild(angle);
  controls.appendChild(angleLabel);
  const button = (text: string, action: () => void) => {
    const input = document.createElement('button');
    input.textContent = text;
    input.addEventListener('click', action);
    controls.appendChild(input);
  };
  controls.appendChild(document.createElement('br'));
  button('防御弾を発射', () => battle.fireDefense());
  const autoLabel = document.createElement('label');
  const auto = document.createElement('input');
  auto.type = 'checkbox';
  auto.addEventListener('change', () => { battle.autoFire = auto.checked; });
  autoLabel.append(auto, ' 防御連射');
  controls.appendChild(autoLabel);
  button('通常攻撃', () => battle.fireAttack());
  button('防壁リセット', () => { battle.reset(); auto.checked = false; });
  button('防壁を空にする', () => { battle.reset(true); auto.checked = false; });
  const status = document.createElement('pre');
  controls.appendChild(status);
  panel.appendChild(controls);
  return () => {
    status.textContent = battle.teams.map(team => {
      const s = team.stats;
      return `${team.id === 'red' ? '赤' : '青'} 壁=${team.walls.flat().filter(Boolean).length} 建築=${s.built} 補強=${s.repaired} 無駄撃ち=${s.wasted} 被弾=${s.hits} 破壊=${s.destroyed} 運搬到着=${team.arrivals}`;
    }).join('\n');
  };
}
