/** 調整用の物理・進行設定。距離は論理px、速度はpx/秒、時間は秒、角度は度。
 * 座標は右が+x、下が+y。見た目・配置・穴の効果は stage.ts で設定する。
 */
export const physicsConfig = {
  // 物理計算の精度と負荷。通常の見た目調整では変更不要。
  simulation: {
    // 論理pxを物理エンジンの1mに換算する倍率。
    pixelsPerMeter: 100,
    // 物理を1回進める秒数。小さいほど細かく計算するが負荷が増える。
    fixedTimeStep: 1 / 120,
    // 描画1フレームで実行する物理計算の上限回数。
    maxSubsteps: 12,
    // 1フレームで受け付ける経過秒数の上限。長い停止後の追い付き処理を抑える。
    maxFrameDelta: 0.1,
    // 衝突解決の反復回数。増やすと接触が安定する代わりに負荷が増える。
    solverIterations: 8,
    // 高速移動時のすり抜け対策で使う計算の上限回数。
    maxCcdSubsteps: 4,
  },
  // 重力加速度（px/秒²）。xは横方向、yを小さくすると落下の加速が弱くなる。
  gravity: { x: 0, y: 560 },
  // 球の大きさ・跳ね方・速度制限。
  marble: {
    // 球の半径（px）。穴の幅と運搬通路は直径より広くする。
    radius: 8,
    // 球の密度。半径と合わせて物理的な質量が決まる。
    density: 1,
    // 球の反発係数（0〜1）。大きいほどよく跳ねる。
    restitution: 0.8,
    // 球の摩擦係数（0以上）。大きいほど接触面で滑りにくい。
    friction: 0.08,
    // 移動速度の減衰。大きいほど移動が早く弱まる。
    linearDamping: 0.08,
    // 回転速度の減衰。大きいほど回転が早く止まる。
    angularDamping: 0.1,
    // 全方向を合わせた速度上限（px/秒）。
    maxSpeed: 900,
    // 下向きだけの速度上限（px/秒）。横移動・上向きの跳ね返りは制限しない。
    maxFallSpeed: 160,
    // trueで高速移動時の連続衝突判定を有効にし、すり抜けを防ぐ。
    ccd: true,
  },
  // 接触相手ごとの材質。restitution=反発（0〜1）、friction=摩擦（0以上）。球との平均で衝突を計算。
  materials: {
    // 装置の外壁の材質。
    wall: { restitution: 0.55, friction: 0.08 },
    // 下段の丸い障害物の材質。
    pin: { restitution: 0.75, friction: 0.04 },
    // 穴の周囲のガイド地形の材質。
    funnel: { restitution: 0.2, friction: 0.04 },
    // 任意で有効にできる移動山の材質。
    mountain: { restitution: 0.7, friction: 0.04 },
  },
  // 動く障害物の設定。形と初期配置は stage.ts 側。
  obstacles: {
    // 旧仕様の左右移動する山。現在の通常レイアウトでは無効。
    mountains: {
      // trueにすると移動山を生成する。
      enabled: false,
      // idはstage.upper.mountainsと対応。amplitude=横移動の片振幅(px)、period=往復秒数、phase=開始位相(1で1周期)。
      motions: [
        { id: 'left', amplitude: 245, period: 4.8, phase: 0.75 },
        { id: 'right', amplitude: 245, period: 4.8, phase: 0.25 },
      ],
    },
    // 下段の障害物を下から上へ流す設定。
    pinFlow: {
      // trueで上昇・追加・削除する。falseでは初期配置の固定障害物になる。
      enabled: true,
      // 障害物の上昇速度（px/秒）。
      speed: 22,
      // 行を追加する間隔（秒）。nullならstage.lower.pins.spacingY / speedで自動計算。
      spawnInterval: null as number | null,
      // 流れる障害物の同時存在数の上限。
      maxPins: 96,
    },
  },
  // 発射速度は範囲内でランダム。角度は0=右、90=下、負値=上向き。
  launch: {
    // 上段：speedMin/Max=発射速度の範囲(px/秒)。angleMin/Max=外向き水平からの首振り角度。swingPeriod=往復秒数。赤側は左右反転。
    upper: { speedMin: 220, speedMax: 380, angleMin: -25, angleMax: 20, swingPeriod: 3.6 },
    // 下段：speedMin/Max=到着・再抽選時の速度範囲(px/秒)。angleMin/Max=ランダムに選ぶ発射角度の範囲。
    lower: { speedMin: 170, speedMax: 300, angleMin: 20, angleMax: 160 },
  },
  // speed=上段から下段への非物理運搬速度（px/秒）。大きいほど早く運ぶ。
  transfer: { speed: 220, deploySpeed: 300 }, // deploySpeed=出撃後の運搬速度（px/秒）。
  // trailDuration=再抽選時の球の残像が消えるまでの秒数。濃さ・個数はstage.marblePresentation側。
  reroll: { trailDuration: 0.3 },
  // 上段の球生成と混雑時の制限。
  spawn: {
    // trueで定期的に球を生成。falseではデバッグの手動生成のみ。
    automatic: true,
    // 自動生成を予約する間隔（秒）。小さいほど生成頻度が高い。
    interval: 1.4,
    // 1回に予約する球数。発射口が空くたびに1個ずつ出す。
    batchSize: 1,
    // 各陣営の球数上限。運搬中・再抽選待ちの球も含む。
    maxPerTeam: 24,
    // 出現時に他の球と確保する追加間隔（px）。
    clearance: 1,
  },
  // 数値・再抽選・寿命の上限。
  rules: {
    // 新しく生成した球に表示する初期値。
    initialValue: 1,
    // 倍率を適用した後の数値上限。
    maxValue: 1_000_000,
    // 許可する再抽選回数。これを超える倍率取得で球を回収する。
    maxRerolls: 12,
    // 球の最大生存時間（秒）。運搬・待機も含め、超えたら回収する。
    maxLifetime: 90,
  },
  // showColliders=trueで当たり判定を表示。logTransitions=trueで効果・倍率取得もコンソールに記録。
  debug: { showColliders: false, logTransitions: false },
};

export type PhysicsConfig = typeof physicsConfig;
