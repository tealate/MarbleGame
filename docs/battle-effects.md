# 攻撃・防御効果と戦闘大砲

仕様参照： [戦闘ゾーン](https://app.notion.com/p/4101fd1a6151811b88ddfa1e12122ef7) / [マーブルゾーン](https://app.notion.com/p/40c1fd1a6151817baebec16a553d6e5e) の2026-11-07最新方針。

## 設定場所

- `src/config/effects.ts`：8種類のID、表示名、色、攻撃／防御の分類。
- `src/config/stage.ts`：`effectGroups` の穴数・並び、`effectPresentation` の画像・球の枠線、`upperPresentation` の帯表示。`battlePresentation` は大砲の中心・基準角度・大きさ。アイコンは `public/icons/{effectId}.svg`。
- `src/config/battle.ts`：`materials` の色・模様・最大HP・補強量。土3／ガラス2／木4／コンクリート8。`attack.effects` の基本ダメージ・特効素材・倍率。砲弾直撃は `attack.effects.shell.damage`、周囲へのダメージ・半径・演出時間・色は `attack.explosion`。
- 同ファイルの `cannon.swing.red/blue`：振幅（度）、往復周期（秒）、位相（度）。初期値は±30度・4秒。`cannon.muzzleClearance` は砲口外側の余白。壁の回転とは独立。
- `defense.interval` はデバッグ連射間隔（攻撃にも共用）。

## 発射と命中

到着イベントから `BattleSimulation.arrival` → `fireEffect` へ接続。デバッグ発射も同じ処理を使う。1出撃球につき1発で、`effectId`・`value`・`sourceMarbleId` を弾へ保持する。倍率値は威力・補強量・発射数にまだ適用しない。

砲身と弾は `BattleSimulation.cannonPose` を共用。砲口の外側から発射し、発射時の方向へ直進する。防御弾は自陣、攻撃弾は敵陣の壁だけを判定する。固定角度のデバッグも描画へ反映する。

全攻撃が全素材にダメージを与える。斧は木、シャベルは土、つるはしはコンクリートに特効。ガラスはHP設定に関わらずどの攻撃でも1撃で破壊する。つるはしは1枚目のガラスを貫通し、2枚目のガラスか非ガラス壁への命中で消える。砲弾は直撃壁に直接ダメージ、爆発円と交差する他の敵壁に範囲ダメージを1回ずつ与える（リングをまたぎ、直撃壁への二重加算はしない）。大砲中央への命中でも弾を消費し、砲弾は爆発する。

防御の同素材・損傷壁のみ補強、異素材／最大HP通過、外側増築、最大半径で消滅、全リング一体回転は維持。球ごとの射程制限は設けない。

## デバッグと未実装

既存の `debug.bat` のパネルから陣営、防御素材4種、攻撃4種、首振り／固定角度、単発／連射対象を選択できる。防壁リセット・空にする操作も維持。

倍率値の戦闘への適用、砲台HP・勝敗判定、戦闘AI、YouTube連携は未実装。今回の依頼に従い、テスト・ビルド・ブラウザ確認・撮影は実行していない。
