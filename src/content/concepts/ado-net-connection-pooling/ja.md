---
title: "ADO.NET Connection Pooling"
summary: ".NET でプールを実際に実装している層です。Open は接続を借り、Dispose は返し、プールは接続文字列ごとに別々に作られます。その上にある Dapper や EF Core は、名前を出すかどうかに関わらずこの機構をそのまま受け継ぎます。"
category: "プールとリソース管理"
scene: database-connection-pool
sceneStep: 2
related:
  - label: Database Connection Pool
    slug: database-connection-pool
  - label: Entity Framework Core
    slug: entity-framework-core
  - label: Dapper
    slug: dapper
  - label: Minimum Pool Size
    slug: minimum-pool-size
  - label: Connection Lifetime
    slug: connection-lifetime
  - label: Maximum Pool Size
    slug: maximum-pool-size
references:
  - title: "SQL Server connection pooling (ADO.NET)"
    url: https://learn.microsoft.com/en-us/sql/connect/ado-net/connection-pooling
---

シーンの 2 番目のステップは、リクエストが開いている接続を借りて返す様子を見せます。.NET ではこの絵はコードの動きのたとえではなく、そのままの記述です。`SqlConnection` を作る作業はネットワークにまったく触れません。`Open` はプロバイダーのプールに接続を求め、空いているものがあれば生きた接続を受け取り、渡せるものが無いときだけハンドシェイクをします。`using` が代わりに呼ぶ `Dispose` はソケットを閉じません。セッションを初期化し、接続を空きの一覧へ戻します。借りて返す規律が、遅く開いてすぐ dispose する以上のものではない理由がここにあります。

```csharp
// 文字列 1 つにプール 1 つ。1 文字変えれば、プールは 2 つになります。
const string cs =
    "Server=db;Database=orders;Encrypt=True;Application Name=orders-api;" +
    "Min Pool Size=5;Max Pool Size=100;Connection Lifetime=600";

// この文字列のプールから借ります。破棄は返却であって、閉じることではありません。
await using var connection = new SqlConnection(cs);
await connection.OpenAsync(ct);

// Dapper はキャンセルトークンを CommandDefinition 経由で受け取ります。位置指定の
// 第 3 引数はトークンではなくトランザクションです。
var orders = await connection.QueryAsync<Order>(
    new CommandDefinition(sql, new { id }, cancellationToken: ct));
```

驚かれるのは、プールを何で見分けるかという点です。1 つのプロセスの中では、異なる接続文字列ごとにプールが 1 つ作られ、文字列は解析後のオプションではなく渡したそのままの形で比べられます。同じキーワードでも順序が違えば別のプールになります。ですから `Application Name` だけが違う 2 本、空白の位置だけを動かして書き直した 1 本、資格情報が違う 1 本は、それぞれ独立したプールになり、自分の最小値と最大値と寿命を持ちます。統合認証では ID も鍵の一部です。テナントごとの接続文字列がテナントごとのプールになり、テナント 100 件がデータベースの側で同時に満たすべき最大値 100 個になる理由です。実行中に接続文字列を組み立てる作業は、書式の問題ではなくプーリングの判断として扱うほうが安全です。プールそのものはプロセス内のプロバイダーにあり、だからプールの上限はすべてプロセス単位です。サーバー側の数と比べるには、まずインスタンス数を掛ける必要があります。

抜け道が 2 つあり、まれに、そして意図したときだけ使います。`SqlConnection.ClearPool` と `ClearAllPools` はプール内の接続を無効と印を付け、次の `Open` が新しく作るようにします。障害切り替えや資格情報のローテーションの直後には望みどおりの動きになることがあり、それ以外では温めたサービスを冷やす方法です。日常のリバランスは Connection Lifetime の担当です。この層の上にあるものは、黙ってそのまま受け継ぎます。Dapper は同じ `IDbConnection` に付いた拡張メソッドで、EF Core は自分の作業の前後でプロバイダーの接続を開いて閉じます。リクエスト 1 回分だけ生きる `DbContext` は、実際に何かを実行しているあいだだけプールの接続を握ります。`AddDbContextPool` はこの上に載る、コンテキストのオブジェクトを貯める無関係な別のプールです。接続文字列で `Pooling=false` としてプーリングを切れば、シーンの 2 番目のステップがすべての層で一度に 1 番目のステップへ戻ります。
