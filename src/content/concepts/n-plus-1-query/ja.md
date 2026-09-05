---
title: "N+1 Query"
summary: "N+1 Query 問題は、一覧を読むクエリ 1 つのあとに、その行ごとにクエリが 1 つずつ加わることです。行が 5 件なら気づかず、5,000 件なら致命的になります。費用はデータではなく往復の回数だからです。"
category: ".NET データアクセス"
scene: n-plus-1-query
steps:
  - title: "N+1"
    text: "クエリ 1 つで一覧を読み、そのあとコードが行ごとに customer を 1 件ずつ別に問い合わせます。注文 5 件で往復 6 回です。"
  - title: "N に比例して増える"
    text: "同じコードが行 20 件では往復 21 回になり、時間のバーは端からはみ出します。開発用データはこれが見えるほど行が多くなく、本番データは多いのです。"
  - title: "Include"
    text: "関連する行を同じクエリで一緒に要求すると、データベースが JOIN でまとめてくれます。往復 1 回ですべてのデータです。コレクションを複数 Include するときは直積の爆発に注意します。"
  - title: "必要なものだけ読む"
    text: "Select でプロジェクションして使う列だけをやり取りするか、検索を 1 つの IN クエリにまとめます。そしてクエリログを読みましょう。往復を隠す ORM こそが本当の問題です。"
related:
  - label: Entity Framework Core
    slug: entity-framework-core
  - label: LINQ
    slug: linq
  - label: Change Tracking
    slug: change-tracking
  - label: No-Tracking Query
    slug: no-tracking-query
  - label: Compiled Query
    slug: compiled-query
  - label: Query Plan
    slug: query-plan
  - label: Database Index
    slug: database-index
  - label: Dapper
    slug: dapper
  - label: DataLoader
    slug: dataloader
  - label: Batching
    slug: batching
references:
  - title: Loading related data (EF Core)
    url: https://learn.microsoft.com/en-us/ef/core/querying/related-data/
  - title: Efficient querying (EF Core)
    url: https://learn.microsoft.com/en-us/ef/core/performance/efficient-querying
  - title: EF Core overview
    url: https://learn.microsoft.com/en-us/ef/core/
---

## いつ使うか

- ナビゲーションプロパティに触れる、`Find` を呼ぶ、要素ごとにクエリを実行する、そうしたループの形を探します。
- EF Core のログで、ページサイズに合わせて増えていくクエリ数
- ローカルでは速いのに本番では遅いエンドポイント。このときデータベースの CPU は低く、リクエスト数は多くなっています。

## 注意点

- `Include` も無料ではありません。コレクションを複数 Include すると行が掛け算になり直積の爆発が起きるので、`AsSplitQuery` を使うかプロジェクションで代えます。
- 遅延読み込みのプロキシは、ナビゲーションプロパティに触れるたびにクエリを出します。先行読み込みかプロジェクションを選び、どうしても必要になってから読み込むしかないなら明示的に読み込んで、費用を払うコードの中でそのクエリが見えるようにします。
- 読み取り専用のエンドポイントには `Select` のプロジェクションがたいてい最良の答えです。列が少なく、変更追跡がなく、クエリは 1 つです。
- テストでクエリをログに残して数を数え、一覧のエンドポイントではその数を表明します。

## .NET では

```csharp
// N+1 です。一覧に 1 本、そのあと行ごとに 1 本ずつ。
var orders = await db.Orders.ToListAsync(ct);
foreach (var order in orders)
{
    var customer = await db.Customers.FindAsync([order.CustomerId], ct); // 注文ごとに往復 1 回
    Console.WriteLine($"{order.Id}: {customer!.Name}");
}

// Include。JOIN を含むクエリ 1 本です。
var withCustomers = await db.Orders
    .Include(o => o.Customer)
    .ToListAsync(ct);

// Select。必要な列だけ、追跡なし、クエリ 1 本です。
var rows = await db.Orders
    .Select(o => new { o.Id, o.Total, Customer = o.Customer.Name })
    .ToListAsync(ct);
```

`optionsBuilder.LogTo(Console.WriteLine, LogLevel.Information)` でクエリログを有効にし、1 つのクエリでコレクションを複数 Include するときは `AsSplitQuery()` を使います。そうすれば EF Core は巨大な JOIN 1 つではなく、コレクションごとにクエリを分けて送ります。
