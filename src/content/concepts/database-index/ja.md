---
title: "Database Index"
summary: "データベースインデックスは、ある列のソート済みコピーに行を指すポインターが付いたものです。読み取りは走査をやめてシークになり、書き込みはソートを保つために少し余分に払います。そして同じ構造が一意性と速いページネーションまで静かに支えます。"
category: ".NET データアクセス"
scene: database-index
steps:
  - title: "スキャンは数え、シークはたどり着きます"
    text: "同じ質問を二度投げます。テーブルに対しては、一つを見つけるために八行すべてを読みます。その列のソート済みコピーに行ポインターが付いたインデックスに対しては、二歩とジャンプ一回で済みます。違いは速さではなく算数です。"
  - title: "速さは読み取りが買い、請求書は書き込みが払います"
    text: "挿入はテーブルの末尾に安く収まり、そのあとインデックスのソートを守るために少し余分に払います。インデックスをもう一つ置けば、すべての書き込みが二度払います。インデックスは無料ではなく、書き込みごとに請求されるサブスクリプションです。"
  - title: "インデックスに規則を与えると、保証になります"
    text: "unique の意味はこうです。挿し込むときにソート位置がすでに埋まっていたら、拒否せよ。検査と占有が一つの構造の中の一歩なので、競争する二つの挿入も両方勝つことはできません。この拒否こそ、重複防止が立つ足場です。"
  - title: "500 ページ目への二つの道です"
    text: "offset は捨てるために五千個のキーを数えながらインデックスを歩きます。次のページに行くほど値段が上がります。keyset は最後に見たキーへシークし、次の 20 個だけを読みます。同じページ、同じインデックスなのに、一方は数え、一方はたどり着きます。"
related:
  - label: N+1 Query
    slug: n-plus-1-query
  - label: Unique Constraint
    slug: unique-constraint
  - label: Offset Pagination
    slug: offset-pagination
  - label: Keyset Pagination
    slug: keyset-pagination
  - label: Cursor Pagination
    slug: cursor-pagination
  - label: Materialized View
    slug: materialized-view
  - label: No-Tracking Query
    slug: no-tracking-query
  - label: Prepared Statement
    slug: prepared-statement
  - label: Database Migration
    slug: database-migration
  - label: Idempotency-Key
    slug: idempotency-key
references:
  - title: SQL Server index architecture and design guide
    url: https://learn.microsoft.com/en-us/sql/relational-databases/sql-server-index-design-guide
  - title: Indexes (EF Core)
    url: https://learn.microsoft.com/en-us/ef/core/modeling/indexes
  - title: Pagination (EF Core)
    url: https://learn.microsoft.com/en-us/ef/core/querying/pagination
---

## いつ使うか

- クエリが実際に絞り込み、結合し、並べ替える列です。`WHERE`、`JOIN … ON`、`ORDER BY` に名前が出る列であって、ただ存在するだけの列ではありません。
- 外部キーです。結合で絶えず使われるのに、たいていのデータベースは宣言しただけではインデックスを作ってくれません。
- 追加する前に実行プランを読みます。seek ならインデックスに乗っており、scan なら乗っていません。これは願うことではなく、確かめられることです。

## 注意点

- インデックスはすべての書き込みに税をかけ、ストレージを使います。持っているものすべてではなく、問い合わせるものだけをインデックス化します。
- 複合インデックスの列の順序が、そのインデックスで何ができるかを決めます。使えるのは左端の接頭辞だけなので、`(TenantId, CreatedAt)` はテナントで絞るクエリと両方で絞るクエリを助けますが、日付だけで絞るクエリには何の役にも立ちません。
- 選択性の低い列はほとんど効きません。テーブルの半分が真になるフラグへのインデックスは、半分を読むための遅い方法にすぎません。
- 欠落インデックスのヒントや `EXPLAIN` は直感に勝ります。ただしヒントは一つのクエリの意見であって、テーブル全体の設計ではありません。重なり合う三つのヒントは、たいてい新しい三つのインデックスではなく一つの複合インデックスを意味します。
- インデックスは断片化し、統計は古くなります。前の四半期に正しかったプランが今日は誤りになることがあり、その理由はコードとは何の関係もありません。

## .NET では

```csharp
protected override void OnModelCreating(ModelBuilder builder)
{
    // 規則であり、同時に検索経路でもあります。
    builder.Entity<User>().HasIndex(u => u.Email).IsUnique();

    // 左端の接頭辞: TenantId 単独と TenantId + CreatedAt の両方を受けます。
    builder.Entity<Order>().HasIndex(o => new { o.TenantId, o.CreatedAt });
}

// 挿入がそのまま検査です。あいだに取りこぼす隙間がありません。
try
{
    db.Users.Add(new User { Email = email });
    await db.SaveChangesAsync(ct);
}
catch (DbUpdateException ex) when (ex.InnerException is SqlException { Number: 2601 or 2627 })
{
    return Results.Conflict();
}

// offset: データベースは 5020 行を並べ、そのうち 5000 行を捨てます。
var page = await db.Orders
    .OrderBy(o => o.Id)
    .Skip(5000)
    .Take(20)
    .ToListAsync(ct);

// keyset: 同じインデックスに、呼び出し側が最後に見たキーから入ります。
var next = await db.Orders
    .Where(o => o.Id > lastSeenId)
    .OrderBy(o => o.Id)
    .Take(20)
    .ToListAsync(ct);
```

`optionsBuilder.LogTo(Console.WriteLine, LogLevel.Information)` でクエリログを有効にし、データベースが選んだプランを読んでください。モデル設定はインデックスを要求するだけで、それを使うかどうかはオプティマイザーが決めます。そして keyset の並び順とインデックスをそろえておいてください。`(CreatedAt, Id)` で並べるクエリには `(CreatedAt, Id)` のインデックスが要り、そうでなければ書いたはずのシークが、避けたかった並べ替えに戻ってしまいます。
