---
title: "Deadlock"
summary: "デッドロックは、2 つのトランザクションが互いに相手の必要とするロックを握っていて、どちらも完了できない状態です。データベースは片方を殺して解き、コードの側はロックを 1 つの順序で取る、トランザクションを短く保つ、待っているあいだロックを握らない、といった方法で防ぎます。"
category: "トランザクションと同時実行"
scene: deadlock
steps:
  - title: "ロックは順序を作る"
    text: "別々の行を触る 2 つのトランザクションは並んで進みます。同じ行を求めると、2 つ目は 1 つ目の commit を待ちます。その待ちは正常で、短いものです。"
  - title: "デッドロック"
    text: "T1 は A を握って B を求め、T2 は B を握って A を求めます。どちらも動けません。データベースが循環に気づいて片方を殺し、生き残ったほうが完了します。犠牲になった側は再試行しなければなりません。"
  - title: "ロックは 1 つの順序で取る"
    text: "すべてのトランザクションが A の次に B をロックするなら、2 つ目は 1 つ目を待つだけで、循環は生まれません。トランザクションを短く保ち、その待ちも短くします。"
  - title: "そもそもロックを握らない"
    text: "行をバージョンごと読み、作業をし、バージョンが変わっていないときだけ書きます。競合は commit 時に検出されて再試行され、待っているあいだに握るロックはありません。"
related:
  - label: Lock
    slug: lock
  - label: Isolation Level
    slug: isolation-level
  - label: Pessimistic Concurrency
    slug: pessimistic-concurrency
  - label: Optimistic Concurrency
    slug: optimistic-concurrency
  - label: Row Version
    slug: row-version
  - label: Lost Update
    slug: lost-update
  - label: Concurrency Token
    slug: concurrency-token
  - label: Local Transaction
    slug: local-transaction
  - label: Retry
    slug: retry
references:
  - title: SQL Server deadlocks guide
    url: https://learn.microsoft.com/en-us/sql/relational-databases/sql-server-deadlocks-guide
  - title: Handling concurrency conflicts (EF Core)
    url: https://learn.microsoft.com/en-us/ef/core/saving/concurrency
  - title: Using transactions (EF Core)
    url: https://learn.microsoft.com/en-us/ef/core/saving/transactions
---

## いつ使うか

- リレーショナルデータベースに複数の書き手が同時にアクセスするシステムなら、いずれデッドロックに出会います。取り除けるバグではなく同時ロックの性質なので、起きないことを願うのではなく、起きる前提で設計します。
- 犠牲になった側を再実行します。デッドロックのエラーは定義上、一時的なものです。生き残ったトランザクションはすでに終わっているので、同じ処理は 2 回目でたいてい成功します。
- 同じ 2 つのテーブルが繰り返し衝突するならロック順序を決め、画面で 2 人のユーザーが同じ 1 行を編集した状況なら楽観的同時実行制御を使います。

## 注意点

- 規模が大きくなっても効く手はロック順序です。すべてのコードパスで行とテーブルを同じ順序で (たとえば主キー順で) 更新すれば、書き手がいくら増えても循環は生まれません。
- トランザクションは短く保ち、HTTP 呼び出しやメッセージ送信、ユーザーが考えている時間をまたいで開いたままにしません。ロックを握っている 1 秒は、別のトランザクションが到着して循環を始められる 1 秒でもあります。
- 集約 1 つを読んで書き換えて書き戻す処理なら楽観的同時実行制御が向き、競合が頻繁で再試行のほうが待つより高くつくなら短い悲観的ロックが向きます。
- デッドロックの再試行は作業単位の全体をやり直す必要があります。犠牲になったトランザクションは丸ごとロールバックされているので、失敗した文だけを送り直すと、もう存在しないトランザクションに書き込むことになります。
- データベースのデッドロック追跡を有効にしておきます。デッドロックグラフはどのセッション 2 つがどの資源 2 つを取り合ったかを教えてくれるので、勘に頼らず正しい 2 つのコードパスを直せます。

## .NET では

EF Core では 3 つがほとんどの仕事をします。行を一貫した順序で触ること、実行戦略で作業単位の全体を再試行すること、そしてロックで防ぐはずだった競合を `rowversion` 列に検出させることです。

```csharp
// 1. Consistent order: touch rows sorted by key, in every code path.
foreach (var id in ids.Order())
{
    var account = await db.Accounts.FindAsync([id], ct);
    account!.Balance += delta;
}

// 2. Retry the whole unit of work on transient failures, including deadlocks (SQL Server error 1205).
builder.Services.AddDbContext<BankDbContext>(o =>
    o.UseSqlServer(cs, sql => sql.EnableRetryOnFailure(maxRetryCount: 3)));

var strategy = db.Database.CreateExecutionStrategy();
await strategy.ExecuteAsync(async () =>
{
    await using var tx = await db.Database.BeginTransactionAsync(ct);
    await TransferAsync(db, from, to, amount, ct);
    await tx.CommitAsync(ct);
});

// 3. Optimistic concurrency: no lock across the think time, conflict detected at SaveChanges.
public sealed class Account
{
    public int Id { get; set; }
    public decimal Balance { get; set; }
    [Timestamp] public byte[] RowVersion { get; set; } = [];
}

try { await db.SaveChangesAsync(ct); }
catch (DbUpdateConcurrencyException ex)
{
    await ex.Entries.Single().ReloadAsync(ct);   // reload, reapply the change, retry
}
```

SQL Server で `READ_COMMITTED_SNAPSHOT` を有効にすると、ふつうのアプリケーションが遭遇するデッドロックの半分ほどが消えます。読み取りが共有ロックではなく行バージョンを取るようになり、書き込みを妨げなくなるからです。デッドロックグラフそのものは Extended Events で収集しておき、どの 2 つのコードパスが衝突したのかを推測ではなく事実として押さえます。
