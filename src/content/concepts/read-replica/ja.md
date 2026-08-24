---
title: "Read Replica"
summary: "Read replica は、クエリだけに答えて書き込みを受けないデータベースの複製です。primary から読み取りの負荷を外せる代わりに、返す行はどれも replication lag のぶんだけ古くなっています。"
category: "データ分散と一貫性"
scene: replication-lag
sceneStep: 1
related:
  - label: Replication Lag
    slug: replication-lag
  - label: Replication
    slug: replication
  - label: Read-Your-Writes
    slug: read-your-writes
  - label: Eventual Consistency
    slug: eventual-consistency
  - label: Load Balancer
    slug: load-balancer
  - label: Read Model
    slug: read-model
  - label: CQRS
    slug: command-query-responsibility-segregation
references:
  - title: Distributed data in cloud-native applications
    url: https://learn.microsoft.com/en-us/dotnet/architecture/cloud-native/distributed-data
  - title: Data store selection (Azure Architecture Center)
    url: https://learn.microsoft.com/en-us/azure/architecture/guide/technology-choices/data-stores-getting-started
---

たいていのアプリケーションは書き込みよりはるかに多く読み取りをしており、その読み取りの 1 つ 1 つが同じ機械の上で書き込みと競合します。Read replica はその競合をなくします。複製がクエリに答え、primary は変更を commit して送り出す仕事に専念できます。スキーマもクエリも変えずに済むので、リレーショナルデータベースが用意している中でいちばん安上がりな拡張であり、同じ理由でいちばん誤用されやすい手でもあります。

クエリを replica へ送るのは、たいていコードではなく接続文字列です。SQL Server では可用性グループのリスナーが `ApplicationIntent=ReadOnly` を読み、その接続を読み取り可能なセカンダリへ回します。PostgreSQL や MySQL では 2 本目の接続を replica のホストに向け、読み取り専用で開きます。アプリケーションの中では同じモデルの上の 2 つ目のコンテキストか 2 つ目のセッションファクトリになり、操作ごとにどちらを使うかを決めます。読み取り専用の側は本当に読み取り専用にしておくのがよい規律です。そうしておけば、紛れ込んだ `SaveChanges` がデータベースまで行かずにその場で失敗します。

こうして手に入れたのは容量であって、2 つ目の正解ではありません。replica は replication lag のぶんだけ後ろにいるので、少し前まで正しかった行で答えます。一覧、ダッシュボード、レポート、エクスポート、検索結果には十分で、結果が書き込みを決める読み取りには足りません。すでに置き換わったデータをもとに決めることになるからです。重複確認、残高確認、在庫数は primary に残します。

流量が乗ってきたら 2 つを見ておきます。1 つは遅れそのものです。クエリの負荷が重い replica は変更の適用も遅くなるので、いちばん忙しいときにいちばん古くなります。もう 1 つは応答しなくなったときの挙動です。読み取りは失敗するのではなく primary に切り替わるべきで、その切り替えは指標に出るべきです。静かに外れた replica は、primary の負荷が静かに倍になった姿として現れるからです。
