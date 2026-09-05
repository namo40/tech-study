---
title: "Expand-Contract Migration"
summary: "拡張縮小マイグレーションは、スキーマ変更を 2 回のリリースに分け、その間に両方の形が共存する期間を置きます。拡張は古い形が動いたまま新しい形を加え、縮小は古い形を読むものが何も残らなくなってから初めてそれを取り除きます。"
category: "コンテナーとオーケストレーション"
scene: blue-green-deployment
sceneStep: 4
related:
  - label: Blue-Green Deployment
    slug: blue-green-deployment
  - label: Rolling Update
    slug: rolling-update
  - label: Zero-Downtime Deployment
    slug: zero-downtime-deployment
  - label: Canary Release
    slug: canary-release
  - label: Readiness Probe
    slug: readiness-probe
  - label: Health Check
    slug: health-check
  - label: Graceful Shutdown
    slug: graceful-shutdown
  - label: Strangler Fig
    slug: strangler-fig
  - label: Feature Flag
    slug: feature-flag
  - label: Pod Disruption Budget
    slug: pod-disruption-budget
references:
  - title: "EF Core: Migrations overview"
    url: https://learn.microsoft.com/en-us/ef/core/managing-schemas/migrations/
  - title: "EF Core: Applying migrations"
    url: https://learn.microsoft.com/en-us/ef/core/managing-schemas/migrations/applying
  - title: "EF Core: Migrations in team environments"
    url: https://learn.microsoft.com/en-us/ef/core/managing-schemas/migrations/teams
---

シーンの最後のステップは、前の 3 つのステップがなぜ成り立ったのかを説明する場所です。Blue と Green は何もかもが 2 つですが、その下にあるデータベースは 1 つだけで、それだけは複製されません。そのスキーマについて真であることは、2 つのバージョンに同時に真です。つまり新しいバージョンだけが理解できる変更は、実はスキーマ変更ではなく、戻れる能力をもう持たないという決定です。

そこで変更は、間に隙間を置いて二手に分けます。拡張は追加です。新しい列は nullable で入り、新しいテーブルは空で入り、新しい列挙値はまだ使われず、古いバージョンが読むものはすべて元の場所にそのまま残ります。拡張リリースは何も壊さないので、それを必要とするコードより先に、どの切り替えより先に、単独で出せます。そのあと、シーンが `v1` と `v2` のタグで示す区間では、両方の形が存在し、両方のバージョンが同じ行に対して正しいままです。

縮小がもう一手で、その前提条件がこの話のすべてです。縮小が出ていくのは、まだ動いている可能性のあるどれもが古い形を読まなくなったときだけです。新しいバージョンがデプロイされた時点ではありません。トラフィックが移った時点でもありません。古い列を必要とする何にも戻らないと決めた時点です。シーンでは contract のチップが Blue の `idle` の後に現れますが、この順序は飾りではありません。縮小した瞬間に 2 段階目のロールバックは存在しなくなります。戻る先のバージョンが自分のデータを読めなくなるからです。

2 つの間には、よく飛ばされる部分があります。両方の形を書くリリースです。それがデプロイされている間、アプリケーションは書くたびに古い列と新しい列の両方を埋め、変更より前の行を後から埋め、いま信頼するほうを読みます。このリリースが拡張を本物にします。これがないと、新しい列は存在しても、古いバージョンが書いたすべての行で空のままなので、互換だというスキーマは列の形だけが互換で、中身は互換ではありません。

この話が最もよく崩れるのは名前の変更です。名前の変更は 1 つの変更に見えて、実際には 5 つです。新しい列を追加し、両方に書き、後から埋め、新しいほうを読み、古いほうを削除します。そしてその一つ一つが、それ自体で安全に中断できなければなりません。デプロイは途中で止まりうるからです。型を狭めること、既存の行が違反しうる制約を加えること、nullable な列を必須にすることも同じです。ある手順が最後に完了した手順として残っても大丈夫でないなら、それは手順ではありません。

実務で最も被害を出す運用上の細部が 2 つあります。1 つ目は、アプリケーションの起動時にマイグレーションを適用することです。環境が 2 つ同時に立っていると両方が試み、負けたほうはすでに半分変わったスキーマの上で止まるか失敗します。スクリプトを生成しておくか、それに依存するコードより先にパイプラインの独立した手順としてマイグレーションを実行します。2 つ目は、大きなテーブルの拡張がただではないことです。インデックス付きの列を追加したり、数百万行を後から埋めたりする作業はロックと時間を使います。ですから後埋めはマイグレーションの中の 1 行ではなく、分割して動くバックグラウンドジョブとして扱い、拡張リリースは必要なだけ長く本番に置いておきます。

そうすると、このサイトのどのデプロイ戦略でも生き残る規則が 1 つ残ります。古いコードは新しいスキーマの上で動けなければならず、新しいコードは古いデータの上で動けなければなりません。両方が動いている可能性がある間はずっとです。ブルーグリーンがこの規則を必要とするのはロールバックが商品そのものだからで、ローリングアップデートが必要とするのは 2 つのバージョンが実際に重なるからで、カナリアが最も強く必要とするのは、そこでは重なりが一時的な事故ではなく設計そのものだからです。
