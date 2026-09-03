---
title: "Compiled Query"
summary: "コンパイル済みクエリは EF Core のクエリの準備の段階を先に固めておき、同じ LINQ の式を呼び出しのたびに見分け直して探し直さずに済ませます。SQL が速くなるのではなく、SQL を組み立てる手が速くなります。"
category: ".NET データアクセス"
related:
  - label: Entity Framework Core
    slug: entity-framework-core
  - label: LINQ
    slug: linq
  - label: N+1 Query
    slug: n-plus-1-query
  - label: Query Plan
    slug: query-plan
  - label: Prepared Statement
    slug: prepared-statement
references:
  - title: Advanced Performance Topics
    url: https://learn.microsoft.com/en-us/ef/core/performance/advanced-performance-topics
---

## いつ使うか

- クエリが短くて些細で、絶え間なく呼ばれるときに使います。識別子でひとつ引く端点が毎分数万件を受けているなら、各要求の目に見える割合がデータベースではなく EF Core の中で流れていきます。データベースの仕事は索引をひとつ手繰るだけで、フレームワークの仕事は呼び出しごとに同じだからです。節約を見えるものにするのはその比率です。表を走査するクエリでは、同じ節約は雑音に紛れて消えます。
- 実際に計測が翻訳とキャッシュの照会の分の負担を見せてくれたときに使います。正直な入口の条件は、呼び出しから命令が送られるまでの時間が全体の中で本当の割合を占めていると告げるトレースやベンチマークであって、ORM は遅いのではないかという疑いではありません。計測が、時間はデータベースか直列化で使われていると言うなら、コンパイル済みクエリは何ひとつ変えません。
- Native AOT や起動の時間に敏感なプロセスを狙うときに使います。トリミングと事前のコンパイルが絡む場所では、クエリの準備を明示的で静的に根を張った委譲へ移しておくほうが仕事を見通しやすくし、最初の要求の経路から外してくれます。一週間温まっているサーバーよりも、寿命の短い関数のインスタンスにこそ効く話です。

## 注意点

- まず測ります。EF Core はすでにクエリの翻訳をキャッシュしているからです。LINQ のクエリは最初の実行で翻訳され、結果はコンテキストのクエリのキャッシュに入り、以降の実行は式の木を見分けてその翻訳を再利用します。コンパイル済みクエリが取り除くのは翻訳ではなく、見分けとキャッシュの照会なので、得られるのは呼び出しあたり数マイクロ秒の水準です。毎分十万回通る熱い経路では持つ価値があり、それ以外のどこにも価値はありません。
- 出てくる SQL は同一で、つまり遅いクエリはそのままきっちり遅いままです。文に索引がない、列を返しすぎている、ループの中で行ごとに実行されている、そのどれであっても、コンパイルしたところでデータベースが受け取るのは同じ文と同じ実行計画です。まず形を直してください。ループの話は n-plus-1-query に、残りは query-plan にあり、どちらの処方もここで得るものより何桁も大きな値打ちがあります。
- `DbContext` とすべての引数はラムダの引数でなければならず、取り込んだ変数であってはいけません。取り込んだ値はコンパイルの時点で式の中へ焼き込まれるので、委譲は作られたときにたまたま範囲にあったその識別子の結果を返し続けます。取り込んだコンテキストは、二度目の要求ではすでに破棄されたコンテキストです。引数として渡すやり方は、委譲が自分の状態を持たないようにして、同時に来る要求がひとつの委譲を共有しても安全にしてくれます。
- 委譲が呼び出しより長く生きてはじめて元が取れますし、実務ではそれは `static readonly` のフィールドを意味します。メソッドの中でコンパイル済みクエリを作れば要求ごとにコンパイルすることになり、避けようとしていたキャッシュの照会より明らかに多い仕事です。コードは変わらず正しく動き、ただ以前より遅くなるだけなので、やりがちな取り違えでもあります。

## .NET では

- `EF.CompileAsyncQuery` はコンテキストと引数と取り消しのトークンを受け取る委譲を返します。静的なフィールドに置いて、ふつうのメソッドのように呼びます。

```csharp
// One static delegate per query, built once for the life of the process.
private static readonly Func<ShopDbContext, int, CancellationToken, Task<Product?>> GetProductById =
    EF.CompileAsyncQuery(
        (ShopDbContext db, int id) =>
            db.Products.AsNoTracking().FirstOrDefault(p => p.Id == id));

// A sequence result comes back as IAsyncEnumerable, so it has no CancellationToken parameter.
private static readonly Func<ShopDbContext, int, IAsyncEnumerable<Order>> RecentOrdersFor =
    EF.CompileAsyncQuery(
        (ShopDbContext db, int customerId) =>
            db.Orders.AsNoTracking()
                .Where(o => o.CustomerId == customerId)
                .OrderByDescending(o => o.PlacedAt)
                .Take(20));

// The context and the parameters are arguments. Capturing either one is the bug.
var product = await GetProductById(db, id, ct);
```

- `EF.CompileQuery` は同期の側の双子で、規則は同じです。周りのコードが本当に同期のときだけ選んでください。要求のスレッドでデータベースの呼び出しを塞いで待つ代金は、節約したコンパイルよりはるかに大きいものです。
- 読み取りの経路なら `AsNoTracking` もコンパイルされる式の中へ一緒に入れます。ふつうのクエリでそうしたはずの場所と同じです。熱い読み取りでの変更の追跡はたいてい翻訳より大きな費用ですし、そもそも計測がここへ導いたのなら最初に試すことでもあります。
- コンパイル済みクエリと準備された文の再利用は、同じ道のりの別々の半分を解きます。こちらは命令が送られる前の .NET のプロセスの中の仕事を短くし、引数化された命令とサーバーの計画のキャッシュは届いたあとの仕事を短くします。どちらも他方の代わりにはなりません。
