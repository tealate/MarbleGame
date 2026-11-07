import type { AttackEffect, DefenseMaterial } from './effects';
export type { DefenseMaterial } from './effects';
export interface MaterialStyle {
  label: string;
  maxHp: number;
  repair: number;
  color: number;
  detailColor: number;
  alpha: number;
  pattern: 'grain' | 'blocks' | 'shine' | 'soil';
}

/** 戦闘の仮設定。px・秒・度。大砲の位置とサイズは stage.ts の battlePresentation。 */
export const battleConfig = {
  // 配列の要素数が建築可能な層数。昇順・壁同士が重ならない間隔で指定。
  radii: [60, 100, 140, 180],
  segments: 36,
  wallThickness: 14,
  gapDegrees: 1.4,
  maxRadius: 200, // 壁の外端もこの半径以内。
  rotationDegreesPerSecond: { red: 12, blue: -12 }, // 正=時計回り。陣営内の全リングで共通。
  materials: {
    dirt: { label: '土', maxHp: 3, repair: 2, color: 0xc08b65, detailColor: 0x68452e, alpha: 1, pattern: 'soil' },
    wood: { label: '木', maxHp: 4, repair: 2, color: 0xb78049, detailColor: 0x59391f, alpha: 1, pattern: 'grain' },
    concrete: { label: 'コンクリート', maxHp: 8, repair: 3, color: 0x9babb7, detailColor: 0x4d5965, alpha: 1, pattern: 'blocks' },
    glass: { label: 'ガラス', maxHp: 2, repair: 1, color: 0x79dcf1, detailColor: 0xe5fbff, alpha: 0.55, pattern: 'shine' },
  } satisfies Record<DefenseMaterial, MaterialStyle>,
  defense: {
    speed: 145, radius: 5,
    interval: 0.7, // デバッグ連射の間隔。単発ボタンには適用しない。
  },
  cannon: {
    // 基準角度は stage.ts の battlePresentation.cannons.angle。位相は度。
    swing: {
      red: { amplitudeDegrees: 30, period: 4, phaseDegrees: 0 },
      blue: { amplitudeDegrees: 30, period: 4, phaseDegrees: 180 },
    },
    muzzleClearance: 1,
  },
  attack: {
    speed: 360, radius: 5,
    effects: {
      axe: { damage: 1, bonusMaterial: 'wood', bonusMultiplier: 3 },
      pickaxe: { damage: 1, bonusMaterial: 'concrete', bonusMultiplier: 4 },
      shovel: { damage: 1, bonusMaterial: 'dirt', bonusMultiplier: 3 },
      shell: { damage: 4, bonusMaterial: null, bonusMultiplier: 1 },
    } satisfies Record<AttackEffect, { damage: number; bonusMaterial: DefenseMaterial | null; bonusMultiplier: number }>,
    // 直撃壁は effects.shell.damage のみ、他の壁は範囲ダメージ（重複なし）。
    explosion: { radius: 64, damage: 2, duration: 0.45, color: 0xffb34d },
  },
};
