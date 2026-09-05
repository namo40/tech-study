---
title: "Cross-Shard Query"
summary: "パーティションキーを載せていないクエリは、すべてのシャードに尋ねなければなりません。質問を撒き、いちばん遅い答えを待ち、集めて合わせます。だから可能なときはキーでルーティングし、避けられないときは fan-out に予算を付け、いちばんよく尋ねる質問が 1 シャードの質問になるようにデータの形を変えます。"
category: "データ分散と整合性"
scene: cross-shard-query
steps:
  - title: "キーのない質問は、全員に尋ねなければなりません"
    text: "ゴーストは、すべてのクエリがすべてのシャードへ扇状に広がるのを見せます。質問のたびにマシン 3 台が働き、メーターはそのたびに上がります。設定を間違えたものはありません。これは分かれたデータの料金表で、どの行を払うかはキーが決めます。"
  - title: "キーの載った質問は、1 シャードの仕事です"
    text: "ルーターがキーを読み、それを所有する 1 つのシャードを指し、シャードが 3 つでも 300 でも答えのコストは同じです。これがシャーディングという取引のすべてです。熱い質問がキーを載せるように設計すれば、フリートは大きくなっても、答えのひとつひとつは 1 対 1 の会話のままです。"
  - title: "正当なスキャッターの値段は、いちばん遅いシャードが決めます"
    text: "合計や検索は本当に全員のものです。撒けば 2 つは速く答え、gather は 3 つ目を待ちます。fan-out はクエリをテールレイテンシとの競走に変えます。答えないシャードへの道は前もって選びます。印付きの不完全な結果か、丸ごと失敗か。沈黙は、設計しないまま放っておける選択肢ではありません。"
  - title: "いちばんよく尋ねる質問は、1 シャードの質問に変えておきます"
    text: "ダッシュボードが毎秒欲しがる要約は、あらかじめ計算して view に置き、書き込みのたびに更新し、1 か所から読み返します。余分な仕事は書き込み側へ移り、しかも小さいものです。変えたのは質問ではなく、データの形です。"
related:
  - label: Sharding
    slug: sharding
  - label: Partitioning
    slug: partitioning
  - label: Rebalancing
    slug: rebalancing
  - label: Denormalization
    slug: denormalization
  - label: Tail Latency
    slug: tail-latency
  - label: Materialized View
    slug: materialized-view
  - label: Two-Phase Commit
    slug: two-phase-commit
  - label: Keyset Pagination
    slug: keyset-pagination
  - label: CQRS
    slug: command-query-responsibility-segregation
  - label: CAP Theorem
    slug: cap-theorem
references:
  - title: Sharding pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/sharding
  - title: Query an Azure Cosmos DB container
    url: https://learn.microsoft.com/en-us/azure/cosmos-db/how-to-query-container
  - title: Materialized View pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/materialized-view
---

## いつ使うか

- **質問にキーがあるならいつでもキーでルーティングし、ホットパスはキーを載せるように設計します。** cross-shard query はオンにする機能ではありません。ルーターにどこを見ればよいかを教えるはずのその一片が欠けたまま質問が届いたときに起きることです。分かれたストアでクエリが遅いとき、まず見るべきはインデックスではなく、そもそも述語にキーが入っていたかどうかです。
- **正当な fan-out には、高価なエンドポイントとして予算を付けます。** 検索、合計、管理用の全走査、レポートは本当にすべてのシャードのものであり、そうでないふりをしてもコストが見えにくい場所へ移るだけです。こうした質問には専用の経路を与えます。タイムアウトを付けた並列呼び出し、レポート 1 つがコネクションプールを占め切らないように区切った同時実行数、そして最初のシャードが黙る前に決めておいた不完全結果のポリシーです。
- **残りはデータの形を変えます。** キーのない同じ質問が毎秒何千回も来るなら、答えはより速い fan-out ではなく別の形です。書き込みのたびに更新する事前計算済みの要約や、逆向きのキーで持った参照テーブルの複製 1 つが、その質問をキー読み取りに変えます。スキャッターは依然として起きますが、読みのたびに大きくではなく、書きのたびに小さく起きます。
- **質問が本当にまれなら、fan-out を受け入れます。** 毎晩すべてのシャードを走査する突き合わせは問題ありません。痛いのは、リクエスト経路の上で、リクエストの頻度で起きる fan-out です。ユーザー 1 人のページ表示がシャード 1 つぶんの仕事に膨らむからです。
- パーティションキーを決めるのを先送りする手段としては**使わないでください。** トラフィックの大半が fan-out を必要とするなら、そのワークロードにキーが合っていないということであり、全員に何もかもを尋ねる設計は並列性では直りません。

