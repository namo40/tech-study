---
title: "DbContext"
summary: "DbContext はデータベースとのセッション 1 つです。借りている接続、追跡中のエンティティ、これからコミットする作業単位がここに収まります。作る費用は安く、スレッドセーフではなく、リクエスト 1 つ分だけ生きるように作られています。"
category: ".NET データアクセス"
scene: change-tracking
sceneStep: 3
related:
  - label: Change Tracking
    slug: change-tracking
  - label: Unit of Work
    slug: unit-of-work
  - label: No-Tracking Query
    slug: no-tracking-query
  - label: Database Connection Pool
    slug: database-connection-pool
  - label: Repository
    slug: repository
  - label: Local Transaction
    slug: local-transaction
references:
  - title: DbContext lifetime, configuration and initialization
    url: https://learn.microsoft.com/en-us/ef/core/dbcontext-configuration/
  - title: Change tracking in EF Core
    url: https://learn.microsoft.com/en-us/ef/core/change-tracking/
---

DbContext は 3 つの役目を同時に負っていて、これについての助言はたいていそこから出てきます。クエリの窓口なので、モデルとプールから借りた接続を持っています。変更追跡器なので、渡したエンティティごとのスナップショットを持っています。そして作業単位なので、次の SaveChanges でまとめてコミットされる変更を持っています。そこに収まるものはすべて自分自身だけのもので、2 つのインスタンスが何かを分け合うことはありません。

寿命をリクエストに合わせるのはそのためです。`AddDbContext` は既定でそう登録します。リクエストごとに自分のコンテキストを得て、空の変更追跡器から始まり、クエリが走る間だけ接続を借り、終われば破棄されます。作る費用はわざと安くしてあります。高いのは一度だけ組み立ててキャッシュされるモデルと、プールから来る接続だからです。

寿命を延ばしたときに出る症状は、急な停止ではなく、ゆっくり漏れることです。シングルトンとして登録されたコンテキストは、そこを通ったすべてのリクエストの追跡エンティティを溜め込むので、変更追跡器は際限なく大きくなり、SaveChanges のたびに膨らみ続ける集合を走査し、メモリーは最後まで返りません。もう 1 つの症状は同時実行です。DbContext は一度に 1 つの操作しか支えないので、同じインスタンスへの `await` が 2 つ並べば、互いに割り込む代わりに例外になります。

```csharp
// 既定はスコープ付きです。リクエストごとにコンテキスト 1 つ、変更追跡器は空、最後に破棄されます。
builder.Services.AddDbContext<ShopDbContext>(o => o.UseNpgsql(cs));

// バックグラウンドの処理にはスコープの元になるリクエストがないので、作業単位ごとに 1 つ作ります。
builder.Services.AddDbContextFactory<ShopDbContext>(o => o.UseNpgsql(cs));

public sealed class NightlyJob(IDbContextFactory<ShopDbContext> factory)
{
    public async Task RunAsync(CancellationToken ct)
    {
        await using var db = await factory.CreateDbContextAsync(ct);
        // ... 作業 1 単位、そのあとこのコンテキストは消えます
    }
}
```

健やかに保つ習慣が 2 つあります。1 つは、データベース呼び出しではない遅い処理をはさんでコンテキストを抱え込まないことです。接続もトランザクションも一緒に引きずられるからです。もう 1 つは、長く回るループに 1 つのコンテキストを何千回も共有させないことです。バッチごとに 1 つ作るか、バッチの合間に `ChangeTracker.Clear()` を呼んで、終わった仕事を変更追跡器が背負い続けないようにします。
