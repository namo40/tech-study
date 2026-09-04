---
title: "Shard Key"
summary: "shard key は、ルーターがハッシュして行がどのシャードに住むかを決める列です。照会一つを箱一つで終えられるか、そしてデータが均等に広がるかを同時に決め、データが積もった後では事実上変えられません。"
category: "データ分散と一貫性"
scene: sharding
sceneStep: 2
related:
  - label: Sharding
    slug: sharding
  - label: Consistent Hashing
    slug: consistent-hashing
  - label: Hot Partition
    slug: hot-partition
  - label: Partitioning
    slug: partitioning
  - label: Cross-Shard Query
    slug: cross-shard-query
  - label: Rebalancing
    slug: rebalancing
  - label: Database Index
    slug: database-index
  - label: Replication
    slug: replication
  - label: Replication Lag
    slug: replication-lag
  - label: Load Balancer
    slug: load-balancer
references:
  - title: "Data partitioning guidance"
    url: https://learn.microsoft.com/en-us/azure/architecture/best-practices/data-partitioning
  - title: "Partitioning and horizontal scaling in Azure Cosmos DB"
    url: https://learn.microsoft.com/en-us/azure/cosmos-db/partitioning
  - title: "Sharding pattern"
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/sharding
---

シーンの二番目の段階は規則を一つだけ入れ、画面に見えるすべてがそこから出てきます。キーの属するシャードは、尋ねられるたびにそのキーから計算されます。同じキーを続けて三度尋ねれば三度とも同じ箱に着きますが、それはどこへ行ったかを覚えていたからではなく、同じ入力を同じ関数に通せば同じ値が出るからです。それが約束のすべてです。ここははっきり書いておく価値があります。シャーディングの良い性質はすべてここに建てられ、悪い性質もすべてここから出てくるからです。

良いほうは、キーを持った照会がちょうど箱一つだけに触れることです。ルーターは探し回らず、住所を計算して接続を一つ開きます。だからシャーディングされたシステムは、データが十倍になってもキーのある読み取りを以前と同じ時間で答えられます。残りの十分の九には一度も触れていないからです。

悪いほうは、同じ文を逆から読んだものです。キーを持たない照会はルーティングできないので、すべてのシャードに尋ねて答えを合わせるしかありません。シーンはそれを `fan-out` として描きます。要求が一つルーターを離れ、すべてのレーンへ同時に降りていきます。単に仕事が N 倍になるのではありません。最も遅いシャードが応答時間を決め、その間 N 本の接続がふさがり、以前はデータベースがやってくれていた併合を今度は自分でやります。夜に一度回るレポートなら払えます。要求経路にあるページなら、たいてい払えません。

だからキーはデータではなくクエリを見て選びます。大事な読み取りを書き出します。クリティカルパスにあるもの、最も頻繁に回るものを並べ、それらがすでに共通して持っている値は何かを見ます。業務アプリケーションでその値はほとんどいつもテナント、顧客、口座です。製品そのものがすでにそれを中心に組まれているからです。大事な読み取りの大半が顧客を名指すなら shard key は `customer_id` であり、ある分析ジョブが fan-out することになるのは驚きではなく、払うと決めた代金です。

二つ目の基準は分布で、人が二番目に確認して最初に後悔する項目です。ルーティングはうまくいくのに分布が悪いキーは、複雑さだけを全部くれてスケールを何もくれません。カーディナリティの低さは目に付く失敗です。利用者の 70% が一つの国にいるのに `country` で分ければ、シャードをいくら足してもシャード一つがデータの 70% を抱えます。単調増加のキーはもっと微妙です。タイムスタンプや自動採番の id で分けると、新しい書き込みが全部いまの区間を持つシャードへ集まり、他は過去を抱えるだけで、書き込み負荷は箱一つに落ちます。Cosmos DB と DynamoDB のドキュメントがこのパターンに名前を付けているのには理由があります。

列一つで両方の仕事をこなせないときは、複合キーが解くことがよくあります。テナント一つが他の百倍なら `tenant_id` だけでは粗すぎます。`tenant_id + region` や、`tenant_id` にバケット番号を混ぜたハッシュは、巨大なテナントを割りながら普通のテナントを一か所に置きます。代わりに、照会がシャード一つで終わるには両方の部分が要るので、複合キーもクエリがすでに知っているものでなければなりません。

最初の一行を書く前に決めておくことがもう二つあります。一意性はもう局所的です。シャードのユニークインデックスはそのシャードの中でだけ一意なので、システム全体で一意であるべき値は shard key を含めるか、GUID や ULID のようにそれ自体で一意に生成される識別子をもらいます。結合はシャードの中でしか成り立たないので、一緒に読むテーブルは同じキーで分けます。そうすれば一人の顧客の注文、住所、請求書が、その顧客と同じ箱に住みます。

後からキーを変えるのは設定変更ではなくデータ移行です。すべての行をハッシュし直して動かすことになり、たいてい二重書き込みの期間とバックフィルが付いてきて、古いキーを前提に書いたクエリを全部見直すことになります。この選択に普通より多くの設計時間をかける理由がそれです。あなたは、このシステムが残りの一生で何を安く尋ねられるかを選んでいます。
