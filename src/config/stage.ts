/** 配置・表示の調整用設定。距離は論理px（画面拡大率とは別）。xは右、yは下が正。 */
export interface Point { x: number; y: number }
export interface Rect extends Point { width: number; height: number }

// Meaning is independent of the label/color; the simulation consumes these actions.
export type SlotAction =
  | { kind: 'effect'; effectId: string; target: 'lower-start' }
  | { kind: 'multiplier'; factor: number; target: 'lower-start' }
  | { kind: 'deploy'; target: 'battle' };

export interface SlotDefinition {
  id: string;
  label: string;
  color: number;
  action: SlotAction;
  /** Omit to share the remaining row width equally. */
  width?: number;
  height?: number;
  openingWidth?: number;
}

export interface SlotRowConfig {
  inset: number;
  gap: number;
  height: number;
  openingWidth: number;
  funnelHeight: number;
  /** Open = sensor-only band, without any solid plates or dividers. */
  entrance: 'open' | 'flat' | 'funnel' | 'crater' | 'bowl';
  bowlSegments?: number;
  /** Flat fraction of each shoulder; omit for the original rounded bowl. */
  plateau?: number;
  /** 上面の外端から斜面の始点までの下がり幅（px）。0で水平。 */
  plateauDrop?: number;
  /** Space reserved for the central cannon base before the first hole. */
  innerInset?: number;
  /** 大砲側の地面を穴側より持ち上げる高さ（px）。0で水平。 */
  innerSlopeHeight?: number;
  slots: SlotDefinition[];
}

export interface DeviceConfig extends Rect {
  wallThickness: number;
  title: string;
  /** Local to this device, not the whole team. */
  start: Point & { radius: number; label: string };
  row: SlotRowConfig;
}

export interface MarbleConfig {
  upper: DeviceConfig & {
    mountainOverlap: number;
    mountains: { id: string; x: number; y: number; width: number; height: number; topWidth: number }[];
  };
  lower: DeviceConfig & {
    // 下段の丸い障害物。描画と当たり判定は同じ設定を使用。
    pins: {
      radius: number;
      spacingX: number;
      spacingY: number;
      firstY: number;
      centerX: number;
      rowCounts: number[];
      /** null follows the inside bottom edge when the device size changes. */
      spawnY: number | null;
      spawnBottomInset: number;
      despawnY: number;
      /** Optional explicit device-local positions replace the generated rows. */
      positions?: Point[];
    };
  };
}

export const screenConfig = {
  width: 1080, // ゲーム画面全体の基準幅（px）。
  height: 1920, // ゲーム画面全体の基準高さ（px）。
  // 上からstream=配信用余白、battle=戦闘、marble=抽選装置。比率の合計で画面高を分配。
  ratios: { stream: 3, battle: 4, marble: 3 },
};

// id=内部の陣営識別子、label=表示名、color=球・砲身などの陣営色（0xRRGGBB）。
export const teams = [
  { id: 'red', label: '赤陣営', color: 0xf27786 },
  { id: 'blue', label: '青陣営', color: 0x70b5ff },
] as const;
export type Team = typeof teams[number];

export const palette = {
  background: 0x0d1522, // 全体の背景色。
  panel: 0x142033, // 戦闘領域・運搬通路の背景色。
  device: 0x0b1422, // 装置の内部背景・数字の縁取り色。
  wall: 0x62768e, // 外壁・穴ガイド・砲身の軸の色。
  line: 0x2a3b52, // 画面領域や左右陣営を区切る線の色。
  text: 0xeaf1fb, // 通常文字と球の数値の色。
  muted: 0x9aacc3, // VSなど控えめな文字の色。
  pin: 0xd8e4f4, // 下段の丸い障害物の色。
};

export const marblePresentation = {
  effectIconSize: 14, // アイコンの最大幅・高さ（px）。
  effectIconGap: 3, // リング外周から下側アイコンまでの間隔（px）。
  valueFontSize: 18, // 球の上の数値の文字サイズ（px）。
  slotFontSize: 24, // 倍率など穴のラベルの基本文字サイズ（px）。枠に収まるよう縮小される。
  valueGap: 2, // 球の上端と数値の下端の間隔（px）。
  rerollAfterimageCount: 9, // 再抽選の戻り経路に並べる球の残像数（正の整数）。
  rerollAfterimageOpacity: 0.85, // 残像の最大不透明度（0〜1）。大きいほど濃い。
};

