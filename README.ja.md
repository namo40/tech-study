# Tech Study

[English](README.md) | [한국어](README.ko.md) | **日本語**

サーバー技術をモーションで解説します。

Tech Study は、サーバー技術のキーワードを短いモーショングラフィックスで解説する静的サイトです。キーワード 1 つにつき 1 ページを用意し、すべてのページを英語、韓国語、日本語で公開します。概念はまず一般的な形で説明し、そのあとで .NET ではどう書くのかを示します。

## 技術構成

- **Astro** が静的出力、コンテンツコレクション、言語プレフィックス付きのルーティングを担当します。
- **SVG と GSAP** でシーンを作ります。1 つのシーンは 9:16 のキャンバス 1 つとタイムライン 1 本で構成し、再生、一時停止、ステップ移動、スクラブの操作を備えます。
- **TypeScript** でプレーヤー、効果音、テーマ切り替えを実装します。UI フレームワークは使いません。
- ページ本文は Markdown のコンテンツコレクションに置き、インターフェイス文字列は型の付いた TypeScript モジュールに置きます。
- 効果音は Web Audio API で合成するため、音声ファイルは配布しません。

## はじめかた

```sh
npm install
npm run dev
```

| コマンド | 動作 |
| --- | --- |
| `npm install` | 依存パッケージをインストールします |
| `npm run dev` | `http://localhost:4321` で開発サーバーを起動します |
| `npm run build` | 静的サイトを `dist/` にビルドします |
| `npm run preview` | ビルド結果をローカルで配信します |
| `npm run check` | `astro check` で型を検査します |
| `npm run verify` | すべてのシーンがタイムラインの約束を守っているか検査します |
| `npm run baseline` | すべてのシーンのフレームごとの指紋を記録します |
| `npm run baseline:compare` | 記録した指紋とシーンを比べます |

## 設定

2 つの環境変数で公開先を決めます。

| 変数 | 既定値 | 用途 |
| --- | --- | --- |
| `SITE_URL` | `http://localhost:4321` | canonical と `hreflang` の URL に使う絶対アドレス |
| `SITE_BASE` | `/` | サブパスに公開するときの base path |

```sh
SITE_URL=https://example.com SITE_BASE=/tech-study/ npm run build
```

内部リンクとアセットはすべて base path を通るので、ドメイン直下とサブパスを行き来してもソースを直す必要はありません。

## プロジェクト構成

```
astro.config.mjs        サイトアドレス、base path、言語ルーティング
src/
  content.config.ts     concepts コレクションのスキーマ
  content/concepts/     キーワードごとの言語別マークダウン
  i18n/                 インターフェイス文字列、英語がキー集合を定義
  layouts/              文書の骨格: head、フォント、テーマ、ヘッダー、フッター
  pages/                ルートのリダイレクト、/{lang}/、/{lang}/{slug}
  components/           ヘッダー、言語切り替え、テーマ切り替え、シーンプレーヤー
  scenes/               ステージのマークアップと GSAP タイムライン
  scripts/              プレーヤー、効果音、テーマ切り替え
  styles/               デザイントークン、全体スタイル、シーンスタイル
```

## シーンを追加する

1 つのシーンは `src/scenes/<id>/` フォルダーで、その中にモジュールを 2 つ置きます。

`stage.ts` は、ページにそのまま載る静的な SVG である `stageMarkup` を公開します。`src/scenes/shared/stage.ts` の共通ビルダーで組み立ててください。`clientBox`、`nodeFrame`、`serviceBox`、`verticalLink`、`healthDot`、`slotRow`、`counterVariants`、`timerRing`、`trackAndFill`、`chip`、`requestsLayer` があります。座標はすべて引数なので、シーンごとに自分の数値を保ったまま、隣のシーンと同じ図として読めます。このモジュールはサーバー側で import されるため GSAP を持ち込んではならず、プレーヤーが実行時に埋める空の `scene-requests` レイヤーで終わる必要があります。

`scene.ts` は既定の export として `SceneModule` を公開し、タイムラインを組み立てます。始めは `src/scenes/shared/timeline.ts` の `createSceneTimeline()`、終わりは `finishSceneTimeline(tl, SCENE_DURATION)` です。前者は停止したタイムラインを返し、後者は長さを固定したうえでタイムラインを前後 1 往復ぶん温めます。こうしておくと、まだ順方向に通っていない状態変化を逆方向にスクラブしても正しく戻ります。仕上がったシーンは `src/scenes/registry.ts` に登録します。

状態は属性で変え、コールバックでは変えません。`src/scenes/shared/state.ts` の `attr(tl, target, name, value, at)` が長さ 0 の tween で `data-*` の値を書き、その属性を見る CSS が見た目を決めます。色を補間しないので、スクラブの両方向でも 2 つのテーマでも正しいままです。

ステージのスタイルには `src/styles/scene.css` のウィジェットクラスを使います。`.scene-track`、`.scene-fill`、`.scene-ring`、`.scene-counter`、`.scene-flash`、`.scene-slot`、`.scene-chip`、`.scene-mono`、`.scene-health` を、シーンの接頭辞付きクラスの隣に並べて書きます。するとシーン側の規則には違うところだけが残り、たいていはカスタムプロパティ（`--fill-color`、`--ring-color`、`--ring-width`、`--flash-color`）1 つとフォントサイズだけになります。

キューやプールのように 1 つの出来事が次の出来事を呼ぶシーンは、先に予定を計算してから tween を並べます。`src/scenes/shared/simulation.ts` の `createScheduler()` は予約した出来事を早い順に実行し、実行の途中で新しい出来事を予約することもできます。`collapseLast` と `collapseAtInstant` は同じ瞬間に重なる変化を 1 つにたたみ、その 1 フレームが読む人のスクラブ方向で変わらないようにします。

効果音は `success`、`failure`、`state`、`trip` の 4 つです。それぞれを、見ている人がその出来事に気づく瞬間に置きます。キャッシュミスは、シミュレーションがそう決めた時刻ではなく、リクエストがキャッシュに届く瞬間に鳴らします。

すべてのシーンが同じ約束を守ります。長さは 24 秒、`step-1` から `step-4` までの昇順のラベルが 4 つ、そのラベルと一致する `steps[]` の時刻、最初と最後のフレームに見えているリクエストがないこと、10 ミリ秒ごとに順方向と逆方向が一致すること。`npm run verify` がこれらをまとめて検査し、あらかじめ記録したデータは必要ありません。シーンが仕上がったら `npm run baseline` でフレームを記録し、`npm run baseline:compare` でその後の変更が記録から外れていないか確かめます。

## 言語

英語が原本で、韓国語と日本語は英語から訳します。インターフェイス文字列は `src/i18n` にあり、英語のファイルがキー集合を定義し、ほかの 2 つはそのキー集合に合っているかを型検査で確かめます。ページ本文はコンテンツコレクションに言語別のマークダウンとして置きます。3 つの README はつねに同じ内容にそろえます。

## アクセシビリティとモーション

シーンはページを開くと自動的に再生されます。読む人がモーションの抑制を選んでいる場合は、プレーヤーが最初のフレームで止まったまま待ち、ステップを移動してもそのステップの先頭に移って停止したままになります。現在のステップは、広い画面ではステージの横に、狭い画面ではステージの上に説明カードとして表示するので、説明と図が互いを隠すことなくいっしょに見られます。字幕は絵ではなくページのテキストであり、状態は色だけでなく文字でも示し、結果はチェックとバツの記号で区別するので、色だけに頼る場面はありません。

## ライセンス

MIT です。[LICENSE](LICENSE) を参照してください。
