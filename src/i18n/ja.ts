import type { Messages } from './en';

const ja: Messages = {
  'site.name': 'Tech Study',
  'site.tagline': 'サーバー技術をモーションで解説します',
  'site.description':
    'サーバー技術のキーワードを短いモーショングラフィックスで解説します。キーワードごとに 1 ページを用意し、英語、韓国語、日本語に対応しています。',

  'nav.skipToContent': '本文へスキップ',
  'nav.home': 'ホーム',

  'home.heading': '概念一覧',
  'home.intro':
    'キーワード 1 つにつき 1 ページです。各ページは短いシーンから始まり、概念を段階ごとに説明し、.NET での書き方を示します。',
  'home.empty': 'まだ公開されている概念はありません。',

  'lang.label': '言語',
  'lang.en': 'English',
  'lang.ko': '한국어',
  'lang.ja': '日本語',

  'theme.label': 'テーマ',
  'theme.toLight': 'ライトテーマに切り替える',
  'theme.toDark': 'ダークテーマに切り替える',

  'player.region': 'シーンプレーヤー',
  'player.play': '再生',
  'player.pause': '一時停止',
  'player.previous': '前のステップ',
  'player.next': '次のステップ',
  'player.scrub': '再生位置',
  'player.time': '再生時間',
  'player.loop': 'シーンを繰り返す',
  'player.sound': '効果音',
  'player.step': 'ステップ {n}',
  'player.goToStep': 'ステップ {n} へ移動',
  'player.keyboardHint':
    'プレーヤーにフォーカスがあるとき、Space で再生と一時停止を切り替え、左右の矢印キーでステップを移動し、Home で最初に戻ります。',
  'player.stageLabel': '概念を説明するアニメーション図',

  'section.whenToUse': 'いつ使うか',
  'section.cautions': '注意点',
  'section.dotnet': '.NET では',
  'section.related': '関連する概念',
  'section.references': '公式資料',

  'related.noPage': 'ページは準備中です',

  'footer.license': 'コードとコンテンツは MIT License で公開しています。',
  'footer.builtWith': 'Astro、SVG、GSAP で作成しています。',
};

export default ja;
