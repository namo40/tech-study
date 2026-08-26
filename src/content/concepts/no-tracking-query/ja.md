---
title: "No-Tracking Query"
summary: "追跡しないクエリは、コンテキストが覚えないエンティティを返します。スナップショットも取らず、保存時に走査もされず、そのまま書き戻すこともできません。読み取りに必要なのはちょうどそれだけです。"
category: ".NET データアクセス"
scene: change-tracking
sceneStep: 3
related:
  - label: Change Tracking
    slug: change-tracking
  - label: Projection
    slug: projection
  - label: DbContext
    slug: dbcontext
  - label: N+1 Query
    slug: n-plus-1-query
  - label: Read Model
    slug: read-model
  - label: Materialized View
    slug: materialized-view
references:
  - title: Tracking vs. no-tracking queries
    url: https://learn.microsoft.com/en-us/ef/core/querying/tracking
  - title: Efficient querying (EF Core)
    url: https://learn.microsoft.com/en-us/ef/core/performance/efficient-querying
---

追跡はただではなく、これから画面に並べるだけの一覧がその代金をすべて払わされます。追跡するクエリが実体化したエンティティは 1 件ずつスナップショットに複写されてリクエストが終わるまでコンテキストに残り、その後 SaveChanges を呼ぶたびに、使いもしない値をひとつ残らず比較します。1,000 行の表ならスナップショット 1,000 個、保存 1 回につき比較 1,000 回。その画面には保存ボタンすらありません。

`AsNoTracking()` は両方の費用を消します。行はオブジェクトとして作られてそのまま返り、変更追跡器はそれを見ることもなく、コードが参照を手放した時点でメモリも解放されます。同一性の解決もなくなります。同じレコードを指す 2 行がオブジェクト 1 つではなく 2 つになるので、その分速くなりますが、参照の同一性に頼っていたなら驚くこともあります。

```csharp
// Reads: no snapshot, no scan, no write-back.
var page = await db.Orders.AsNoTracking()
    .Where(o => o.CustomerId == customerId)
    .OrderByDescending(o => o.CreatedAt)
    .Take(50)
    .ToListAsync(ct);

// A projection is never tracked, even without AsNoTracking.
var summaries = await db.Orders
    .Where(o => o.CreatedAt > since)
    .Select(o => new OrderSummary(o.Id, o.Status, o.Total))
    .ToListAsync(ct);

// Whole read-only context, when a service never writes.
options.UseQueryTrackingBehavior(QueryTrackingBehavior.NoTracking);
```

使える場面なら、射影のほうが既定値として優れています。DTO へ select すれば頼まなくても追跡されず、名前を書いた列だけを取り、あとで誤って `Update` に渡すこともありません。エンティティ型そのものが本当に必要なときに `AsNoTracking` を使い、追跡は要らないが行 1 件につきオブジェクト 1 つは保ちたいという狭い場面、たとえば同じ参照が繰り返し現れるグラフには `AsNoTrackingWithIdentityResolution` を使います。

覚えておく規則は 1 つです。追跡せずに取ったエンティティは、値を変えても保存されません。比べるスナップショットがないので、コンテキストには検出するものがありません。書く必要があるなら、最初から `AsNoTracking` を付けずに問い合わせるか、オブジェクトを Attach してから変えたいプロパティだけを印付けてください。HTTP リクエストで受け取った切り離されたエンティティが抱える問題とまったく同じです。