## 注意点

- fan-out はテールレイテンシを掛け算します。スキャッターはいちばん遅い参加者が終わってはじめて終わるので、答えはシャードのレイテンシ分布の真ん中ではなくテールから引かれます。99 パーセンタイルが 200 ms のシャードが 10 あれば、任意のクエリが 200 ms を払う確率はおよそ 10% になり、シャードを増やすほどそれは確実になります。シャードを増やすことは、キーのある読み取りを安くし、キーのない読み取りをより悪くします。
- fan-out は失敗の面積も掛け算します。扇の中のシャードひとつひとつが、落ちたり遅くなったり再配置中だったりしうる対象であり、全部が答える確率は扇が広がるほど下がります。シャードが 1 つ欠けたときにそれが印付きの不完全結果なのか丸ごとの失敗なのかをエンドポイントごとに決め、印を付けたほうはレスポンスで見えるようにします。静かにシャードが 1 つ欠けた答えは、エラーより悪いものです。誰も調べないからです。
- 合わせる段階が、結果集合の全体をルーターへ引き寄せることがあります。上限付きの `ORDER BY`、`DISTINCT`、上位 N は、ルーターがすべてのシャードの行をメモリーに抱えて計算していると気づくまでは安く見えます。上限と並び順を各シャードへ押し下げ、シャードごとに `limit` 件だけ求めてストリームを合わせます。それで、際限のない集めが境界のある集めになります。
- シャードをまたぐページ送りには、全体の `OFFSET` ではなくシャードごとのカーソルが要ります。合わせた結果にオフセットを取ると、ページごとにその手前のすべてを、すべてのシャードで読み直して合わせ直すことになります。カーソルをシャードごとに持ち、消費したものだけを進め、その全部を包んだ不透明なトークンを呼び出し側に渡します。
- シャードをまたぐトランザクションは別のパターンです。fan-out は読み取り専用にしておきます。スキャッターが書き込みまでした瞬間に、two-phase commit や saga の領域に入ります。ロックがマシンをまたいで保たれ、調整役が prepare と commit のあいだで死にうるからです。
- 撒いた回数を数えます。キーのないクエリとキーのあるクエリの比はパーティションキーの健康指標であり、その比は流れていきます。誰かがフィルターを足し、誰かが画面を足し、1 年後にはトラフィックの半分が fan-out です。計測し、アラートを出し、上がっていくスキャッター比は、プロダクトが尋ねる質問とデータを切ったキーが離れていった合図として扱います。

## .NET では

仕掛けはありふれた `Task.WhenAll` で、規律はキャンセルトークンと結果の形にあります。

```csharp
// シャードごとにではなく、集め全体に 1 つのタイムアウトを掛けます。呼び出し側が
// 待っているのはいちばん遅い答えなので、それが意味のある締め切りです。
public async Task<Totals> TotalAsync(IReadOnlyList<Shard> shards, CancellationToken ct)
{
    using var budget = CancellationTokenSource.CreateLinkedTokenSource(ct);
    budget.CancelAfter(TimeSpan.FromMilliseconds(250));

    var calls = shards.Select(async shard =>
    {
        try
        {
            return (shard.Id, Value: await shard.SumAsync(budget.Token), Ok: true);
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        {
            // このシャードは予算を逃しました。まだエラーではなく、
            // 呼び出し側に伝えなければならない穴です。
            return (shard.Id, Value: 0m, Ok: false);
        }
    });

    var results = await Task.WhenAll(calls);
    var missing = results.Where(r => !r.Ok).Select(r => r.Id).ToArray();
    return new Totals(results.Sum(r => r.Value), missing);
}
```

