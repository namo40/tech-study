---
title: "Optimistic Concurrency"
summary: "楽観的同時実行制御はロックを取りません。行をバージョンごと読み、作業をし、バージョンが動いていないときだけ書きます。競合は保存の時点で分かり、作業単位の全体をやり直します。"
category: "トランザクションと同時実行"
scene: deadlock
sceneStep: 4
related:
  - label: Deadlock
    slug: deadlock
  - label: Lost Update
    slug: lost-update
  - label: Pessimistic Concurrency
    slug: pessimistic-concurrency
  - label: Row Version
    slug: row-version
  - label: Concurrency Token
    slug: concurrency-token
  - label: Retry
    slug: retry
references:
  - title: Handling concurrency conflicts (EF Core)
    url: https://learn.microsoft.com/en-us/ef/core/saving/concurrency
  - title: rowversion (Transact-SQL)
    url: https://learn.microsoft.com/en-us/sql/t-sql/data-types/rowversion-transact-sql
---

仕組みは列が 1 つと条件が 1 つだけです。行がバージョンを持ち、データベースが書き込みのたびにその値を変えます。アプリケーションはデータと一緒にそのバージョンを読んでおき、更新のときに `WHERE Id = @id AND RowVersion = @versionIRead` と書きます。そのあいだに誰かがその行を書いていればバージョンは動いていて、`WHERE` に一致する行がなく、影響行数が 0 になります。その 0 が競合の合図であり、競合がないときのコストはゼロです。

この方式が価値を持つのは、読み取りと書き込みのあいだの時間です。ユーザーが編集画面を開き、2 分考えてから保存を押すとします。悲観的ロックなら、それは 1 行に排他ロックをかけたままの 2 分であり、多くの構成では借りた接続を握ったままの 2 分でもあります。バージョン検査なら握っているものはありません。読むリクエストと書くリクエストは別々で短く独立しており、世界が動いたかどうかは 2 つ目が保存時に知ります。

競合の処理は、捕まえて済ませるコードではなく設計すべき部分です。現在の行を読み直し、この項目にとって「適用し直す」が何を意味するかを決め、もう一度試します。残高なら、適用し直すとは読み直したばかりの値から計算し直すことであり、古い値から出しておいた合計をそのまま書くことではありません。ユーザーが編集した文書なら、何が変わったかを見せて尋ねることが適用し直しにあたる場合もあります。再試行は作業単位の全体をやり直す必要があります。失敗した保存は何も残していないからです。

EF Core ではバージョンは同時実行トークンであり、`byte[]` に `[Timestamp]` を付けると、データベース自身が維持する SQL Server の `rowversion` に対応付けられます。保存が失敗すると `DbUpdateConcurrencyException` が上がり、負けた項目がそこに入っています。

```csharp
public sealed class Account
{
    public int Id { get; set; }
    public decimal Balance { get; set; }
    [Timestamp] public byte[] RowVersion { get; set; } = [];
}

for (var attempt = 0; attempt < 3; attempt++)
{
    var account = await db.Accounts.FindAsync([id], ct);
    account!.Balance += delta;
    try
    {
        await db.SaveChangesAsync(ct);
        break;
    }
    catch (DbUpdateConcurrencyException)
    {
        // 何も書かれていません。古い追跡を捨てて、ループの FindAsync が今の行を
        // 読み、その行に `delta` を当て直すようにします。
        db.ChangeTracker.Clear();
    }
}
```

万能ではありません。楽観的同時実行制御は 1 行を競合する書き込みから守るだけで、2 つの行を互いに整合させはしませんし、競合が更新ではなく挿入のときには役に立ちません。競合がときどきではなく常に起きるなら再試行そのものがコストになるので、短い悲観的ロックのほうが安く付きます。
