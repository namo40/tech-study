---
title: "Isolation Level"
summary: "分離レベルとは、同時に走る 2 つのトランザクションが互いの何を見てよいかについてのデータベースの答えであり、その代償としてどれだけ頻繁に待つことになるかが決まります。各レベルは名前のついた異常の集合を許すので、1 つを選ぶことは、自分のコードがどの異常に出会う覚悟があるかを選ぶことです。"
category: "トランザクションと同時実行"
scene: isolation-level
steps:
  - title: "コミット済みか、何もなしか"
    text: "2 つのトランザクションが 1 つの行を共有します。最初のほうが変更している最中に 2 つ目が読むと、ロックの確認で一瞬待たされたうえで、最後にコミットされた値だけが見え、半端な値は決して見えません。それが read committed で、ふつうの出発点です。"
  - title: "同じクエリを 2 回、答えは 2 つ"
    text: "1 つのトランザクションの中で 2 回読む間に、他方が変更をコミットすると、2 回目の読みが 1 回目と食い違います。レベルを上げれば 2 つの読みはまた一致します。代償は、書く側が待つようになることです。"
  - title: "ロックの代わりにバージョン"
    text: "スナップショットは始めた瞬間の世界を読むので、読む側は決して待ちません。書き込みは相変わらず衝突します。2 つのトランザクションが同じ行を変えるとバージョン番号が負けた側を明かし、一方はロールバックして再試行します。楽観は待ちを再試行に取り替えます。"
  - title: "形容詞ではなく異常を選ぶ"
    text: "各レベルは表の 1 行です。どの異常を許すか、他をどれだけ待たせるか。serializable は何も許さない代わりに全員を並ばせ、read committed は最も待たせない代わりに最も多く見せます。自分のコードが実際に生き延びられる異常を基準に選びます。"
related:
  - label: Local Transaction
    slug: local-transaction
  - label: Row Version
    slug: row-version
  - label: Concurrency Token
    slug: concurrency-token
  - label: Lock
    slug: lock
  - label: Deadlock
    slug: deadlock
  - label: Lost Update
    slug: lost-update
  - label: Optimistic Concurrency
    slug: optimistic-concurrency
  - label: Pessimistic Concurrency
    slug: pessimistic-concurrency
  - label: Read-Your-Writes
    slug: read-your-writes
  - label: Replication
    slug: replication
references:
  - title: SET TRANSACTION ISOLATION LEVEL (Transact-SQL)
    url: https://learn.microsoft.com/en-us/sql/t-sql/statements/set-transaction-isolation-level-transact-sql
  - title: PostgreSQL transaction isolation
    url: https://www.postgresql.org/docs/current/transaction-iso.html
  - title: Handling concurrency conflicts (EF Core)
    url: https://learn.microsoft.com/en-us/ef/core/saving/concurrency
  - title: Using transactions (EF Core)
    url: https://learn.microsoft.com/en-us/ef/core/saving/transactions
  - title: Transaction locking and row versioning guide (SQL Server)
    url: https://learn.microsoft.com/en-us/sql/relational-databases/sql-server-transaction-locking-and-row-versioning-guide
---

## いつ使うか

- 行を読んでからその行を書くトランザクションには、誰かが選んだかどうかによらず分離レベルがついています。在庫数、残高、座席、クーポンのように読んで直して書き戻す経路こそ、レベルが脚注であることをやめる場所です。
- それ自身で辻褄が合っていなければならないレポートには、読みを止めておくレベルが必要です。read committed で 12 本のクエリを走らせて作る月次集計は、12 本目が 1 本目の見なかったコミットを見たというだけで、自分自身と食い違うことがあります。
- 何かを調整する前に、使っているデータベースの既定値を確かめます。オンプレミスの SQL Server は共有ロックを取る read committed で出荷され、Azure SQL Database は `READ_COMMITTED_SNAPSHOT` を既定で有効にし、PostgreSQL は行バージョンを使う read committed で出荷されます。SQL Server でこの設定を切り替えると、コードを 1 行も変えないまま read committed の意味が変わります。
- 読みが書く側の後ろで詰まりはじめ、衝突を再試行する余裕があるならスナップショットを選びます。ロックで守るより高いレベルは、待ちのほうが再試行より安い場所でだけ使います。

## 注意点

