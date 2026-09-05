---
title: "Primary-Replica"
summary: "1 台が書き込みを受け、残りはそれがしたことを写します。この区別は配線ではなく 1 つの言葉であり、だからこそ最初の 1 台が止まったとき、その言葉を別のマシンへ移せます。"
category: "データ分散と整合性"
scene: failover
sceneStep: 1
related:
  - label: Failover
    slug: failover
  - label: Replication
    slug: replication
  - label: Replication Lag
    slug: replication-lag
  - label: Heartbeat
    slug: heartbeat
  - label: Quorum
    slug: quorum
  - label: Leader Election
    slug: leader-election
  - label: Split Brain
    slug: split-brain
  - label: Lease TTL
    slug: lease-ttl
  - label: Singleton Worker
    slug: singleton-worker
  - label: Eventual Consistency
    slug: eventual-consistency
references:
  - title: "Availability modes (Always On availability groups)"
    url: https://learn.microsoft.com/en-us/sql/database-engine/availability-groups/windows/availability-modes-always-on-availability-groups
  - title: "Auto-failover groups (Azure SQL Database)"
    url: https://learn.microsoft.com/en-us/azure/azure-sql/database/failover-group-sql-db
  - title: "Failover and load balancing (Npgsql)"
    url: https://www.npgsql.org/doc/failover-and-load-balancing.html
---

シーンの 1 番目のステップを見ると、2 つの箱を隔てているものがいかに少ないかが分かります。大きさは同じ、持っているデータも同じ、動いているソフトウェアも同じで、描かれ方まで同じです。一方は `primary` と言い、もう一方は `replica` と言い、その間の矢印が前者から後者を指しています。その言葉とその矢印が、この仕組みのすべてです。4 番目のステップがその証拠になります。言葉が移り、矢印が向きを変えても、どちらのマシンも、いまどの役割を求められているか以外は何も変わっていません。

書き込みはちょうど 1 か所へ行きます。これはパターンが仕方なく受け入れている制約ではなく、パターンの筋を通しているまさにその条件です。書く側が 1 つだということは、変更が起きた順序が 1 つだということであり、レプリカはその順序が何であったかを誰とも交渉する必要がありません。ただ再生すればよいのです。2 台がどちらも書き込みを受けた瞬間、そこにあるのは複製ではなく 2 つの歴史になり、後から 2 つの歴史を突き合わせるのは、名前の違う、そしてはるかに難しい問題になります。

自由があるのは読み取りの側です。同じ行を持っているレプリカは、プライマリをまったく巻き込まずに読み取りへ答えられます。この構成が、障害を心配するよりずっと前から現れる理由がそこにあります。読み取りの容量が足りなくなったデータベースに容量を足す、いちばん安い方法だからです。引っかかるのは矢印を渡る時間です。レプリカは複製が渡ってくる分だけ遅れているので、そこで答えられた読み取りはごく近い過去の読み取りです。1 番目のステップが見せているのはまさにそれで、書き込みがコミットすると `behind` のチップが 1 になり、複製が着くとまた 0 に戻ります。

役割を分けておくことは、そもそも昇格を可能にしている条件でもあり、持ち帰る価値があるのはこの点です。レプリカはそれまでずっとプライマリの変更を適用してきたので、すでに候補です。昇格は復元でも再構築でもありません。ラベルを付け替える作業であり、言葉を 1 つ書くのと同じくらいの時間しかかかりません。バックアップをストレージへ送っていただけのマシンなら、何時間と慎重な運用者が要ります。レプリカに要るのは決定 1 つです。

覚えておく非対称はこれです。レプリカでの読み取りは安くて安全ですが、書き込みにつながる読み取りはそのどちらでもありません。レプリカを相手にした読んで直して書く処理は、プライマリではすでに置き換わっている値を読み、まだ誰も見ていない変更の上に書きます。しかもどこにもエラーは出ません。そうした読み取りはプライマリへ送ってください。この規則の要点はデータが少し古いことではなく、古いデータで下した決定が新しく権威ある事実になってしまうことにあります。

最後に現実的な話を 1 つしておきます。一度も読んだことのないレプリカは、一度も試したことのないレプリカです。必要になる日までは健全に見え、その日になってはじめて、ディスクが埋まりかけていたこと、スキーマ変更が届いていなかったこと、どれだけ遅れているかを誰も見ていなかったことを知ります。容量が要らなくても実際の読み取りトラフィックをいくらか流しておく価値はあります。負荷を受けているレプリカは、いちばん悪い瞬間に一度ではなく、自分についての事実を絶えず教えてくれるからです。
