---
title: "Unit of Work"
summary: "作業単位とは、まとめて成功するかまとめて失敗しなければならない変更のかたまりです。メモリ上で行ったことを集めて 1 つのトランザクションでコミットするので、途中まで終わった操作がデータベースに届くことはありません。"
category: ".NET データアクセス"
scene: change-tracking
sceneStep: 2
related:
  - label: Change Tracking
    slug: change-tracking
  - label: Local Transaction
    slug: local-transaction
  - label: Repository
    slug: repository
  - label: DbContext
    slug: dbcontext
  - label: Saga
    slug: saga
  - label: Compensating Transaction
    slug: compensating-transaction
references:
  - title: Saving data (EF Core)
    url: https://learn.microsoft.com/en-us/ef/core/saving/
  - title: Using transactions (EF Core)
    url: https://learn.microsoft.com/en-us/ef/core/saving/transactions
---

作業単位は、データベースが投げ続ける問いへの答えです。これらの変更のうち、どこまでが一組なのか。注文が発送済みに移り、明細が 1 行増え、別の 1 行が消える。これは 3 つの文ですが、そのうち 1 つだけが反映されて残りが反映されていない世界に、使い道はありません。3 つをまとめることがこの操作を原子的にすることであり、そうしなければ、たまたま近い時刻に走った小さな操作が 3 つあるだけです。

EF Core では DbContext が作業単位なので、自分で組み立てる場面はほとんどありません。行った変更はすべて変更追跡器に溜まり、SaveChanges を呼ぶまで何も送られず、送る文が 2 つ以上あれば SaveChanges がトランザクションを開きます。2 つ目の文が制約に違反すればトランザクションはロールバックされ、1 つ目もなかったことになり、tracker は未反映の変更をそのまま持ったままなので、問題を直してやり直せます。

これを取り違えたときに失うのは、平常時の正しさではなく、失敗したときの正しさです。プロパティを 1 つ変えるたびに SaveChanges を呼べば、原子的な操作 1 つが独立した操作 3 つに割れ、それぞれが自分のトランザクションと自分の往復を持ちます。2 つ目と 3 つ目の間で落ちれば、データベースはコードが名前すら与えていない状態で残ります。速度でも損をします。まとめて送った文の束は往復 1 回、別々に呼んだ保存 3 回は往復 3 回です。

```csharp
// One unit of work: three changes, one SaveChanges, one transaction.
var order = await db.Orders.Include(o => o.Lines).SingleAsync(o => o.Id == id, ct);
order.Status = OrderStatus.Shipped;
order.Lines.Add(new OrderLine { Sku = sku, Quantity = 1 });
db.OrderLines.Remove(order.Lines.Single(l => l.Id == staleLineId));

await db.SaveChangesAsync(ct);   // INSERT, DELETE and UPDATE, inside one transaction
```

SaveChanges 1 回より範囲を広げるべき場面が 2 つあります。作業が複数の呼び出しにまたがるとき、あるいは同じ接続で EF Core と素の ADO.NET を混ぜるときは、`BeginTransactionAsync` で自分でトランザクションを開き、最後に 1 回だけコミットします。そしてデッドロックのような一時的な失敗を再試行するときは、失敗した文 1 つではなく作業単位全体を実行戦略で包みます。ロールバックが残りも一緒に巻き戻しているからです。

作業単位の境界は技術ではなく設計が決めます。利用者が求めた操作そのものが境界であるべきです。注文を出す、申請を承認する、チケットを閉じる、といった具合に。これより広げれば、同じ息継ぎに入る必要のなかった作業までロックを抱えたまま引きずることになり、これより狭めれば、まとめる理由だった保証を自分から手放すことになります。