- レベルは可視性の話であって、正しさの話ではありません。行をメモリーに読み、トランザクションを閉じ、2 分考えてから計算した値を書き戻すなら、serializable でさえ lost update から救ってはくれません。その隙間には、隙間をまたいで保たれるバージョンかロックが要り、そこまで届くレベルはありません。
- レベルを全体で上げると、誰も踏んでいなかった異常を防ぐ代わりにスループットを差し出すことになります。serializable はそれを必要とした 1 本の経路のために全トランザクションを並ばせるので、レベルはそれを必要とするトランザクションにかけ、残りは触らないでください。
- スナップショットは衝突をなくすのではなく移します。読みは待たなくなり、書きはコミット時に失敗しはじめるので、書き込みを行うスナップショットトランザクションにはすべて再試行ループが必要です。しかもその再試行は、失敗した 1 文ではなく作業単位の全体をやり直さなければなりません。
- phantom の行は多くの人の予想より遠くまで生き延びます。SQL Server のロック方式の repeatable read では、守られるのはすでに触れた行であって、あとから現れる行ではないので、repeatable read のトランザクションの中の `COUNT` は依然として増えることがあります。そこまで閉じるには serializable か明示的な範囲ロックが必要です。PostgreSQL はここでは例外で、その `REPEATABLE READ` はスナップショット分離なので、そもそも phantom がありません。
- レベルは持ち歩けません。操作ではなく接続に適用され、SQL Server ではトランザクションが終わってもそのセッションに残り、接続が閉じられるか破棄されるまで続きます。だから同じ論理的な操作の中で 2 本目の接続を開くコードは、そちらでは既定値のまま走っています。遅延評価のシーケンスを返すコードは、呼び出した側が読み終える前にトランザクションを閉じてしまっていることがほとんどです。
- トランザクションが長くなるほど、どのレベルも高くつきます。レベルは誰が待つかを決め、トランザクションの長さはどれだけ待つかを決めます。HTTP 呼び出しやメッセージ送信、ユーザーが考えている時間をまたいでトランザクションを抱えたままにしないでください。

## .NET では

EF Core も ADO.NET も、レベルはクエリではなくトランザクションで受け取ります。EF Core はそこに、どのレベルでも楽観的同時実行が働くようにするバージョン検査を足します。

```csharp
// 1. レベルはクエリではなくトランザクションの属性です。
await using var tx = await db.Database.BeginTransactionAsync(
    IsolationLevel.Snapshot, ct);

var item = await db.Stock.SingleAsync(s => s.Id == id, ct);
item.Count -= 1;
await db.SaveChangesAsync(ct);
await tx.CommitAsync(ct);

// 2. 同時実行トークンは読んだバージョンを条件にして書き込むので、
//    read committed でも競合が検出されます。
public sealed class StockItem
{
    public int Id { get; set; }
    public int Count { get; set; }
    [Timestamp] public byte[] RowVersion { get; set; } = [];
}

// 3. 失敗したほうはロールバックされているので、作業単位ごと再試行します。
//    組み込みの実行戦略が再実行するのは一時的なデータベースエラーのときだけ
//    なので、同時実行の競合には自前のループが要ります。
for (var attempt = 0; attempt < 3; attempt++)
{
    await using var tx = await db.Database.BeginTransactionAsync(ct);
    try
    {
        await SellAsync(db, id, ct);
        await tx.CommitAsync(ct);
        break;
    }
    catch (DbUpdateConcurrencyException)
    {
        db.ChangeTracker.Clear();   // 何もコミットされていません。次の回でもう一度読みます
    }
}
```

SQL Server では `ALTER DATABASE … SET READ_COMMITTED_SNAPSHOT ON` がたいてい最も効果の大きい変更です。読む側が共有ロックを取らずにバージョンを読むようになり、普通のアプリケーションが出会うブロッキングとデッドロックのかなりの部分が消えます。代わりに `tempdb` のバージョンストア領域を使います。`IsolationLevel.Snapshot` はまた別のもので `ALLOW_SNAPSHOT_ISOLATION` を個別に有効にする必要があり、更新の衝突でエラー 3960 を上げるのはこちらです。PostgreSQL では `REPEATABLE READ` がすでにスナップショット分離で、`SERIALIZABLE` はそこに述語の追跡を足して直列化失敗でトランザクションを中断することがあるため、どちらも同じ再試行ループを必要とします。
