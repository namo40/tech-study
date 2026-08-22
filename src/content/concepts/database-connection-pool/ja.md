---
title: "Database Connection Pool"
summary: "Connection Pool は開いたままのデータベース接続をいくつか保持して貸し出し、リクエストが遅いハンドシェイクを省けるようにします。プールの大きさはそのまま同時実行の予算です。すべての接続が使用中なら次のリクエストは待ち、待ちすぎれば失敗します。"
category: "プールとリソース管理"
scene: database-connection-pool
steps:
  - title: "開くのは遅い"
    text: "新しい接続には TCP ハンドシェイク、TLS、ログインが伴います。プールはその代価を一度だけ払い、接続を開いたままにします。"
  - title: "再利用"
    text: "すべてのリクエストが開いた接続を借りて返します。2 本の接続で流れ全体をさばき、データベースは新しいログインを一度も見ません。"
  - title: "枯渇"
    text: "すべての接続が使用中なら、新しいリクエストは列に並びます。プールの上限はデータベースに対する同時実行の予算で、Timeout を超えて待つと失敗します。"
  - title: "遅く開き、早く返す"
    text: "アプリケーションがほかの作業をするあいだ握ったままの接続は、誰も使えない接続です。クエリのあいだだけ借りてすぐ返せば、同じ 4 本でずっと多くをさばけます。"
related:
  - label: ADO.NET Connection Pooling
    slug: ado-net-connection-pooling
  - label: Minimum Pool Size
    slug: minimum-pool-size
  - label: Maximum Pool Size
    slug: maximum-pool-size
  - label: Connection Lifetime
    slug: connection-lifetime
  - label: Connection Timeout
    slug: connection-timeout
  - label: Pool Exhaustion
    slug: pool-exhaustion
  - label: DbContext Pool
    slug: dbcontext-pool
  - label: Bulkhead
    slug: bulkhead
  - label: Concurrency Limiter
    slug: concurrency-limiter
  - label: Timeout
    slug: timeout
references:
  - title: SQL Server connection pooling (ADO.NET)
    url: https://learn.microsoft.com/en-us/sql/connect/ado-net/connection-pooling
  - title: EF Core overview
    url: https://learn.microsoft.com/en-us/ef/core/
  - title: Bulkhead pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/bulkhead
---

## いつ使うか

- リレーショナルデータベースを使うなら、つねに使います。ADO.NET のプロバイダーは既定でプールを使い、EF Core もその上に乗って同じプールを使います。
- 問題はプールを使うかどうかではなく、大きさをどう決めるかです。プールはプロセスごと、接続文字列ごとに 1 つできるので、データベース全体の接続予算を動かすインスタンスの数だけ分け与える必要があります。

## 注意点

- 遅く開き、早く返します。リクエストが終わるまで、長いトランザクションのあいだ、データベースと関係のない `await` のあいだ、接続を握ったままにしません。
- `Max Pool Size` はプロセス単位です。既定値 100 のインスタンスが 10 台あれば、200 をさばけるデータベースに対して 1,000 本の接続を開けてしまいます。
- プールで待った時間は、遅いクエリではなく接続の Timeout として現れます。待ち時間とプール使用率を、それ自体ひとつのメトリクスとして見ます。
- 大文字小文字やオプションの順序だけが違う接続文字列は、別々のプールを作ります。

## .NET では

```csharp
// Pool per connection string, per process. Size it from the database's budget.
const string Cs =
    "Server=db;Database=shop;User Id=app;Password=...;" +
    "Min Pool Size=2;Max Pool Size=20;Connect Timeout=5;Connection Lifetime=300";

public async Task<Order?> FindAsync(int id, CancellationToken ct)
{
    // Open late: the connection is borrowed here...
    await using var connection = new SqlConnection(Cs);
    await connection.OpenAsync(ct);

    await using var command = connection.CreateCommand();
    command.CommandText = "SELECT Id, Total FROM Orders WHERE Id = @id";
    command.Parameters.AddWithValue("@id", id);

    await using var reader = await command.ExecuteReaderAsync(ct);
    return await reader.ReadAsync(ct) ? new Order(reader.GetInt32(0), reader.GetDecimal(1)) : null;
    // ...and returned to the pool here, when the using block ends.
}
```

EF Core の `DbContext` もこの ADO.NET のプールをそのまま使うので、`DbContext` を短く使うことがそのまま接続を短く使うことになります。`AddDbContextPool` はまた別の話で、接続ではなく `DbContext` オブジェクトを再利用します。
