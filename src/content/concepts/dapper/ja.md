---
title: "Dapper"
summary: "Dapper はマイクロ ORM です。SQL は自分たちが書き、結果の行をオブジェクトへ対応付けてくれることが仕事のすべてです。翻訳も変更の追跡もないので速く、だからこそ規律は自分たちの手元に残ります。"
category: ".NET データアクセス"
related:
  - label: Entity Framework Core
    slug: entity-framework-core
  - label: LINQ
    slug: linq
  - label: Prepared Statement
    slug: prepared-statement
  - label: Parameterized Query
    slug: parameterized-query
  - label: SQL Injection
    slug: sql-injection
  - label: N+1 Query
    slug: n-plus-1-query
  - label: Database Connection Pool
    slug: database-connection-pool
references:
  - title: "Dapper: a simple object mapper for .NET"
    url: https://github.com/DapperLib/Dapper
---

## いつ使うか

- SQL を手で調整してある熱い読み取りの経路で持ち出します。特定の索引やウィンドウ関数やヒントに合わせて形を整えたクエリなら、それを吐かせるために ORM をなだめて得るものはありません。文を直接書くほうが短く、計画は自分たちが試したその計画で、オブジェクトへ移す仕事は変わらず呼び出しひとつです。
- ORM が翻訳しにくい帳票や集計に使います。グループ化の集合も共通テーブル式もピボットもベンダー固有の関数も、SQL では自然で LINQ ではねじれます。誰も書き換えない帳票のクエリに、エンティティの意味論の出番はありません。
- EF Core を置き換えるのではなく、その隣に並べて置きます。片側にはマイグレーションと変更の追跡を備えたドメインの書き込み、もう片側には読み取りや帳票のクエリがいくつか、そして両方が同じ接続文字列の上。よくある、そして弁護できる配置です。
- ストアドプロシージャを呼ぶときに持ち出します。引数のオブジェクトと一緒に使う `CommandType.StoredProcedure` が話のすべてで、出力の引数も複数の結果集合も含めて、プロシージャをコンテキストへ先にモデリングする必要はありません。

## 注意点

- 値は例外なくすべて引数として渡します。SQL を自分たちが書く以上、文字列の連結も手の届く所にあり、それが SQL インジェクションへの入り口です。値を引数として渡せば値はデータのまま残り、サーバーは計画を再利用でき、手軽さは危ないほうと変わりません。引数ごとにプロパティをひとつ持つ匿名のオブジェクトがあれば済みます。
- 変更の追跡も作業の単位もマイグレーションもありません。更新は自分たちが書く文で、トランザクションは自分たちが開くもので、スキーマは別の何かが管理します。その規律こそが欲しい場所では entity-framework-core のほうがよい道具ですし、書き込みの多いドメインのモデルに Dapper を選ぶことは、たいていそれらの機能を手で作り直すことになります。
- ループの中のクエリは ORM のときと同じように N+1 を作り直しますし、ここではそれが自分たちのコードの中にそのまま見えています。一覧を読み込んでから行ごとに子を問い合わせれば、行ごとに往復がひとつ要ります。多重の対応付けを使う `QueryAsync` か、結合か、`IN` のクエリひとつが処方で、払う代金は ORM 版が払っていたものと同じです。
- SQL は文字列の中に住むので、コンパイラーがスキーマと突き合わせてくれません。名前の変わった列はきれいにコンパイルされ、その列を読む行で実行時に落ちます。安全網はビルドではなく、本物の文を本物のデータベースへ流す結合テストの側に置くことになります。

## .NET では

- 引数は匿名のオブジェクトで、対応付けは列の名前で行われ、接続はクエリが必要とする分だけ短くプールから借ります。

```csharp
await using var connection = new SqlConnection(connectionString);

// Values go in as parameters. Never interpolate them into the SQL string.
var orders = await connection.QueryAsync<OrderSummary>(
    """
    SELECT o.Id, o.PlacedAt, o.Total, c.Name AS CustomerName
    FROM Orders o
    JOIN Customers c ON c.Id = o.CustomerId
    WHERE o.PlacedAt >= @since AND o.Status = @status
    ORDER BY o.PlacedAt DESC
    """,
    new { since = DateTime.UtcNow.AddDays(-7), status = "Open" });

// One round trip for parents and children, mapped into a graph by splitOn.
var withLines = await connection.QueryAsync<Order, OrderLine, Order>(
    "SELECT o.*, l.* FROM Orders o JOIN OrderLines l ON l.OrderId = o.Id WHERE o.Id = @id",
    (order, line) => { order.Lines.Add(line); return order; },
    new { id = orderId },
    splitOn: "Id");
```

- 接続のオブジェクトをキャッシュしないでください。実際の接続はプールから来るので `SqlConnection` を作る費用は安く、`using` の中で開いてメソッドの終わりで閉じさせれば早く返ります。サービスの寿命の間ずっと抱えている接続は、他の誰も使えないプールの席ひとつです。
- トランザクションは明示的で、手から手へ渡します。`connection.BeginTransaction()` が返すトランザクションのオブジェクトを、`ExecuteAsync` の呼び出しごとに渡します。他の場所で `SaveChangesAsync` が代わりにしてくれていた作業の単位を、手で行うことになります。
- 結果集合が複数あるクエリは、往復ひとつで複数の問いに答えます。`QueryMultipleAsync` が文のまとまりを順に読んでくれるので、行ひとつとその子と全体の件数を一度に必要とする画面によく合います。
