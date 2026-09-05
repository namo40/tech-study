---
title: "Change Tracking"
summary: "変更追跡とは、DbContext が渡したエンティティをすべて覚えておき、SaveChanges のときにスナップショットと比べて、変わったものだけを 1 つのトランザクションで書く仕組みです。同時に、変更するつもりのなかったクエリにまで代金を払わされる部分でもあります。"
category: ".NET データアクセス"
scene: change-tracking
steps:
  - title: "覚えて、比べて、差分だけ書く"
    text: "クエリが返すすべてのエンティティは、値のスナップショットとともに追跡されます。プロパティを変えてもまだ何も起きません。SaveChanges が比較し、エンティティを Modified にして、変わった 1 列だけの UPDATE を送ります。"
  - title: "1 つの作業単位"
    text: "好きなだけ追加し、削除し、変更してください。SaveChanges までは何もデータベースに届かず、SaveChanges はすべての文を 1 つのトランザクションの中で送ります。どれか 1 つでも失敗すれば何も反映されず、変更追跡器は変更をそのまま保持しています。"
  - title: "変えるものだけ追跡する"
    text: "1,000 行を返す読み取り専用クエリは変更追跡器を 1,000 個のスナップショットで満たし、SaveChanges のたびにそれらを走査します。AsNoTracking は変更追跡器を完全に飛ばします。そして DbContext の寿命はリクエスト 1 つです。長生きするコンテキストは何も忘れません。"
  - title: "切り離されたエンティティと失われる更新"
    text: "外から来たエンティティにはスナップショットがないので、Update はすべての列を Modified にします。Attach してから意図したプロパティだけを印付けましょう。そして同時実行トークンを加えると、UPDATE は読んだときのバージョンを確認し、影響行数 0 は他の誰かが先に保存したという意味になります。"
related:
  - label: No-Tracking Query
    slug: no-tracking-query
  - label: Unit of Work
    slug: unit-of-work
  - label: DbContext
    slug: dbcontext
  - label: Optimistic Concurrency
    slug: optimistic-concurrency
  - label: Repository
    slug: repository
  - label: Projection
    slug: projection
  - label: N+1 Query
    slug: n-plus-1-query
  - label: Local Transaction
    slug: local-transaction
  - label: Lost Update
    slug: lost-update
references:
  - title: Change tracking in EF Core
    url: https://learn.microsoft.com/en-us/ef/core/change-tracking/
  - title: Tracking vs. no-tracking queries
    url: https://learn.microsoft.com/en-us/ef/core/querying/tracking
  - title: Handling concurrency conflicts (EF Core)
    url: https://learn.microsoft.com/en-us/ef/core/saving/concurrency
---

## いつ使うか

- EF Core で読み込み、変更し、保存する流れの既定値です。エンティティを読み、プロパティを変え、作業単位ごとに SaveChanges を 1 回呼びます。
- 読み取り専用のクエリには使いません。`AsNoTracking` を使うか、DTO へプロジェクションしてください。プロジェクションはどちらにしても追跡されません。
- 複数の変更がまとめて成功するかまとめて失敗する必要があるときに使います。SaveChanges 自体がすでにトランザクションなので、作業単位をつくるのに追加の費用はかかりません。

## 注意点

- リクエスト 1 つ、あるいは作業単位 1 つにつき DbContext を 1 つ。スレッドセーフではなく、一度追跡したものを自分から忘れることもありません。
- SaveChanges は変更のたびではなく、最後に 1 回だけ呼びます。呼び出し 1 回がトランザクション 1 つであり、往復 1 回です。
- 切り離されたエンティティへの `Update()` はすべての列を書くので、クライアントが触ってもいないフィールドに他人が入れた値まで上書きしかねません。Attach してから特定のプロパティだけを印付けるか、行を読み込んでから変更してください。
- 2 人以上が編集しうるものには `rowversion` のような同時実行トークンを加え、`DbUpdateConcurrencyException` は再読み込みして再試行するか、マージして処理します。
- 追跡する結果セットが大きいと `DetectChanges` が遅くなります。保存のたびに、追跡中のエンティティ 1 件につき 1 回走査するからです。大量処理には `AsNoTracking`、プロジェクション、または `ChangeTracker.AutoDetectChangesEnabled = false` を使ってください。
- 追跡されるエンティティは 1 つのコンテキストの中での同一性です。同じ行を 2 回問い合わせれば同じオブジェクトが返りますが、これがコンテキストをまたいでも成り立つと思い込んだ時点で問題になります。

## .NET では

EF Core は既定で追跡します。クエリがエンティティを実体化したときに取るスナップショットが `SaveChanges` の比較対象であり、その差分が UPDATE です。

```csharp
// 追跡あり。読み込み、変更し、その差分を保存します。
var order = await db.Orders.FindAsync([12], ct);
order!.Status = OrderStatus.Paid;
await db.SaveChangesAsync(ct);          // UPDATE orders SET status = @p0 WHERE id = 12 AND rowversion = @p1

// 読み取り専用。変更追跡を通しません。
var recent = await db.Orders.AsNoTracking()
    .Where(o => o.CreatedAt > since)
    .Select(o => new OrderSummary(o.Id, o.Status, o.Total))   // projection は決して追跡されません
    .ToListAsync(ct);

// API リクエストから来た切り離し済みのエンティティ。クライアントが変えてよい分だけに印を付けます。
db.Orders.Attach(incoming);
db.Entry(incoming).Property(o => o.Note).IsModified = true;
try
{
    await db.SaveChangesAsync(ct);
}
catch (DbUpdateConcurrencyException)
{
    // 誰かが先に保存しています。読み直すか、値を突き合わせるか、ユーザーに伝えます
}

// モデル側の同時実行トークン。
modelBuilder.Entity<Order>().Property(o => o.RowVersion).IsRowVersion();
```

`AddDbContext` は scoped の寿命で登録するため、リクエストごとに新しいコンテキストが作られ、変更追跡器も空の状態から始まります。バックグラウンド処理には寿命を預けるリクエストがないので、長生きするコンテキストを抱え込まず、`IDbContextFactory<T>` で作業単位ごとに 1 つずつ作ってください。