戻り値の型が要点です。`Totals` はどのシャードが欠けたかを持ち歩くので、呼び出し側もレスポンス本文も、足りない合計を事実のように差し出す代わりに不完全だと言えます。ここで裸の `decimal` を返すメソッドは、答えを正直にしていた唯一の情報を捨てたことになります。

扇が広がったら同時実行数を縛ります。`MaxDegreeOfParallelism` を与えた `Parallel.ForEachAsync` は、64 のシャードを走査する処理がコネクションを 64 本を一度に開くのを防ぎ、`System.Threading.Channels` は各シャードが自分の行を 1 つの合わせ処理へ流し込めるようにして、ルーターがすべての結果集合を実体化しないようにします。

```csharp
// シャードごとに、すでに並んだ `take` 件だけを求めます。すると合わせ処理は
// 全部ではなく最大 `take * shards` 件だけをメモリーに置けば済みます。
await Parallel.ForEachAsync(shards, new ParallelOptions
{
    MaxDegreeOfParallelism = 8,
    CancellationToken = ct,
}, async (shard, token) =>
{
    await foreach (var row in shard.TopAsync(take, token))
        await writer.WriteAsync(row, token);
});
```

Cosmos DB では同じ区別がリクエストのプロパティ 1 つです。述語にパーティションキーが入っているクエリは物理パーティション 1 つが答え、入っていないクエリはパーティションをまたぐクエリになり、SDK は黙ってそれを扇状に広げます。差し止めるフラグはなく、コードレビューでその違いを示すものも何もありません。

```csharp
// キーのあるクエリ: パーティション 1 つ、課金 1 回。
var keyed = container.GetItemQueryIterator<Order>(
    new QueryDefinition("SELECT * FROM c WHERE c.customerId = @id").WithParameter("@id", id),
    requestOptions: new QueryRequestOptions { PartitionKey = new PartitionKey(id) });
```

`PartitionKey` を空のままにすると、すべての物理パーティションへ広がる fan-out になり、リクエスト料金は返った行数に加えてパーティション数につれても大きくなります。物理パーティション 1 つのインデックスを調べるだけで、何にも一致しなくても最低およそ 2.5 RU かかるからです。`QueryRequestOptions.MaxConcurrency` と `MaxItemCount` が fan-out を縛ります。探すべき匂いは、誰もリクエスト料金を読んでいないクエリに載った、パーティションキーのない述語です。キーが分かる場所では必ず `PartitionKey` を設定し、設定できないクエリの RU 料金はグラフに載せてください。

4 番目のステップの仕掛けは、change feed か outbox が要約ドキュメントを動かすことであり、そのドキュメントは質問が尋ねられる形どおりにキーが付いています。

```csharp
// 注文へのすべての書き込みが顧客の累計要約を更新します。かつて撒いていた
// 読み取りが、いまはドキュメント 1 つのポイント読み取りになります。
processor = container
    .GetChangeFeedProcessorBuilder<Order>("summaries", async (changes, token) =>
    {
        foreach (var order in changes)
            await summaries.PatchItemAsync<Summary>(
                id: order.CustomerId,
                partitionKey: new PartitionKey(order.CustomerId),
                patchOperations: new[] { PatchOperation.Increment("/total", order.Amount) },
                cancellationToken: token);
    })
    .WithInstanceName(instance)
    .WithLeaseContainer(leases)
    .Build();
```

要約は複製なので、書き込みと更新のあいだは古く、更新を一度でも取りこぼせば間違います。どちらも扱えます。change feed は at-least-once の配信を保証し、増分が 2 回当たることは、要約にバージョンや処理済みの印を付けて直すバグです。その代わりに得られるのは、そのままなら持っているすべてのマシンに尋ねなければならなかったストアで、プロダクトがいちばんよく尋ねる質問にキー読み取り 1 回で答える力です。
