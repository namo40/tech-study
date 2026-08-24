---
title: "Replication"
summary: "Replication は、データの複製をもう 1 台の機械に持ち、すべての変更をそちらへ送って最新に保つことです。読み取りの容量と、切り替え先になる機械が手に入り、代わりに 2 つの複製が食い違う時間帯を抱えます。"
category: "データ分散と一貫性"
scene: replication-lag
related:
  - label: Replication Lag
    slug: replication-lag
  - label: Read Replica
    slug: read-replica
  - label: Primary-Replica
    slug: primary-replica
  - label: Failover
    slug: failover
  - label: RPO
    slug: rpo
  - label: Eventual Consistency
    slug: eventual-consistency
  - label: Materialized View
    slug: materialized-view
references:
  - title: Distributed data in cloud-native applications
    url: https://learn.microsoft.com/en-us/dotnet/architecture/cloud-native/distributed-data
  - title: Data store selection (Azure Architecture Center)
    url: https://learn.microsoft.com/en-us/azure/architecture/guide/technology-choices/data-stores-getting-started
---

1 台の機械がデータを持ち、書き込みを受けます。Replication は、その機械が commit したすべての変更をもう 1 台にも送り、受け取った側が同じ変更を同じ順序で適用して同じ行を持つようにする構成です。この複製が役に立つ理由は 3 つあり、分けて考えておくとよいものです。読み取りに答えられること、最初の機械が失われたときに昇格できること、そして別のリージョンに置けばその地域全体の障害を生き延びられることです。3 つとも欲しい設計なら、たいていは目的ごとに別の replica が要ります。

多くの人が最初に出会う形は primary-replica です。1 台がすべての書き込みを受け、1 台以上の複製がそれを追いかけます。もう 1 つの選択肢は複数の機械が同時に書き込みを受ける方式で、書き込みの詰まりを 1 つなくす代わりに、衝突の解決を引き受けます。2 台が互いの変更を知る前に同じ行を変えられるようになるからです。所有者や地域で自然に分かれるデータなら見合う取り引きで、ユーザーが 1 つの値を期待するデータでは損な取り引きです。

もう 1 つの選択は、primary が書き込みをいつ終わったものとみなすかです。非同期レプリケーションは primary が変更を持った時点で commit し、送るのはその後です。書き込みは速いままで、primary が落ちるとまだ送っていないぶんが失われます。同期レプリケーションは 2 台目の確認を得てから commit を返します。昇格のときに失うものはなく、すべての書き込みが往復ぶんの代償を払うので、遅い replica や届かない replica はそのまま遅い書き込みや失敗する書き込みになります。ほとんどのデータベースは中間の方式も用意しており、複数の replica のうち 1 つの確認だけを待つようにすれば、よくある場合は速いまま、失う量には上限を置けます。

どれを選んでも複製はいくらか遅れており、その遅れは目に見える数字であるべきです。書き込みが少なければ小さく、集中や長いトランザクションで伸び、読み取りがどこまで古くなりうるかと、failover がどれだけ失いうるかの両方を決めます。
