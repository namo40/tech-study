---
title: "Pessimistic Concurrency"
summary: "悲観的同時実行制御は先にロックします。トランザクションはこれから変更する行を先に押さえ、commit まで握り続けるので、2 つ目の書き手は失敗するのではなく待ちます。競合が頻繁で、ロックから commit までの作業が短いときに向いています。"
category: "トランザクションと同時実行"
scene: deadlock
sceneStep: 3
related:
  - label: Deadlock
    slug: deadlock
  - label: Lock
    slug: lock
  - label: Optimistic Concurrency
    slug: optimistic-concurrency
  - label: Isolation Level
    slug: isolation-level
  - label: Local Transaction
    slug: local-transaction
  - label: Database Connection Pool
    slug: database-connection-pool
references:
  - title: Transaction locking and row versioning guide (SQL Server)
    url: https://learn.microsoft.com/en-us/sql/relational-databases/sql-server-transaction-locking-and-row-versioning-guide
  - title: Using transactions (EF Core)
    url: https://learn.microsoft.com/en-us/ef/core/saving/transactions
---

名前にすでに判断が入っています。悲観的同時実行制御は 2 つ目の書き手が来ると想定し、読み取りの時点で更新ロック (または排他ロック) を取って commit まで放しません。更新ロックはふつうの読み取りを通し、同じく書こうとする次のトランザクションだけを止めます。だからこれがふつうの選択になります。読み取りの時点で更新ロックを取っておけば、2 つのトランザクションがそれぞれ共有ロックを排他ロックへ昇格させようとして起こすデッドロックを避けられます。どちらにせよ、そのあいだ誰もその行を変えられないので、トランザクションが読んだ値が、いま更新している値そのものです。楽観的同時実行制御が競合を後から検出するのに対し、こちらは競合そのものを起こさせません。

そのため有利な場面は 1 つに絞られます。競合が多く、再試行のコストが待つコストを上回るときです。座席予約、人気商品の在庫減算、すべてのリクエストが触るカウンターなどがそれにあたります。コードも単純になります。競合用の経路を別に書く必要がなく、読み直して適用し直すループを正しく組む手間もありません。

代償は、ほかのトランザクションがブロックされることであり、ブロックされたトランザクションは握っているものをすべて抱えたままです。自分のロックも、プールから借りた接続も同じです。悲観的トランザクションの中に遅い文が 1 つあると、それがプールの前の行列になり、やがてアプリケーションのタイムアウトになりますが、データベース自身は暇そうに見えます。同じ行を違う順序でロックする 2 つのトランザクションはデッドロックになります。どちらの問題も同じ規律で抑えられます。1 つの順序でロックし、トランザクションはデータベースへの数往復に収め、そのあいだに外部呼び出しを挟まないことです。

EF Core に悲観的モードはないので、ロックは SQL で要求します。SQL Server ではクエリヒント、PostgreSQL では `SELECT ... FOR UPDATE` です。どちらの場合も明示的なトランザクションの中で取り、ロックが作業単位とちょうど同じ期間だけ生きるようにします。

```csharp
await using var tx = await db.Database.BeginTransactionAsync(ct);

// SQL Server。読む前に、更新のためその行を押さえます。
var account = await db.Accounts
    .FromSql($"SELECT * FROM Accounts WITH (UPDLOCK, ROWLOCK) WHERE Id = {id}")
    .SingleAsync(ct);

account.Balance -= amount;
await db.SaveChangesAsync(ct);
await tx.CommitAsync(ct);
```
