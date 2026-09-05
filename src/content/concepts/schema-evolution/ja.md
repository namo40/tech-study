---
title: "Schema Evolution"
summary: "スキーマの進化とは、スキーマを跳ぶものではなく歩くものとして扱うことです。すべての変更を、個別にデプロイでき個別に戻せる歩みに分解します。だから生きているデータベースの形は、一度で正しくなければならない瞬間なしに動き続けられます。"
category: ".NET データアクセス"
scene: database-migration
sceneStep: 4
related:
  - label: Database Migration
    slug: database-migration
  - label: Backward-Compatible Migration
    slug: backward-compatible-migration
  - label: Expand-Contract Migration
    slug: expand-contract-migration
  - label: Rolling Update
    slug: rolling-update
  - label: Blue-Green Deployment
    slug: blue-green-deployment
  - label: Zero-Downtime Deployment
    slug: zero-downtime-deployment
  - label: Feature Flag
    slug: feature-flag
  - label: Schema Registry
    slug: schema-registry
  - label: Database Index
    slug: database-index
  - label: N+1 Query
    slug: n-plus-1-query
references:
  - title: "EF Core: Migrations overview"
    url: https://learn.microsoft.com/en-us/ef/core/managing-schemas/migrations/
  - title: "EF Core: Applying migrations"
    url: https://learn.microsoft.com/en-us/ef/core/managing-schemas/migrations/applying
  - title: "EF Core: Migrations in team environments"
    url: https://learn.microsoft.com/en-us/ef/core/managing-schemas/migrations/teams
---

4 番目のステップまで来ると古い列に読み手は残っておらず、削除しても誰かに見えるものは何も変わりません。シーン全体が積み上げてきた地点がここで、これはめでたい結末ではなく性質として言っておく値打ちがあります。最後の一歩が退屈だったのは削除が賢かったからではなく、その前の 3 歩が読み手を移しておいたからです。スキーマは跳躍で版が変わりません。歩きます。そして一歩一歩が、戻せるくらい小さいのです。

4 つの歩みは名前の変更のための手順書ではなく、一般的な形です。型の変更なら、より広い型の新しい列、両方への二重書き込み、変換を含んだバックフィル、読みの移動、古い列の削除です。1 つの列を 2 つに分ける作業も、新しい列が 2 つになるだけで同じ歩みです。nullable な列を必須にする作業は、既定値、null の行のためのバックフィル、既存の行を検査せずに足し、検査の間テーブルをロックしないようあとから検証する制約 (PostgreSQL では `NOT VALID`、SQL Server では `WITH NOCHECK`)、そのあとでようやく値があると前提するコードです。テーブルをサービス間で移す作業も、真ん中に `UPDATE` の代わりにメッセージキューが入るだけで同じです。どの場合でも破壊的な変更は、それを安全にしたものの後、いちばん最後に来ます。

各段階をデプロイ可能にしているのは、その段階が着いた瞬間に両方向で互換だという事実です。各段階を戻せるようにしているのはもっと微妙で、失いやすいものです。前の状態がまだ存在していなければならない、ということです。expand が戻せるのは新しい列が空で、削除に何もかからないからです。バックフィルが戻せるのは、まだ誰も読まない列にしか書かないからです。switch が戻せるのは、二重書き込みが古い列を保守し続けているので、読みを古い列に戻しても火曜日のスナップショットではなく最新のデータが見つかるからです。contract は戻せない唯一の段階で、だからこそ最後に置かれ、そして待ちます。

その待ちがチームの飛ばす部分で、飛ばすのは誤った節約です。古い列にかかるのは少しの保存領域と書き込み経路の 1 行です。1 週間置けば、その 1 週間はどんな切り戻しも事故ではなくデプロイになります。この遅らせ方の裏には本物の判断が 1 つあり、それは証拠についてです。誰も読んでいないと示せるようになったときに列を削除します。クエリログでも、まだ読みうるコード経路に付けた指標でも、読み手の全体だと確信できるコードベースを探し切ったことでも構いません。「たぶん使っていません」は、毎月 1 日に走る集計ジョブが最悪の瞬間にその列を見つける道です。

この習慣は列の外にも一般化し、同じ議論は 2 つの版が互いに合わなければならないところに必ず現れます。ほかのサービスが受け取るイベントやメッセージも同じように進化します。フィールドを足し、既存のフィールドを別用途に流用せず、コンシューマーが知らないフィールドを許すようにし、そのフィールドを読んでいたコンシューマーがいなくなってから退役させます。スキーマレジストリはその規律を機械に守らせたもので、読み手が自分の別インスタンスではなく他チームになった時点から持つ値打ちがあります。HTTP API もまた同じ形で、新しい必須リクエストフィールドが破壊的変更である理由は、`NOT NULL` がそうだった理由とまったく同じです。

シーンが最後に言おうとしているのは、この取引が何を買ってくれるかです。マイグレーションが安全になったという話ではありません。名前の変更は実行そのものが危なかったことは一度もありません。合わせなければならなかった変更 1 つが、合わせなくてよい変更 4 つになったという話です。合わせるとは 2 つの出来事が十分近くに起きるという約束であり、ロールアウトはまさに誰もその約束をできない状況です。合わせた出来事 1 つを独立した出来事 4 つに替えるのがこの取引で、代金は列 2 つを 1 週間ほど抱えることと、両方に書く数行のコードです。メンテナンス窓に比べれば安いものです。
