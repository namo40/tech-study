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
  'home.headline': 'キーワード 1 つに、{scene} 1 つ。',
  'home.headlineAccent': 'シーン',
  'home.stats': '概念 {concepts} 件 · カテゴリー {categories} 件 · English / 한국어 / 日本語',
  'home.nowPlaying': '再生中',
  'home.watchScene': 'シーン全体を見る',
  'home.moreScenes': 'ほかのシーン',
  'home.filterLabel': '名前で概念を絞り込む',
  'home.filterPlaceholder': '名前で絞り込む…',
  'home.noMatches': '条件に一致する概念はありません。',
  'home.sceneBadge': 'シーンのある概念',
  'home.duration': '{n}秒',
  'home.allCategories': 'すべて',
  'home.tagLabel': 'タグ',

  'tag.consistency': '一貫性',
  'tag.database': 'データベース',
  'tag.deployment': 'デプロイと移行',
  'tag.duplicates': '重複処理',
  'tag.ef-core': 'EF Core',
  'tag.kubernetes': 'Kubernetes',
  'tag.latency': 'レイテンシ',
  'tag.memory': 'メモリ',
  'tag.metric': 'メトリクス',
  'tag.oauth': 'OAuth',
  'tag.overload': '過負荷',
  'tag.queue': 'キュー',

  'lang.label': '言語',
  'lang.en': 'English',
  'lang.ko': '한국어',
  'lang.ja': '日本語',

  'theme.label': 'テーマ',
  'theme.toLight': 'ライトテーマに切り替える',
  'theme.toDark': 'ダークテーマに切り替える',

  'textSize.label': '文字サイズ',
  'textSize.normal': '標準',
  'textSize.large': '大きめ',
  'textSize.larger': 'さらに大きめ',
  'textSize.xlarge': '特大',
  'textSize.largest': '最大',
  'textSize.switch': '現在の文字サイズは{current}です。押すと{next}に切り替わります',

  'player.region': 'シーンプレーヤー',
  'player.play': '再生',
  'player.pause': '一時停止',
  'player.previous': '前のステップ',
  'player.next': '次のステップ',
  'player.scrub': '再生位置',
  'player.time': '再生時間',
  'player.loop': 'シーンを繰り返す',
  'player.sound': '効果音',
  'player.speed': '再生速度',
  'player.step': 'ステップ {n}',
  'player.goToStep': 'ステップ {n} へ移動',
  'player.keyboardHint':
    'プレーヤーにフォーカスがあるとき、Space で再生と一時停止を切り替え、左右の矢印キーでステップを移動し、Home で最初に戻ります。',
  'player.stageLabel': '概念を説明するアニメーション図',

  'concept.partOf': '{parent} の一部です',

  'section.whenToUse': 'いつ使うか',
  'section.cautions': '注意点',
  'section.dotnet': '.NET では',
  'section.related': '関連する概念',
  'section.references': '公式資料',

  'related.noPage': 'ページは準備中です',

  'footer.aiNotice': 'Claude Fable 5 を使用して制作されました。',
};

export default ja;
