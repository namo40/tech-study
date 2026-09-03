---
title: "LINQ"
summary: "LINQ は C# に組み込まれたクエリの表面です。同じ演算子がメモリーのリストもデータベースのテーブルも絞り込みます。そのどちらが起きているのかを決めるのが、遅延実行と IQueryable の境目です。"
category: ".NET データアクセス"
related:
  - label: Entity Framework Core
    slug: entity-framework-core
  - label: N+1 Query
    slug: n-plus-1-query
  - label: Dapper
    slug: dapper
  - label: Pagination
    slug: pagination
references:
  - title: Language Integrated Query (LINQ)
    url: https://learn.microsoft.com/en-us/dotnet/csharp/linq/
  - title: Deferred execution and lazy evaluation in LINQ to XML
    url: https://learn.microsoft.com/en-us/dotnet/standard/linq/deferred-execution-lazy-evaluation
---

## いつ使うか

- 変換を、どう回すかではなく何が欲しいかとして書くために使います。`Where` と `Select` と `GroupBy` と `OrderBy` は、絞る、射影する、まとめる、並べると言っていて、読む人は添字の変数と値の変わる集計用の変数から意図を組み立て直さずに意図を受け取ります。
- EF Core のクエリを書く言語がこれです。`List<T>` に使っていたのと同じ演算子が、SQL になる式のツリーを作ります。演算子を一度覚えておけば、コレクションにもデータベースにも他のクエリ可能な情報源にも同じように効く理由です。
- クエリの形がリクエスト次第で変わるときは、パイプラインを部品として組み立てます。演算子ごとに結果ではなく新しいクエリが返るので、メソッドが条件によって絞り込みを足してクエリをそのまま返し、呼び出した側がページングを載せてから初めて実行が始まる、という形にできます。
- 同じ形の問いを別々の情報源へ投げるときに持ち出します。メモリーのコレクションも、プロバイダー越しのデータベースも、他のクエリ可能な情報源も同じ演算子の名前に答えるので、下の保管場所が変わっても読む側のコードははるかに変わりません。

## 注意点

- 最初に身に付けるのは遅延実行です。クエリは定義であって結果ではありません。何かが列挙するまで何も動かないので、同じクエリの変数を `foreach` で二度回せばクエリは二度動きます。データベースが相手なら往復が二度で、二つの答えが違うこともあります。結果を二度以上使うなら `ToListAsync` で一度だけ実体化してください。
- `IEnumerable` と `IQueryable` の境目が、仕事のどこで起きるかを決めます。`IQueryable` はプロバイダーが SQL へ翻訳する式のツリーを作り、`IEnumerable` はすでにメモリーにあるオブジェクトの上でデリゲートを回します。クエリを `IEnumerable<T>` へキャストしたり代入したり、`AsEnumerable` を呼んだりすると、そこから先のすべてが自分たちのプロセスの中へ移ってきます。
- その境目のどちら側に `Where` がひとつ置かれるかで、回線を渡る量が変わります。まだ `IQueryable` のうちに置けば `WHERE` の句になってデータベースが合う行だけを返し、実体化したあとに置けばテーブル全体がアプリケーションまで来てそこで絞られます。コードは似て見え、結果も同じです。
- `ToList` を呼ぶ場所がそのまま実体化の時点なので、それを早く呼ぶとページングの不具合がメモリーの問題へ育ちます。`ToList().Skip(900).Take(20)` は全部を取り寄せて大半を捨て、`Skip(900).Take(20).ToListAsync()` はデータベースに二十行をくださいと言います。連なりの末尾で集計を繰り返すのも同じ形です。`Count` や `Sum` を呼ぶたびにもう一度列挙します。

## .NET では

- 同じ二行が境目のどちら側にあるかで別の意味になり、目に見える手掛かりは変数の型だけです。

```csharp
// Still IQueryable: both operators become SQL, and the database returns 20 rows.
var page = await db.Orders
    .Where(o => o.Status == OrderStatus.Open)   // -> WHERE Status = @p0
    .OrderByDescending(o => o.PlacedAt)
    .Skip(pageIndex * 20).Take(20)              // -> OFFSET/FETCH
    .ToListAsync(ct);

// AsEnumerable ends the translation: everything after it runs in this process,
// so the whole Orders table is fetched and then filtered here.
var accidental = db.Orders
    .AsEnumerable()
    .Where(o => o.Status == OrderStatus.Open)
    .ToList();

// Deferred: nothing has run yet. Enumerating twice runs the query twice.
var open = db.Orders.Where(o => o.Status == OrderStatus.Open);
var count = await open.CountAsync(ct);          // round trip 1
var rows  = await open.Take(20).ToListAsync(ct); // round trip 2
```

- パイプラインを条件によって積み上げられる理由が合成です。`if` の中の `query = query.Where(...)` は実行せずに式のツリーへ足すだけなので、任意の絞り込みが複数あるエンドポイントが、四つの分岐ではなく段階的に組み立てたひとつのクエリになります。
- 実際にクエリを動かすのは `foreach` と `ToList` と `ToArray` と `First` と `Count`、それに非同期のストリームに対する `await foreach` です。それ以外はすべて新しいクエリを返すので、どちらがどちらかを知っていることが、実務で遅延実行が求めるものの大半です。
- データベースが相手なら、オブジェクトをあとから整えるのではなくクエリの中で射影するほうがよいです。まだ `IQueryable` のうちに `Select` で DTO へ入れれば列は少なく届き、実体化したあとの同じ `Select` は、テーブルのすべての列の代金をすでに払ったあとです。
