---
title: "Two-Phase Commit"
summary: "二相コミットは、複数のストアを一つのトランザクションのように動かします。コーディネーターが prepare の票を集め、参加者全員が約束したあとで初めて誰かがコミットします。原子性を得る代わりに、全員が全員を待つあいだロックを握り続けることになります。"
category: "トランザクションと同時実行"
scene: two-phase-commit
steps:
  - title: "ストアは二つ、約束は一つ"
    text: "注文と決済は、両方起きるか、どちらも起きないかでなければなりません。別々にコミットすれば、片方が「はい」と言い、もう片方が「いいえ」と言った瞬間が生まれ、その中途半端な状態こそ顧客が見る画面です。誰かが二つのデータベースを一つのように動かさなければなりません。"
  - title: "まず、全員から約束を取り付けます"
    text: "prepare は各ストアに尋ねます。これをコミットできるか、準備したまま保持しておけるか。それぞれが検証し、ロックを取り、はいと投票します。2 分の 2。それでも、まだ何もコミットされていません。約束は実行ではなく、実行を要求する権利です。"
  - title: "全員がコミットするか、誰もしないか"
    text: "票をすべて集めたコーディネーターが commit と言えば、二つのストアが一緒に切り替わります。一つのストアが「いいえ」と投票すれば、同じ仕組みが逆向きに動きます。全員 abort、ロック解放、中途半端なし。顧客は失敗を見ることはあっても、嘘を見ることはありません。"
  - title: "約束の代価は待つこと"
    text: "prepared はロックされたという意味です。その瞬間にコーディネーターが死ねば、二つのストアは後ろに並ぶ全員を塞ぎながらロックを握ったまま待ちます。独りで約束を破れば原子性が壊れるからです。この未決の窓こそ、現代のシステムがサーガやアウトボックスを先に選ぶ理由です。2PC が間違っているからではなく、この待ちがその値段だからです。"
related:
  - label: Distributed Transaction
    slug: distributed-transaction
  - label: Saga
    slug: saga
  - label: Compensating Transaction
    slug: compensating-transaction
  - label: Transactional Outbox
    slug: transactional-outbox
  - label: Local Transaction
    slug: local-transaction
  - label: Isolation Level
    slug: isolation-level
  - label: Deadlock
    slug: deadlock
  - label: Eventual Consistency
    slug: eventual-consistency
  - label: Distributed Lock
    slug: distributed-lock
  - label: Idempotency Key
    slug: idempotency-key
references:
  - title: "TransactionScope Class"
    url: https://learn.microsoft.com/en-us/dotnet/api/system.transactions.transactionscope
  - title: "Saga distributed transactions pattern"
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/saga
  - title: "Compensating Transaction pattern"
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/compensating-transaction
---

## いつ使うか

- このプロトコルを話せるリソースマネージャー二つにまたがって、書き込みが本当に原子的でなければならないときです。SQL Server のデータベース二つ、トランザクションに参加できるデータベースとメッセージキュー、XA 対応のストア一組。これらがプロトコルの設計どおりに動く場面です。判断の基準は「ここに原子性があったらいいか」ではありません。それはいつでもそうです。基準は「中途半端に終わった書き込みの代償が、ロックと往復のコストより大きいか」です。
- 参加者が一つの信頼境界と一つのネットワークの中にいるときです。1 ミリ秒で届き、同じ運用者が再起動でき、同じチームが読めるログを持つコーディネーターなら、その障害はにらみ合いではなく一つのインシデントで終わります。組織の境界を越えると、そのどれも成り立たなくなり、よりによってプロトコルの復旧の話が最初に働かなくなります。
- トランザクションが短く、参加者が少ないときです。参加者二つでロックを数ミリ秒握る程度なら、たいていのシステムは気づかずに吸収します。参加者五つで prepare と commit のあいだに 1 秒の処理があれば別のシステムであり、そのロックの後ろに並ぶ列で実態を知ることになります。
- すでに暗黙のうちにこれに頼っているときです。二つ目の接続が参加したせいで静かに昇格した `TransactionScope` は、誰が決めたかにかかわらず分散トランザクションです。自分のコードがそれをやっていると気づいたなら、プロトコルを理解する理由ができたということです。そのまま続けるかどうかは別の問いです。
- 代わりの選択肢が、誰も補償しない中途半端な世界であるときです。サービスをまたぐ原子性にはサーガがおおむね正しい答えですが、それは誰かが補償処理を実際に書き、試したときの話です。自分が所有するデータベース二つに二相コミットを使うほうが、図の上にしか存在しないサーガより正当な選択になることもあります。

## 注意点

