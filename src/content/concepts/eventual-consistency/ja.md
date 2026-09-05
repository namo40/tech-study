---
title: "Eventual Consistency"
summary: "Eventual consistency は、更新が止まればすべてのレプリカが最終的に同じ値に落ち着くという約束です。ただし、いつまでという上限はありません。設計の対象はその間の区間です。読み手が何を見てよいのか、何は決して見てはいけないのか、どの読み取りにはより強い保証が要るのかを決めます。"
category: "データ分散と整合性"
scene: eventual-consistency
steps:
  - title: "収束"
    text: "書き込みはまずプライマリに届き、少し遅れてレプリカへ広がります。書き込みを止めれば、どのコピーも最終的に同じ値になります。eventually はいつなのかを語らず、差が閉じることだけを約束します。"
  - title: "どこで読むかが何を見るかを決めます"
    text: "2 人の読み手が同じ瞬間に同じ質問をしても、答えは異なります。レプリカはそれぞれ自分の遅延ぶんだけプライマリを追いかけているからです。書き込みが集中すると、その遅延に上限はありません。"
  - title: "最初に破られる約束は自分の書き込みです"
    text: "保存して更新したら、さっきの変更が消えています。読み取りが、まだ書き込みの届いていないレプリカに落ちたのです。セッション整合性は、そのユーザーの読み取りを自分の書き込みを持つコピーで待たせるか、そこへ向かわせ、約束を取り戻します。"
  - title: "システム単位ではなく読み取り単位で選びます"
    text: "残高確認はプライマリを読み、レイテンシを支払います。商品ページはどのレプリカを読んでもよく、何も支払いません。その中間にあるレイテンシの上限は、遅れたレプリカが追いつくまでローテーションから外しておきます。"
related:
  - label: Replication
    slug: replication
  - label: Replication Lag
    slug: replication-lag
  - label: Read Replica
    slug: read-replica
  - label: Read-Your-Writes
    slug: read-your-writes
  - label: Session Consistency
    slug: session-consistency
  - label: Bounded Staleness
    slug: bounded-staleness
  - label: Materialized View
    slug: materialized-view
  - label: Projection
    slug: projection
  - label: CQRS
    slug: command-query-responsibility-segregation
  - label: Cache Invalidation
    slug: cache-invalidation
  - label: Saga
    slug: saga
references:
  - title: Consistency levels in Azure Cosmos DB
    url: https://learn.microsoft.com/en-us/azure/cosmos-db/consistency-levels
  - title: Manage consistency levels in Azure Cosmos DB
    url: https://learn.microsoft.com/en-us/azure/cosmos-db/how-to-manage-consistency
  - title: Distributed data in cloud-native applications
    url: https://learn.microsoft.com/en-us/dotnet/architecture/cloud-native/distributed-data
  - title: Caching guidance (Azure Architecture Center)
    url: https://learn.microsoft.com/en-us/azure/architecture/best-practices/caching
---

## いつ使うか

- プライマリを離れた読み取りはすべて結果整合性の読み取りです。レプリカ、キャッシュ、検索インデックス、projection、マテリアライズドビューがそれにあたります。書き込みと画面の間にはたいていこうした層が複数あり、層ごとに自分ぶんの遅れを足します。
- 保証されるのは収束であって最新であることではありません。書き込みが止まればコピー同士は食い違わなくなる、という意味であって、書き込みが届いている間に読み手が何を受け取るかは何も言っていません。
- 読み取りが書き込みよりずっと多く、データは画面に出る時点ですでに少し古く、2 人が 1 秒ほど違う答えを見ても問題にならない場所に向いています。カタログ、フィード、ダッシュボード、検索がそういう画面です。
- レプリケーション遅延はエラー率と並べて見ます。この遅延こそが、この文書で扱う区間の幅だからです。遅延の数字がないシステムは、自分の読み取りがどれだけ古くなりうるかも把握できていません。
- システム単位ではなくエンドポイント単位で決めます。ほとんどの読み取りはレプリカで十分で、いくつかは呼び出したユーザー自身の書き込みを必ず見なければならず、ごく一部は全員にとって最新である必要があります。ただなのは最初のものだけです。

## 注意点

- eventual は収束についての言明であって、レイテンシの上限ではありません。書き込みが集中したり、長いトランザクションが走ったり、レプリカが変更を 1 本のスレッドでしか適用できなかったりすると、その区間は止めるものなく伸びます。
- ユーザーが最初に報告するのは、自分の書き込みが見えない場合です。保存して更新すると、変更の届いていないレプリカから画面が描かれ、たったいま加えた編集が消えて見えます。この 1 つはセッションの固定やセッショントークンで直し、すべての読み取りを強い読み取りにはしません。
- 整合性をうっかり混ぜないようにします。強い読み取りの結果をキャッシュに入れたり projection に流したりすれば、それは名前だけが違う結果整合性の読み取りであり、最新であるかのように信用されてしまいます。
- 単調な読み取りも合わせて考えます。ユーザーがレプリカの間を行き来すると、ある値を見たあとに古い値を見て、また新しい値を見ることになり、システムがいまの作業を取り消したように読めます。
- 結果整合性の読み取りを書き込みの入力にしてはいけません。古い値を読んで書き換えると、まだ誰も見ていない変更を静かに上書きし、どこからもエラーは上がりません。

## .NET では

Azure Cosmos DB はこの選択を表に出しています。アカウント全体の既定値が 1 つあり、リクエスト単位の上書きはそれを緩める方向にしか使えません。現実的な水準は Session で、セッショントークンがユーザーについて回ってはじめて保証が保たれます。そして `Strong` の読み取りが 1 つでも要るアカウントは `Strong` に設定し、それ以外の場所で `Session` に緩めます。

```csharp
// ふだんの読み取りはすべて Session: クライアントは自分の書き込みを必ず見る。背後の
// アカウントは Strong に設定してあり、だからこそ下の読み取り 1 つが Strong を求められる。
builder.Services.AddSingleton(_ => new CosmosClient(connection, new CosmosClientOptions
{
    ConsistencyLevel = ConsistencyLevel.Session,
}));

// 保証を運ぶのはトークン。SDK はこれを 1 つのクライアントインスタンスの中に保つので、
// ユーザーと一緒に(Cookie やヘッダーで)運ばないと、別のインスタンスに着いたリクエストは
// トークンなしで届く。
var read = await container.ReadItemAsync<Cart>(
    id,
    new PartitionKey(userId),
    new ItemRequestOptions { SessionToken = tokens.Get(userId) });
tokens.Set(userId, read.Headers.Session);

// 結果整合性では済まない 1 つの読み取り: 緩めずにアカウントの Strong を保ち、
// 明示して求め、代金を払う。
var balance = await container.ReadItemAsync<Account>(
    accountId,
    new PartitionKey(userId),
    new ItemRequestOptions { ConsistencyLevel = ConsistencyLevel.Strong });
```

Cosmos DB でなくても形は同じです。SQL Server や PostgreSQL の背後にある読み取りレプリカは接続文字列でルーティングし、どの読み取りがレプリカを使ってよいかはハンドラーごとに散らさず 1 か所で決めます。`HybridCache` と出力キャッシュは、ストアが与える保証の上に乗るもう 1 つの結果整合性の層です。強い読み取りをキャッシュに置いた複製は、そのエントリが生きている間ぶんだけ新しく、有効期限として選んだ値がそのまま受け入れた古さになります。