// public/ 内の画像を BASE_URL 相対で指定。未設定・読込失敗時は色付き図形。
export const effectPresentation: Record<string, { color: number; ringWidth: number; icon?: string }> = {
  straight: { color: 0xffe84a, ringWidth: 3, icon: 'icons/straight.svg' },
  left: { color: 0x25e4ed, ringWidth: 3, icon: 'icons/left.svg' },
  right: { color: 0xf34de2, ringWidth: 3, icon: 'icons/right.svg' },
  heal: { color: 0x48ee68, ringWidth: 3, icon: 'icons/heal.svg' },
};
export const defaultEffectPresentation = { color: 0xffffff, ringWidth: 3 };

// 装置外周から通路中心までの距離と幅（px）。左右は陣営別に自動反転。
export const deployPresentation = { width: 24, outerOffset: 18, bottomOffset: 18, topOffset: 18 };

// 上段の表示設定。ゾーン名・色の変更は、内部の効果処理には影響しない。
export const upperPresentation = {
  // pivotX=中央側の装置端から回転軸まで、pivotY=装置上端から回転軸まで、length=砲身長、width=砲身幅、hubRadius=中央の台座半径（すべてpx）。
  cannon: { pivotX: 10, pivotY: 69, length: 38, width: 24, hubRadius: 26 },
  bandY: 48, // 効果名の帯の上端（上段装置内のy、px）。
  bandHeight: 42, // 帯の高さ（px）。
  labelSize: 25, // 効果名の基本文字サイズ（px）。ゾーン幅に合わせて縮小される。
  // label=表示名、effects=まとめて表示する効果ID、red/blue=陣営別の穴・文字色。
  zones: [
    { label: 'Missile', effects: ['straight'], red: 0xffe84a, blue: 0x983dff },
    { label: 'Shotgun', effects: ['left', 'right'], red: 0x9af526, blue: 0x25e4ed },
    { label: 'Gatling', effects: ['heal'], red: 0xff941f, blue: 0x2692ff },
  ],
};

// id=内部効果ID、label=元の短縮名、color=基本色、count=片側の穴数。
// countを減らすと同じ装置幅の中でガイドが広がる。並びは中央から外側へ。
export const effectGroups = [
  { id: 'straight', label: 'S', color: 0xffe84a, count: 3 },
  { id: 'left', label: 'L', color: 0x25e4ed, count: 1 },
  { id: 'right', label: 'R', color: 0xf34de2, count: 1 },
  { id: 'heal', label: 'H', color: 0x48ee68, count: 2 },
];
export function createEffectSlots(groups = effectGroups): SlotDefinition[] {
  return groups.flatMap(group => {
    if (!Number.isInteger(group.count) || group.count < 0) throw new Error(`Invalid effect count: ${group.id}`);
    return Array.from({ length: group.count }, (_, i) => ({
      id: `${group.id}-${i + 1}`, label: group.label, color: group.color,
      action: { kind: 'effect' as const, effectId: group.id, target: 'lower-start' as const },
    }));
  });
}

