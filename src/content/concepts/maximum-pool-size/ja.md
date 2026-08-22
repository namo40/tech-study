---
title: "Maximum Pool Size"
summary: "Maximum Pool Size は、1 つのプロセスが 1 つの接続文字列で開ける接続数を制限します。データベース全体の予算をインスタンスごとに配る方法です。"
category: "プールとリソース管理"
scene: database-connection-pool
sceneStep: 3
related:
  - label: Database Connection Pool
    slug: database-connection-pool
  - label: Minimum Pool Size
    slug: minimum-pool-size
  - label: Pool Exhaustion
    slug: pool-exhaustion
references:
  - title: SQL Server connection pooling (ADO.NET)
    url: https://learn.microsoft.com/en-us/sql/connect/ado-net/connection-pooling
---

この上限はアプリケーション単位ではなく、プロセス単位かつ接続文字列単位です。SQL Server プロバイダーの既定値は 100 で、1 つのプロセスには十分ですが、20 個ともなれば無謀な値です。

データベースが支えられる数から始めて、マイグレーション、管理ツール、バックグラウンド処理が使う分を引き、いま動かしているインスタンス数ではなくピーク時に動かすインスタンス数で割ります。オートスケールで台数が 3 倍になりうるなら、プロセスごとの上限は 3 倍になった状態を前提にしなければなりません。

上限を超えてもすぐに拒否されるわけではありません。リクエストは `Connect Timeout` が尽きるまでプールの中で並び、そのあとでようやく失敗します。だからこそ、小さくしすぎたプールは遅いアプリケーションのように見え、大きくしすぎたプールはデータベースが新しいログインを拒む瞬間まで問題なく見えます。
