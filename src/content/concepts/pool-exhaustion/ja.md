---
title: "Pool Exhaustion"
summary: "Pool Exhaustion は、すべての接続が貸し出されてリクエストが列に並ぶ状態です。データベース自体はほとんど働いていないのに、アプリケーションが遅くなり失敗し始めます。"
category: "プールとリソース管理"
scene: database-connection-pool
sceneStep: 3
related:
  - label: Database Connection Pool
    slug: database-connection-pool
  - label: Maximum Pool Size
    slug: maximum-pool-size
  - label: Connection Timeout
    slug: connection-timeout
  - label: Bulkhead
    slug: bulkhead
references:
  - title: SQL Server connection pooling (ADO.NET)
    url: https://learn.microsoft.com/en-us/sql/connect/ado-net/connection-pooling
---

症状は遅いクエリではなく接続のタイムアウトです。リクエストはプールから接続を取得できなかったというメッセージとともに失敗し、レイテンシはなだらかな曲線ではなく階段状に跳ね上がります。それでもデータベース側のダッシュボードは穏やかです。CPU は低く、アクティブなセッションは少なく、詰まっているものもありません。

原因はほとんどつねにアプリケーション側にあります。業務ロジック全体にわたって開いたままのトランザクション、例外がブロックを飛ばしたせいで返されなかった接続、インデックスが変わってから遅くなったクエリ、オートスケールで増えたインスタンス数だけプロセスごとのプールが掛け算された状況などです。

2 つの数値を見ます。上限に対する使用中の接続の割合と、接続を待った時間です。どちらもエラーが出る前に飽和するので、得られるうちで最も早い警告になります。あわせて短い接続タイムアウトを置き、飽和したプールがリクエストを背後にため込むのではなく素早く失敗するようにします。
