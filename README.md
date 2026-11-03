# MarbleGame

YouTube 縦型ライブ向けの 2D マーブルゲームです。現在はマーブルゾーンの静的レイアウトを表示します。物理演算・衝突・ワープ・効果・倍率計算・再抽選・戦闘・YouTube連携は未実装です。

## 起動

```powershell
npm install
npm run dev
```

開発サーバーを起動したまま、PC ブラウザまたは OBS のブラウザソースで `http://localhost:5173/` を開いてください。OBS のブラウザソースは幅 `1080`、高さ `1920` を指定できます。GitHub のリポジトリ URL はソースコードの保存先であり、ゲーム画面の URL ではありません。

```powershell
npm run build
npm run preview
```

`preview` はビルド済みの画面を `http://localhost:4173/` で確認します。

ポートが利用できない場合は `npm run dev -- --port 5180` のように変更し、ターミナルに表示されたURLを開いてください。

## 画面とファイル構成

内部座標は1080×1920。配信情報576px、戦闘768px、マーブル576pxの3:4:3です。マーブルは左が赤、右が青で各540×576。小さいウィンドウでは9:16を保って全体を縮小します。

- `src/config/stage.ts`：画面比率、チーム色、上下の装置、開始地点、ピン、効果枠・結果枠の設定と型。
- `src/marble/layout.ts`：設定から寸法・位置を算出する純粋な処理。PixiJSを含まない保存可能なデータを返します。
- `src/marble/render.ts`：算出済みデータをPixiJSで描画。赤青で同じ処理を利用します。
- `src/game.ts`：上部・中央の仮表示と、共通装置を左右に配置する画面構成。
- `src/screen.ts`：ウィンドウサイズへのフィット。
- `src/main.ts`：起動・リサイズ時の描画。静止画のため毎フレームの描画は停止しています。
- `tests/layout.test.mjs`：配置・識別子・設定変更の検証（`npm test`）。

## 設定を変更する場所

`src/config/stage.ts` の `marbleConfig` を編集してください。赤・青の両方に反映されます。開発サーバー起動中は保存するとViteがページを更新します。本番用は `npm run build` で再生成してください。

| 設定 | 調整内容 |
| --- | --- |
| `upper` / `lower` の `x, y, width, height` | 各装置の位置・サイズ（各陣営の左上が原点） |
| `wallThickness` | 外壁の厚み |
| `start.x, start.y, start.radius` | 上段の生成地点、下段のワープ先兼再抽選開始地点（装置内のローカル座標） |
| `row.inset, row.gap` | 壁の内側から枠列までの余白、枠同士の間隔 |
| `row.height, row.openingWidth, row.funnelHeight` | 枠の高さ、入口の開口幅、入口に向かう斜面の高さ |
| `row.slots` | 枠の個数・左からの順序・ID・ラベル・色・意味 |
| 各slotの `width, height, openingWidth` | 個別の寸法上書き。幅を省略した枠は残り幅を等分 |
| `lower.pins.radius, spacingX, spacingY` | ピンの半径・横間隔・縦間隔 |
| `lower.pins.centerX, firstY, rowCounts` | ピン列の中心、最初の高さ、各行の個数 |
| `lower.pins.positions` | 任意の `{ x, y }` 配列。指定すると自動整列を置換（装置内座標） |

例えば `lower.row.openingWidth: 30 → 16` で下段の入口が狭くなり、`lower.pins.radius: 5 → 8` でピンが大きくなります。`rowCounts: [3, 4]` なら2行7本になります。枠は常に装置下端に揃います。枠を追加する場合は `slots` に一意なIDを追加してください。個別幅の合計・隙間・余白が装置幅に収まり、開口幅が枠幅以下になるように調整します。装置やピンを動かす場合は、各陣営の540×576の領域内に収めてください（自動縮小・衝突回避はしません）。

`action` は将来の動作を表すデータのみです。`effect` は `effectId`、`multiplier` は `factor` を持ち、いずれも `target: 'lower-start'`。`deploy` は `target: 'battle'`。色やラベルから動作を推測しません。同じ倍率の枠でも配置IDは別にし、将来は「チームID / 装置 / 枠ID」で特定できます。効果A〜Dは仮の識別子で、具体的な処理は未定です。

## 確認

```powershell
npm test
npm run build
```

自動検証は画面の論理寸法、配置範囲、戻り先、設定変更後の幾何データを対象とします。ブラウザの見た目は別途、1080×1920および狭いウィンドウで確認してください。初期実装時は操作ツールがブラウザURLを確認できず停止したため、目視確認と設定変更前後の実画面比較は未完了です。

仕様：[マーブルゾーン｜初期レイアウト・設定設計・実装範囲](https://app.notion.com/p/40c1fd1a6151817baebec16a553d6e5e)
