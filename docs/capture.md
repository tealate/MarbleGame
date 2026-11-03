# Windows 自動撮影

リポジトリ直下の `capture.bat` をダブルクリックします。Node.js 20 以上、Git、Microsoft Edge、および origin に push できる既存の Git 認証が必要です。依存が未導入なら最初に `npm ci` を実行します。認証・Git の名前とメールは事前に設定してください。実行中のコンソールを閉じず、終了するまで待ちます。完了時は共有 URL を読めるようコンソールを残します。

通常はテスト・ビルド → Vite 起動 → Edge 起動 → Rapier 初期化待ち → PNG → 動画 → 保存動画の全編デコード検査 → コピー → 撮影ファイルだけコミット → origin/main に push → 公開ファイルを GET して SHA-256 照合、の順で動きます。URL はコミットを指定するため、後の撮影で内容が変わりません。スマホではダウンロードして再生してください。

## 設定

`tools/capture.config.json` をテキストエディターで変更します（JSON なのでコメント・末尾カンマは不可）。

| 項目 | 初期値 / 意味 |
| --- | --- |
| width / height | 1080 / 1920、出力のピクセル寸法 |
| durationSeconds / fps | 15秒 / 30、MediaRecorder への目標 FPS |
| videoBitsPerSecond | 4000000 |
| format | `mp4` または `webm`。MP4 は H.264 MIME を優先 |
| screenshot / video | 各撮影を有効にする boolean |
| filename | `marble-game-{timestamp}`。日時とランダム ID を展開。既存ファイル保護のため `{timestamp}` は必須 |
| outputDirectory | `docs/previews`。この配下のサブディレクトリも可 |
| autoPush | `true`。`false` ならステージ・コミット・push を一切行わない |
| waitBeforeCaptureMs | 2000、初期化完了後の待機時間 |
| timeoutMs | 60000、接続や初期化等のタイムアウト |
| port | 0、OS が空きポートを割り当て。固定ポートも指定可 |
| edgeExecutablePath | 空ならインストール済み Edge。必要なら exe の絶対パス |
| softwareRendering | true、記録で成功した SwiftShader を使用 |
| runChecks | true、毎回 `npm test` と `npm run build` を実行 |

`capture.bat --no-push` は設定に関係なくローカル撮影だけ行います。`capture.bat --config tools/my-capture.json` で別設定を使用できます。ターミナルから `npm run capture -- --no-push` も使えます。自動実行時に BAT の最後の pause を省くには環境変数 `CAPTURE_NO_PAUSE=1` を設定します。

## Git の保護

- 公開するのは今回生成した PNG / MP4（設定によって WebM）のみ。ツールのソースやゲームの変更は含みません。
- main ブランチ、origin の fetch/push URL、未完了の merge/rebase、競合、Git identity、リモート main と HEAD の一致を確認します。既存のローカルコミットをまとめて公開しません。
- 生成物は排他的コピーで新規作成します。既存ファイルを上書きせず、symlink/junction 出力も拒否します。
- 明示した新規ファイルにのみ `git add --intent-to-add` と `git commit --only -- <files>` を使用します。既存のステージ済み内容は保持し、コミット対象とステージ差分を監査してから push します。
- 撮影コミットと push の Git hooks は無効化し、hooks による対象外変更や追加処理を防ぎます。Git 署名の既存設定は尊重します。
- force push、stash、reset、checkout、pull、自動マージは行いません。
- push 失敗時は原因と非ゼロ終了コードを返します。撮影ファイルと作成済みコミットは残ります。次回は HEAD 不一致で停止するため、`git status` / `git log origin/main..HEAD` で確認して、認証やブランチの問題を手動で解決してください。
- 実行中は別の Git 操作やゲーム編集を避けてください。撮影は作業ツリーの現在のゲームを使用し、未コミットのゲーム編集も映像に反映します。

## 録画・検証・終了

ゲーム本体は変更していません。`main.ts` が物理初期化後に追加する `#game canvas` を待ち、Playwright の viewport と deviceScaleFactor=1 で寸法を制御します。録画専用 Canvas に指定寸法で描画するので、ゲームの内部バッファが小さい場合は拡大されます。異なる縦横比は動画が引き伸ばされるため、9:16 を推奨します。

対応 MIME を調べて MP4/H.264 を優先します。指定形式が非対応なら明確に失敗し、WebM を MP4 と偽って保存しません。FPS は目標値で、マシン負荷によって実際のフレーム数は変わります。保存動画の署名・サイズ、全編再生、解像度・長さ・デコード数、マーブル領域のフレーム変化を検証し、実測デコード FPS を表示します。これは録画の動きの検査で、物理法則の正しさは既存の physics テストで別途検査します。

一時ファイルは OS の一時ディレクトリに作成し、成功・例外・Ctrl+C 時に専用 Edge、Vite、一時ファイルを片付けます。既に開いている Edge や他の Vite は終了しません。タスクマネージャーの強制終了・電源断では finally が実行できないため後片付けは保証できません。検証前に失敗した一時録画は削除し、検証後に配置した成果物は公開失敗時も残します。

参考: [既存の撮影手順・検証記録](https://app.notion.com/p/40d1fd1a6151819dbadac1e9535a7534)、[Playwright BrowserType](https://playwright.dev/docs/api/class-browsertype)、[MediaRecorder](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder)。

## 実行検証（2026-11-03）

- Windows / Node.js 20.10.0 / インストール済み Edge で、`CAPTURE_NO_PAUSE=1` として `cmd /c capture.bat` を一回実行し、撮影から公開検証まで終了コード 0 で完了。
- `npm test`: 31 件成功。`npm run build`: 成功（既存の大きな bundle の警告あり）。`git diff --check`: 成功。
- PNG: 1080×1920、105,635 bytes。生成画像を表示して画面内容も確認。
- MP4: 1080×1920、H.264 (`avc1.420028`)、14.8942 秒、3,569,766 bytes。保存済みデータの全編再生成功、375 フレームを観測、マーブル領域は 374 回変化。目標 30 FPS に対し再生時に観測できた FPS は約 25.18（コンテナの公称 FPS を計測した値ではない）。
- コミット `365f55a4f24f2f0c6c9ae66941f68c591e5753d1` は今回の PNG / MP4 2 ファイルのみ。origin/main に push 成功。両方の公開 URL から GET したデータの SHA-256 がローカルと一致。
- 別の一時 Git リポジトリで、既存のステージ済み差分・未ステージ変更・未追跡ファイルの保持、ブランチ不一致・リモート不一致・HEAD 不一致の拒否を検査。
- Edge 実行パスを意図的に壊した試験では終了コード 1、専用 Vite のポート 5198 の LISTEN は 0 件。録画後の例外経路でも後片付けを実行。成功後も撮影用 Node / Edge プロセス 0 件、一時撮影ディレクトリなしを確認。
- Explorer での実際のダブルクリック操作、スマホ実機での再生、WebM 出力、未導入状態からの自動 `npm ci`、強制終了・電源断は未検証。実際の GitHub push 拒否を意図的に起こす試験も未実施。

[検証済みMP4](https://raw.githubusercontent.com/tealate/MarbleGame/365f55a4f24f2f0c6c9ae66941f68c591e5753d1/docs/previews/marble-game-2026-11-03T06-23-39-108Z-1d3f8106.mp4) / [検証済みPNG](https://raw.githubusercontent.com/tealate/MarbleGame/365f55a4f24f2f0c6c9ae66941f68c591e5753d1/docs/previews/marble-game-2026-11-03T06-23-39-108Z-1d3f8106.png)
