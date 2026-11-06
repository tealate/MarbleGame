export type DefenseMaterial = 'wood' | 'concrete' | 'glass';
export interface MaterialStyle {
  label: string;
  maxHp: number;
  repair: number;
  color: number;
  detailColor: number;
  alpha: number;
  pattern: 'grain' | 'blocks' | 'shine';
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
    wood: { label: '木', maxHp: 4, repair: 2, color: 0xb78049, detailColor: 0x59391f, alpha: 1, pattern: 'grain' },
    concrete: { label: 'コンクリート', maxHp: 8, repair: 3, color: 0x9babb7, detailColor: 0x4d5965, alpha: 1, pattern: 'blocks' },
    glass: { label: 'ガラス', maxHp: 2, repair: 1, color: 0x79dcf1, detailColor: 0xe5fbff, alpha: 0.55, pattern: 'shine' },
  } satisfies Record<DefenseMaterial, MaterialStyle>,
  defense: {
    speed: 145, radius: 5,
    interval: 0.7, // デバッグ連射の間隔。単発ボタンには適用しない。
    direction: 'random' as 'random' | 'fixed',
    angleDegrees: { red: 0, blue: 180 }, // 画面の右=0、下=90。
  },
  attack: { speed: 360, radius: 5, damage: 1, angleOffsetDegrees: 0 },
};
