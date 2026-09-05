---
title: "Connection Timeout"
summary: "connection timeout は、依存先から答えを引き出す時間ではなく依存先までたどり着く時間に設ける上限であり、だからこそ呼び出しそのものを覆う設定とは別物です。"
category: "回復性と障害対応"
scene: request-timeout
sceneStep: 2
related:
  - label: Request Timeout
    slug: request-timeout
  - label: Timeout
    slug: timeout
  - label: Deadline
    slug: deadline
  - label: Database Connection Pool
    slug: database-connection-pool
  - label: Pool Exhaustion
    slug: pool-exhaustion
  - label: Maximum Pool Size
    slug: maximum-pool-size
  - label: Idle Timeout
    slug: idle-timeout
  - label: Retry
    slug: retry
references:
  - title: SocketsHttpHandler.ConnectTimeout
    url: https://learn.microsoft.com/en-us/dotnet/api/system.net.http.socketshttphandler.connecttimeout
  - title: Build resilient HTTP apps with .NET
    url: https://learn.microsoft.com/en-us/dotnet/core/resilience/http-resilience
  - title: SqlConnection connection string keywords
    url: https://learn.microsoft.com/en-us/sql/connect/ado-net/connection-string-syntax
---

接続を開くことと接続を使うことは失敗の仕方が違うので、上限も別に設けます。接続の試行は DNS 解決、TCP ハンドシェイク、そしてたいていは TLS ハンドシェイクからなり、そのどれにも依存先のアプリケーションコードは関わっていません。ホストが消えている、経路がブラックホールになっている、ファイアウォールがパケットを拒否せずに捨てている、といった場合、接続は失敗せずに止まったままになります。オペレーティングシステム自身の再試行スケジュールが終わるまでで、プラットフォームによってはそれが 1 分を優に超えます。connection timeout はまさにこの場合のためにあり、呼び出しごとに大きめに取ったタイムアウトがこの区間を覆えない理由でもあります。`HttpClient` では `SocketsHttpHandler.ConnectTimeout` がその役を担い、既定値は `Timeout.InfiniteTimeSpan` です。つまり上限は自分で設定してはじめて存在し、それまではオペレーティングシステムのスケジュールだけが唯一の制限です。SQL Server では接続文字列の `Connect Timeout` がその役を担い、こちらには既定値があります。15 秒です。

呼び出し全体ではなく 1 つの段階だけを覆うので、connection timeout は短くあるべきです。同じネットワーク内の健全なホストに届くのは 1 桁ミリ秒、リージョンをまたいでも数十ミリ秒です。1 秒か 2 秒で終わらない接続は遅いのではなく壊れているので、すぐに失敗させて、呼び出し側が別のエンドポイントを試すかリクエストを捨てられるようにするのが有効な対応です。再試行がおおむね安全な上限もここだけです。まだ何も送っていないのだから、途中まで適用された状態がありえません。

紛らわしくなるのはプールを使うクライアントです。外から見ると、まったく別の 2 つの待ちが同じに見えるからです。接続が確立されるのを待っているのは connection timeout です。プールが最大サイズに達してすべての接続が使用中のため空きが出るのを待っているのはプールの待ち時間で、これは別の設定であり、別の直し方をします。データベースが暇で健全なのに接続エラーに見える失敗が出始めたら、見るべきはネットワークではなくプールです。connection timeout を上げても、列が長くなるだけです。