/** 左右共通の配置。赤側は上段だけ鏡写し。開発中は変更を保存すると再読み込みされる。 */
export const marbleConfig: MarbleConfig = {
  // 上段の効果抽選装置。x/yは陣営領域内の左上、width/heightは装置の幅/高さ（px）。
  upper: {
    x: 4, y: 60, width: 500, height: 130,
    title: '01  効果取得', // 装置名（設定検証時のエラー表示などに使用）。
    wallThickness: 5, // 外壁の厚み（px）。
    // 上段の基準点（装置内px）。x/yは配置検証用、radius/labelは目印のメタ情報。実際の発射口はupperPresentation.cannonから計算。
    start: { x: 58, y: 69, radius: 9, label: '生成地点' },
    mountainOverlap: 8, // 任意の移動山が穴列に重なってよい深さ（px）。
    // 旧仕様の移動山。physics.obstacles.mountains.enabledで有効化。
    // id=動作設定と対応するID、x/y=中心位置、width/height=幅/高さ、topWidth=上面幅（0なら三角形、単位px）。
    mountains: [
      { id: 'left', x: 250, y: 81.5, width: 18, height: 51, topWidth: 0 },
      { id: 'right', x: 250, y: 81.5, width: 18, height: 51, topWidth: 0 },
    ],
    row: {
      inset: 0, // 壁内側から穴列までの余白（px）。
      gap: 0, // 隣接する穴枠同士の間隔（px）。
      height: 24, // 穴の深さ・効果検出領域の基準高さ（px）。
      openingWidth: 24, // 球が入る開口幅（px）。球の直径より広くする。
      funnelHeight: 6, // ガイド上面と穴の入口との高低差（px）。
      entrance: 'bowl', // open=仕切りなし、flat=平面、funnel=斜面、crater=入口側が高い形、bowl=連続ガイド。
      bowlSegments: 8, // bowlの片側ガイドの分割数（2〜32）。
      plateau: 0.3, // ガイドの肩で緩い上面にする割合（0以上1未満）。省略すると丸い曲面。
      plateauDrop: 0.35, // 上面を穴側へ下げる高さ（px）。ごく浅い傾斜で静止しにくくする。0なら水平。
      innerSlopeHeight: 3, // 大砲側の地面の高低差（px）。外側の穴へ向かって下る。
      innerInset: 48, // 中央の砲台側に確保する穴のない余白（px）。
      slots: createEffectSlots(), // effectGroupsの個数・順序から穴を生成。
    },
  },
  // 下段装置。上下の隙間はlower.y - (upper.y + upper.height)。球の直径より広く保つ。
  lower: {
    // x/y=陣営領域内の左上、width/height=装置の幅/高さ（px）。
    x: 4, y: 210, width: 500, height: 310,
    title: '02  倍率変更・出撃抽選', // 装置名（検証・識別用）。
    wallThickness: 5, // 外壁の厚み（px）。
    // x/y=運搬の到着点・再抽選の戻り先（装置内px）。radius/labelは目印のメタ情報で、現在は丸印を描画しない。
    start: { x: 250, y: 26, radius: 10, label: 'ワープ先 / 再抽選' },
    // 下段の丸い障害物。描画と当たり判定は同じ設定を使用。
    pins: {
      radius: 7, // 障害物の半径（px）。
      spacingX: 76, // 各行の横方向の中心間隔（px）。大きいほど横に疎になる。
      spacingY: 38, // 行同士の縦方向の中心間隔（px）。自動追加の周期にも使用。
      firstY: 66, // 最初の行の中心y（装置内px）。
      centerX: 250, // 各行を中央揃えするx（装置内px）。
      rowCounts: [5, 6, 5, 6, 5, 6, 5], // 上から順に初期配置する行の個数。先頭2行の横配置を交互に追加する。
      spawnY: null, // 新しい行の中心y（装置内px）。nullなら底壁・半径・spawnBottomInsetから自動計算。
      spawnBottomInset: 1, // spawnYがnullのとき、底壁と障害物の間に空ける距離（px）。
      despawnY: 54, // 上昇した障害物を削除する境界y（装置内px）。
      // positions: [{ x: 40, y: 100 }], // 指定すると自動配置の代わりに装置内の任意座標へ配置。
    },
    row: {
      inset: 0, // 壁内側から結果列までの余白（px）。
      gap: 0, // 結果枠同士の間隔（px）。
      height: 42, // 結果を検出する帯の高さ（px）。
      openingWidth: 30, // 開口幅（px）。entranceがopenのときは枠幅全体を使うため無効。
      funnelHeight: 0, // ガイドの高低差（px）。openではガイドを作らない。
      entrance: 'open', // 当たり判定の仕切りを作らず、帯に入った球の中心位置で結果を判定。
      // id=穴の識別子、label=表示名、color=色、action=動作。
      // kind: multiplierはfactor倍してlower-startへ再抽選、deployはbattleへ出撃。
      // widthを省略すると均等幅。height/openingWidthを指定するとその穴だけ上書き。
      slots: [
        { id: 'double-left', label: '×2', color: 0xf3bb65, action: { kind: 'multiplier', factor: 2, target: 'lower-start' } },
        { id: 'deploy-left', label: '出撃', color: 0x83d5ad, action: { kind: 'deploy', target: 'battle' } },
        { id: 'triple', label: '×3', color: 0xb79af5, action: { kind: 'multiplier', factor: 3, target: 'lower-start' } },
        { id: 'deploy-right', label: '出撃', color: 0x83d5ad, action: { kind: 'deploy', target: 'battle' } },
        { id: 'double-right', label: '×2', color: 0xf3bb65, action: { kind: 'multiplier', factor: 2, target: 'lower-start' } },
      ],
    },
  },
};
