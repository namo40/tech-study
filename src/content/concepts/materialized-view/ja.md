---
title: "Materialized View"
summary: "マテリアライズドビューは高価なクエリの結果を実際のテーブルとして保存し、読み手がスキャンではなく計算済みの行を受け取れるようにします。更新の合間は古い値になるため、どう、いつ更新するかが設計のすべてです。"
category: "データストア"
scene: materialized-view
steps:
  - title: "毎回 100 万行"
    text: "ダッシュボードを開くたびにテーブル 3 つを JOIN し、100 万行を集計して 30 行を作ります。答えは 1 分前と同じですが、仕事はそのままです。"
  - title: "答えを実体化する"
    text: "高価なクエリを一度だけ実行し、その 30 行をテーブルとして保存します。ダッシュボードは 30 行を読むだけになり、データベースは 100 万行の仕事をリクエストごとではなく一度だけ行います。"
  - title: "更新の合間は古い"
    text: "新しい注文は元のテーブルに入りますが、ビューは更新されるまで最後に受け取った行で答えます。数分の遅れが許されるならスケジュールで、許されないなら書き込みごとに増分で更新します。"
  - title: "何を実体化するか"
    text: "ビューはストレージと更新の作業を消費するので、絶えず繰り返され、更新の遅れを許容できる少数の質問だけを実体化します。ほかはそのままクエリにしておきます。"
related:
  - label: Read Model
    slug: read-model
  - label: Projection
    slug: projection
  - label: CQRS
    slug: command-query-responsibility-segregation
  - label: Cache-Aside
    slug: cache-aside
  - label: N+1 Query
    slug: n-plus-1-query
  - label: Data Warehouse
    slug: data-warehouse
  - label: Database Index
    slug: database-index
  - label: Query Plan
    slug: query-plan
  - label: Eventual Consistency
    slug: eventual-consistency
references:
  - title: Materialized View pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/materialized-view
  - title: Keyless entity types (EF Core)
    url: https://learn.microsoft.com/en-us/ef/core/modeling/keyless-entity-types
  - title: Create indexed views (SQL Server)
    url: https://learn.microsoft.com/en-us/sql/relational-databases/views/create-indexed-views
---

## いつ使うか

- 同じ高価な集計や JOIN が、その入力が変わる頻度よりはるかに多く要求されるとき。1 時間に 2 回も書き込まれないテーブルを、10 人が 1 分ごとにダッシュボードで開くような場合が最もはっきりした例です。
- 読み手が更新の遅れを許容できるとき、またはデータベースがビューを増分で維持でき、遅れがほとんど出ないとき。
- 計算済みの結果を、アプリケーションのキャッシュではなくデータベースの中でクエリしたり JOIN したりしたいとき。ビューにはインデックスを張り、JOIN し、権限を与えられますが、キャッシュのエントリはキーで取り出すことしかできません。

## 注意点

- マテリアライズドビューは設計上、古い値です。ダッシュボードの数字の隣に更新間隔を書いてください。時刻の付かない数字はリアルタイムの値として読まれます。
- 更新は本物の仕事です。負荷の低い時間帯に回し、更新中も読み手が止まらないよう concurrent か増分の更新を使い、クエリと同じように所要時間を見張ってください。
- SQL Server の indexed view は、元のテーブルへの書き込みごとに維持されます。その費用は恩恵を受ける読み手ではなく書き手が負担します。シーンの最後のステップが扱っているのは、この取引です。
- すべてを実体化しないでください。クエリログの上位いくつかから始め、残りの長い尾は普通のクエリのままにしておきます。
- ビューはインデックスの代わりではありません。支えるインデックスがないせいでクエリが遅いのなら、まずインデックスを追加し、そのうえで実体化するものが残るかを見てください。

## .NET では

PostgreSQL はビューをインデックスの張れるテーブルとして保存し、`REFRESH MATERIALIZED VIEW CONCURRENTLY` は読み手が古い行を読み続けているあいだに中身を書き直します。この concurrent の形を使うには一意インデックスが必要です。

```sql
CREATE MATERIALIZED VIEW sales_by_day AS
SELECT date_trunc('day', o.placed_at) AS day, SUM(i.quantity * i.unit_price) AS total
FROM orders o JOIN order_items i ON i.order_id = o.id
GROUP BY 1;
CREATE UNIQUE INDEX ON sales_by_day (day);   -- required for REFRESH ... CONCURRENTLY
```

EF Core はこのビューをキーなしエンティティとしてマッピングするので、読み側は JOIN がひとつもない 30 行の普通の `DbSet` になります。更新はホステッドサービスが、ダッシュボードに掲げた間隔どおりに引き受けます。

```csharp
public sealed class SalesByDay { public DateTime Day { get; init; } public decimal Total { get; init; } }

modelBuilder.Entity<SalesByDay>().HasNoKey().ToView("sales_by_day");

// Readers: thirty rows, no joins.
var rows = await db.Set<SalesByDay>().OrderByDescending(r => r.Day).Take(30).ToListAsync(ct);

// A scheduled job refreshes it; readers keep reading the old rows while it runs.
public sealed class SalesViewRefresher(IServiceScopeFactory scopes) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(5));
        while (await timer.WaitForNextTickAsync(ct))
        {
            using var scope = scopes.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ShopDbContext>();
            await db.Database.ExecuteSqlRawAsync("REFRESH MATERIALIZED VIEW CONCURRENTLY sales_by_day", ct);
        }
    }
}
```

SQL Server はシーンの増分のほうを別の書き方で表します。ビューを `WITH SCHEMABINDING` で作り、一意クラスター化インデックスを付ければ、エンジンが元のテーブルへの書き込みごとにビューを維持します。動かす更新ジョブも、説明すべき遅れもありません。その代わり、`orders` への INSERT ごとに集計の一部を一緒に払うことになります。