- prepared はロックされたという意味であり、それがコストのすべてです。はいと投票した参加者は、何をするか告げられるまでロックを握り続け、独りで決めることはできません。ロックを手放せば、まだロールバックされうる値を別のトランザクションが見てしまい、変更を取り消せば、コーディネーターが当てにしてよいはずの約束が壊れます。その行に触れるすべてのトランザクションが、この待ちの後ろに並びます。
- コーディネーターは、他人のロックを握っている単一点です。決定を書いたあと、それを配る前に死ぬと、参加者は未決になります。自分が何を約束したかは知っていても、何に決まったかは知りません。復旧はコーディネーターが戻ってきて自分のログから送り直すことなので、ログは必ず永続でなければならず、再起動にかかる時間がそのままロックの後ろのすべてが止まっている時間になります。再起動できないコーディネーターは、本番データを手で触る作業に変わります。
- スループットのコストは往復二回と同期の待ちで、失敗したトランザクションだけでなく毎回のトランザクションが支払います。データベースのロックを握ったままネットワーク呼び出しを待つのは、このサイトの他のすべてのページが避けようと言っているパターンですが、ここではそれ自体が仕組みです。
- 参加させたいものの多くは、参加させられません。ホスティングされたキュー、オブジェクトストレージ、そしてすべての HTTP API は参加を拒み、それを回避する仕掛けもありません。例外は狭く、同じベンダーの中でしか成り立ちません。Azure SQL データベース同士のエラスティックトランザクションのように、MSDTC ではなくサービス自身が調整する場合です。サーガとトランザクショナルアウトボックスがマイクロサービスの世界を占めている理由はこれです。補償が優雅だからではなく、プロトコルが話しかける相手がいないからです。
- .NET では、支援の範囲は見た目より狭いです。分散トランザクションには MSDTC が要り、それは Windows を意味し、結局 Linux や大半のコンテナー、大半の PaaS ホストでは使えません。.NET 7 以降は、昇格そのものを明示的に許可する必要もあります。
- 誰も計画しない失敗の形は、ヒューリスティックな決定です。長く未決のまま残された参加者は、人の手で、あるいは自分のタイムアウトで片づけられることがあります。そのとき隣の参加者と違う推測をすれば、プロトコルを買って防ごうとしたまさにその中途半端な状態が生まれます。しかも今度は、それは起こりえないと書かれた監査記録つきです。

## .NET では

`TransactionScope` はアンビエントトランザクションであり、ここで理解する価値があるのは昇格です。スコープ内の接続が一つなら、それはローカルトランザクションです。二つ目の永続リソースが参加した瞬間、`System.Transactions` がこれを分散トランザクションへ昇格させ、MSDTC がコーディネーターを引き受けます。同じコードなのに、実行時の姿はまったく別物です。

```csharp
using var scope = new TransactionScope(TransactionScopeAsyncFlowOption.Enabled);

await using (var orders = new SqlConnection(ordersConnectionString))
{
    await orders.OpenAsync();          // still a local transaction here
    await orders.ExecuteAsync(InsertOrder, order);
}

await using (var payments = new SqlConnection(paymentsConnectionString))
{
    // A second durable resource enlists, and this is the promotion: from here
    // on there is a coordinator, a prepare round, and locks held across both.
    await payments.OpenAsync();
    await payments.ExecuteAsync(InsertCharge, charge);
}

scope.Complete();                       // the vote to commit, not the commit
```

`scope.Complete()` はコミットではありません。このスコープが異議はないと言っているだけです。コミットが起きるのは `Dispose` が走り、コーディネーターが全員から同じ答えを聞いたときです。これを呼ばずにスコープを出れば中断であり、だからこそ `using` ブロック一つがエラー処理のすべてになります。

.NET 7 からは昇格が既定で無効になっており、頼まなければ例外を投げます。支援の範囲がそれだけ狭いという事実を、ランタイムが正直に伝えているわけです。

```csharp
// Windows only, MSDTC only. On Linux or in most containers this is not a
// configuration problem you can solve; the transaction manager is not there.
TransactionManager.ImplicitDistributedTransactions = true;
```

二つの書き込みが同じデータベースの中にあるなら、これらは何一つ必要なく、何一つ使わないほうがよいです。接続一つ、トランザクション一つ、コミット一つで足ります。ローカルトランザクションはそれ自体で原子的であり、同じサーバーの接続二つに `TransactionScope` をかぶせれば、それも昇格します。

```csharp
await using var connection = new SqlConnection(connectionString);
await connection.OpenAsync();
await using var tx = await connection.BeginTransactionAsync();

await connection.ExecuteAsync(InsertOrder, order, tx);
await connection.ExecuteAsync(InsertOutboxMessage, message, tx);

await tx.CommitAsync();
```

この二つ目の文が、人々が二相コミットに求めるものの大半に対する現代の答えです。何が起きたかを別のサービスへ伝えるメッセージを、変更そのものと同じローカルトランザクションの中に書くので、二つが食い違うことはありません。別のプロセスがアウトボックスを読み、あとから発行します。ネットワーク呼び出しをまたいで握っているものは何もなく、向こう側は原子的ではなく結果整合になります。これが正直な取引であり、意識して選ぶ価値のある取引です。

```csharp
// The far side does the other half: a step that can run twice without harm,
// because at-least-once delivery is what the outbox buys you.
public async Task HandleAsync(OrderPlaced message, CancellationToken token)
{
    if (await db.Charges.AnyAsync(c => c.OrderId == message.OrderId, token)) return;
    await payments.ChargeAsync(message.OrderId, message.Amount, token);
}
```

処理が本当に複数のサービスにまたがり、本当に全部か無かでなければならないなら、その形はサーガです。各ステップはローカルにコミットし、あとのステップが失敗したら補償をたどって後ろ向きに歩いて戻ります。どの観察者も半分だけ変わった世界を見ないという保証を手放す代わりに、二相コミットがロックに費やすものをすべて取り戻します。その窓を受け入れると判断したうえで選んでください。プロトコルの設定が面倒だったから選ぶのではありません。
