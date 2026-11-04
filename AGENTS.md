# 動作確認・撮影

- 通常の画面確認: `start.bat`
- デバッグ画面: `debug.bat`
- 動画・画像撮影: `capture.bat`
- ローカル撮影のみ: `capture.bat --no-push`
- 撮影ファイルの保存先: `docs/previews/`
- 撮影設定: `tools/capture.config.json`
- 詳細手順: `docs/capture.md`

Codex が動画撮影を依頼されたら、原則として既存の `capture.bat` を使用する。撮影方法の再調査、新規撮影スクリプトの作成、既存コードの読み直しは必要な場合だけ行う。動画の共有を求められた場合は、既存の自動 GitHub 公開機能を優先する。動画撮影だけの依頼では、ゲーム本体や撮影機構を変更しない。実行後は、生成した動画・画像の保存先または共有 URL を報告する。
