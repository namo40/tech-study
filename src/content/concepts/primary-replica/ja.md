---
title: "Primary-Replica"
summary: "一台が書き込みを受け、残りはそれがしたことを写します。この区別は配線ではなく一つの言葉であり、だからこそ最初の一台が止まったとき、その言葉を別のマシンへ移せます。"
category: "データ分散と一貫性"
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
    url: https://learn.microsoft.com/en-us/azure/azure-sql/database/auto-failover-group-sql-db
  - title: "Failover and load balancing (Npgsql)"
    url: https://www.npgsql.org/doc/failover-and-load-balancing.html
---

シーンの 1 段階目を見ると、二つの箱を隔てているものがいかに少ないかが分かります。大きさは同じ、持っているデータも同じ、動いているソフトウェアも同じで、描かれ方まで同じです。一方は `primary` と言い、もう一方は `replica` と言い、その間の矢印が前者から後者を指しています。その言葉とその矢印が、この仕組みのすべてです。4 段階目がその証拠になります。言葉が移り、矢印が向きを変えても、どちらのマシンについても、いま何であれと求められているか以外に変わったところはありません。

書き込みはちょうど一か所へ行きます。これはパターンが仕方なく受け入れている制約ではなく、パターンの筋を通しているまさにその条件です。書く側が一つだということは、変更が起きた順序が一つだということであり、replica はその順序が何であったかを誰とも交渉する必要がありません。ただ再生すればよいのです。二台がどちらも書き込みを受けた瞬間、そこにあるのは複製ではなく二つの歴史になり、後から二つの歴史を突き合わせるのは、名前の違う、そしてはるかに難しい問題になります。

自由があるのは読み取りの側です。同じ行を持っている replica は、primary をまったく巻き込まずに読み取りへ答えられます。この構成が、障害を心配するよりずっと前から現れる理由がそこにあります。読み取りの容量が足りなくなったデータベースに容量を足す、いちばん安い方法だからです。引っかかるのは矢印を渡る時間です。replica は複製が渡ってくる分だけ遅れているので、そこで答えられた読み取りはごく近い過去の読み取りです。1 段階目が見せているのはまさにそれで、書き込みが確定すると `behind` のチップが 1 になり、複製が着くとまた 0 に戻ります。

役割を分けておくことは、そもそも昇格を可能にしている条件でもあり、持ち帰る価値があるのはこの点です。replica はそれまでずっと primary の変更を適用してきたので、すでに候補です。昇格は復元でも再構築でもありません。ラベルを付け替える作業であり、言葉を一つ書くのと同じくらいの時間しかかかりません。バックアップをストレージへ送っていただけのマシンなら、何時間と慎重な運用者が要ります。replica に要るのは決定一つです。

覚えておく非対称はこれです。replica での読み取りは安くて安全ですが、書き込みにつながる読み取りはそのどちらでもありません。replica を相手にした読んで直して書く処理は、primary ではすでに置き換わっている値を読み、まだ誰も見ていない変更の上に書きます。しかもどこにもエラーは出ません。そうした読み取りは primary へ送ってください。この規則の要点はデータが少し古いことではなく、古いデータで下した決定が新しく権威ある事実になってしまうことにあります。

最後に現実的な話を一つ。一度も読んだことのない replica は、一度も試したことのない replica です。必要になる日までは健全に見え、その日になってはじめて、ディスクが埋まりかけていたこと、スキーマ変更が届いていなかったこと、どれだけ遅れているかを誰も見ていなかったことを知ります。容量が要らなくても実際の読み取りトラフィックをいくらか流しておく価値はあります。負荷を受けている replica は、いちばん悪い瞬間に一度ではなく、自分についての事実を絶えず教えてくれるからです。
