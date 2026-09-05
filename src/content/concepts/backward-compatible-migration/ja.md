---
title: "Backward-Compatible Migration"
summary: "後方互換なマイグレーションは、いま動いているバージョンと次のバージョンが一緒に生きられるスキーマ変更です。追加は互換で、削除と名前の変更はそうではありません。この規則が、バージョンの重なる窓を、ただ短いだけでなく耐えられるものにします。"
category: ".NET データアクセス"
scene: database-migration
sceneStep: 2
related:
  - label: Database Migration
    slug: database-migration
  - label: Schema Evolution
    slug: schema-evolution
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

シーンの 2 番目のステップは 1 つの規則にかかっていて、目に見えるものはすべてそこから出てきます。変更のあとでもアプリケーションの 2 つのバージョンがそのスキーマと一緒に生きられるときにだけ、その変更を出してよい、という規則です。これは「マイグレーションが成功した」よりずっと強い主張です。1 番目のステップのマイグレーションも、1 ミリ秒ほどで成功しました。できなかったのは、まだ動いていたコードが見分けられるスキーマを残すことでした。

列の追加が互換な変更の典型なのは、古いコードがその列に対して何をするかにあります。何もしません。`SELECT name, email FROM customers` は、その 2 つの隣に 3 つ目の列ができたからといって誤りにはならず、列を並べる `INSERT` も、新しい列が値のないことを受け入れてくれるかぎりは同じです。この最後の条件こそ、互換性が失われる場所です。`ADD COLUMN full_name text NOT NULL` は追加ではありません。まだデプロイもされていない列を、すべての書き手がすでに知っているべきだという要求であり、まだ動いているバージョンは知りません。nullable、または既定値の付いた nullable が、追加を見えなくしてくれます。

削除と名前の変更は反対側で、名前の変更はわなとして名指ししておく価値があります。SQL がそれを気前よく一文として見せてくれるからです。`ALTER TABLE customers RENAME COLUMN name TO full_name` は、削除と追加が編集のふりをしたものです。この一文が遅いから、実行が危ないから、ではありません。この一文は一瞬で、対になるデプロイが一瞬ではないからです。最初のインスタンスが立ち上がり直す時刻と最後のインスタンスが立ち上がり直す時刻のどこかで、`name` と言うコードがその列のないテーブルに出会います。残る問いは、何件のリクエストがその隙間に落ちるかだけです。

ですから試験の問題は「このマイグレーションはきれいに当たるか」ではなく、デプロイが実際に使う順序 (まずスキーマ、次にコード) で 3 つの状態を歩いて確かめることです。マイグレーションを当てて何もデプロイしない場合、v1 はまだ動きます。移行済みのスキーマに v2 をデプロイする場合、v2 は動きます。v2 を切り戻す場合、v1 はまだ動きます。3 つすべてを通る変更は半分ずつデプロイでき、それによってスキーマの一歩とコードの一歩が、1 つの合わせた出来事ではなく独立した 2 つのデプロイになります。障害が起きるのは、合わせた出来事の中です。合わせるというのはタイミングの約束であり、ロールアウトはタイミングを約束しないからです。

実務でのこの規則の形は短い一覧です。列は nullable で追加します。テーブルは何かが書き始める前に追加します。インデックスはデータベースが用意しているなら concurrently で作り、作成がテーブルをトラフィックに対してロックしないようにします。型は狭めずに広げます。すべての古い値が合法な値のままでいなければならないからです。enum の要素は末尾に足し、読み手は知らない要素を 1 つくらい許すようにします。列を導入するその一歩で、その列を厳しくしないでください。そして望む変更が本当に破壊的なら、安全にする方法を探すのではなく分解してください。このシーンの残りはまさにその話です。

この性質は前向きにも働き、それを忘れたときの代価は失敗する切り戻しです。v2 のデプロイは戻せる決定です。古いバイナリはまだレジストリにあります。マイグレーションの適用は戻すのがずっと難しいので、v1 は戻りたくなるかもしれない期間のあいだずっと、新しいスキーマの上で動き続けなければなりません。同じ規則を反対側から読んだものであり、誰も読まなくなったあとも古い列を数日置いておく理由です。必要になると見込んでいるからではなく、置いておくことが前のバージョンをデプロイ可能な成果物のままにしてくれるからです。

レビューで見張るべき合図が 1 つあります。1 つのプルリクエストにマイグレーションと、それに依存するコード変更が両方入っているなら、2 つは 1 つの出来事として出ようとしていて、誰かが両方一緒に着くと静かに前提しています。そうはなりません。マイグレーションはロールアウトの前に一度走り、コードはそのあと数分かけてインスタンスごとに着きます。2 つをプルリクエスト 2 つに分けるのは形式ではありません。レビュアーが本当に大事な問い、それぞれが単独で安全かに答えられる唯一の方法です。
