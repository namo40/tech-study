---
title: "Read Model"
summary: "Read Model は画面が求める形のまま保持しておくデータです。おかげでクエリは組み立て直しではなく引き当てで済みます。派生物であって正本ではなく、捨てて作り直せます。"
category: "アプリケーションアーキテクチャ"
scene: command-query-responsibility-segregation
sceneStep: 2
related:
  - label: CQRS
    slug: command-query-responsibility-segregation
  - label: Projection
    slug: projection
  - label: Materialized View
    slug: materialized-view
  - label: Eventual Consistency
    slug: eventual-consistency
  - label: No-Tracking Query
    slug: no-tracking-query
  - label: Denormalization
    slug: denormalization
  - label: Event Sourcing
    slug: event-sourcing
references:
  - title: CQRS pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/cqrs
  - title: Materialized View pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/materialized-view
  - title: Tracking vs. no-tracking queries
    url: https://learn.microsoft.com/en-us/ef/core/querying/tracking
---

書き込みモデルは不変条件を軸に作られます。注文は自分がどんな状態になってよいかを知っていて、注文にぶら下がるものはルールを守らせるためにそこにあります。画面はそのどれも求めていません。画面が欲しいのは注文番号、顧客名、合計、状態が 1 行に並んだ行で、しかも一度に 20 件です。それを書き込みモデルから作ろうとすると、関連を 3 つも 4 つもたどったうえで結果の大半を捨てることになります。ドメインが豊かになるほど同じ問いが高くつくのは、このためです。Read Model は問いをひっくり返します。問われる形のまま答えを保存しておけば、クエリは引き当てるだけの作業になります。

実際の Read Model は、データベースのビューや LINQ のプロジェクションとして始まり、ビューでは間に合わなくなって初めて自分のテーブルを持ちます。どちらにしても、クエリ側は `AsNoTracking()` で読み、`Select` でそのまま DTO に射影します。こうすると Entity Framework Core はエンティティを実体化せず、変更追跡のスナップショットも取らず、誰かが書き換えたくなるようなオブジェクトを渡しません。読み取り側がドメインへの 2 つ目の入口であることをやめ、本来の姿、つまり画面が形を決めた平たい行の集まりになるのが、ちょうどこの地点です。

保存方法よりも大事な性質が 2 つあります。Read Model は派生物なので、ルールを守らせる場所ではなく、突き合わせの基準になる正本でもありません。書き込み側と食い違ったら、正しいのは常に書き込み側です。そして Read Model は使い捨てにできるので、列を 1 つ足す作業はバックフィルつきのスキーマ移行ではなく、形を変えて再生し直す作業になります。どちらの性質も同じ規律から生まれます。Read Model に書き込むのは、それを所有する projection ただ 1 つだけにすることです。
