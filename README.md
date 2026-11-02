# MarbleGame

YouTube 縦型ライブ向けの 2D マーブルゲームの画面基盤です。現在は仮の画面のみを表示します。

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
