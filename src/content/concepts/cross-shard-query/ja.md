---
title: "Cross-Shard Query"
summary: "パーティションキーを載せていないクエリは、すべてのシャードに尋ねなければなりません。質問を撒き、いちばん遅い答えを待ち、集めて合わせます。だから可能なときはキーでルーティングし、避けられないときはファンアウトに予算を付け、いちばんよく尋ねる質問が一シャードの質問になるようにデータの形を変えます。"
category: "データ分散と一貫性"
scene: cross-shard-query
steps:
  - title: "キーのない質問は、全員に尋ねなければなりません"
    text: "ゴーストはすべてのクエリがすべてのシャードへ扇状に広がるのを見せます。マシン三台が働き、答えはひとつ戻り、メーターは質問のたびに三倍回ります。設定を間違えたものはありません。これは単に、分かれたデータの料金表なのです。質問にパーティションキーが載っているかどうかが、料金表のどの行を払うかを決めます。"
  - title: "キーの載った質問は、一シャードの仕事です"
    text: "ルーターがキーを読み、それを所有するひとつのシャードを指し、シャードが三つでも三百でも答えのコストは同じです。シャーディングの取引の全体がこれです。熱い質問がキーを載せるように設計すれば、艦隊は大きくなっても、答えのひとつひとつは一対一の会話のままです。"
  - title: "正当なスキャッターの値段は、いちばん遅いシャードが決めます"
    text: "本当に全員のものである質問もあります。合計や検索のようなものです。ルーターが撒くと、二つは速く答え、gather のバーは三つ目を待ちます。ファンアウトはひとつのクエリを、自分のテールレイテンシとの競走に変えるのです。そしてシャードひとつがまったく答えないなら、前もって選んでおいた道を行きます。印を付けた不完全な結果を返すか、丸ごと失敗するか。沈黙だけは、設計なしに置いておける選択肢ではありません。"
  - title: "いちばんよく尋ねる質問は、一シャードの質問に変えておきます"
    text: "ダッシュボードが毎秒欲しがる要約は、あらかじめ計算して view に置き、書き込みのたびに少しずつ更新し、キーで読み返します。スキャッターは読みのたびではなく、書きのたびに小さく起きます。質問を変えたのではなく、ひとつのシャードに落ちるようにデータの形を変えたのです。複製と少しの古さを局所性と引き換える、正直な取引です。"
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
    url: https://learn.microsoft.com/en-us/azure/cosmos-db/nosql/how-to-query-container
  - title: Materialized View pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/materialized-view
---

## いつ使うか

- **質問にキーがあるならいつでもキーでルーティングし、熱い経路はキーを載せるように設計します。** cross-shard query はオンにする機能ではありません。ルーターにどこを見ればよいかを教えるはずのその一片が欠けたまま質問が届いたときに起きることです。分かれたストアでクエリが遅いとき、まず見るべきはインデックスではなく、そもそも述語にキーが入っていたかどうかです。
- **正当なファンアウトには、高価なエンドポイントとして予算を付けます。** 検索、合計、管理用の全走査、レポートは本当にすべてのシャードのものであり、そうでないふりをしてもコストが見えにくい場所へ移るだけです。こうした質問には専用の経路を与えます。タイムアウトを付けた並列呼び出し、レポートひとつがコネクションプールを占め切らないように区切った同時実行数、そして最初のシャードが黙る前に決めておいた不完全結果のポリシーです。
- **残りはデータの形を変えます。** キーのない同じ質問が毎秒何千回も来るなら、答えはより速いファンアウトではなく別の形です。書き込みのたびに更新する事前計算済みの要約や、逆向きのキーで持った参照テーブルの複製ひとつが、その質問をキー読み取りに変えます。スキャッターは依然として起きますが、読みのたびに大きくではなく、書きのたびに小さく起きます。
- **質問が本当にまれなら、ファンアウトを受け入れます。** 毎晩すべてのシャードを走査する突き合わせは問題ありません。痛いのは、リクエスト経路の上で、リクエストの頻度で起きるファンアウトです。ユーザーひとりのページ表示がシャードひとつぶんの仕事に膨らむからです。
- パーティションキーを決めるのを先送りする手段としては**使わないでください。** トラフィックの大半がファンアウトを必要とするなら、そのワークロードにキーが合っていないということであり、全員に何もかもを尋ねる設計は並列性では直りません。

## 注意点

- ファンアウトはテールレイテンシを掛け算します。スキャッターはいちばん遅い参加者が終わってはじめて終わるので、答えはシャードの遅延分布の真ん中ではなく尾から引かれます。99 パーセンタイルが 200 ms のシャードが十あれば、任意のクエリが 200 ms を払う確率はおよそ 10% になり、シャードを増やすほどそれは確実になります。シャードを増やすことは、キーのある読み取りを安くし、キーのない読み取りをより悪くします。
- ファンアウトは失敗の面積も掛け算します。扇の中のシャードひとつひとつが、落ちたり遅くなったり再配置中だったりしうる対象であり、全部が答える確率は扇が広がるほど下がります。シャードがひとつ欠けたときにそれが印付きの不完全結果なのか丸ごとの失敗なのかをエンドポイントごとに決め、印を付けたほうはレスポンスで見えるようにします。静かにシャードがひとつ欠けた答えは、エラーより悪いものです。誰も調べないからです。
- 合わせる段階が、結果集合の全体をルーターへ引き寄せることがあります。上限付きの `ORDER BY`、`DISTINCT`、上位 N は、ルーターがすべてのシャードの行をメモリに抱えて計算していると気づくまでは安く見えます。上限と並び順を各シャードへ押し下げ、シャードごとに `limit` 件だけ求めてストリームを合わせます。それで、際限のない集めが境界のある集めになります。
- シャードをまたぐページ送りには、全体の `OFFSET` ではなくシャードごとのカーソルが要ります。合わせた結果にオフセットを取ると、ページごとにその手前のすべてを、すべてのシャードで読み直して合わせ直すことになります。カーソルをシャードごとに持ち、消費したものだけを進め、その全部を包んだ不透明なトークンを呼び出し側に渡します。
- シャードをまたぐトランザクションは別のパターンです。ファンアウトは読み取り専用にしておきます。スキャッターが書き込みまでした瞬間に、two-phase commit や saga の領域に入ります。ロックがマシンをまたいで保たれ、調整役が prepare と commit のあいだで死にうるからです。
- 撒いた回数を数えます。キーのないクエリとキーのあるクエリの比はパーティションキーの健康指標であり、その比は流れていきます。誰かがフィルタを足し、誰かが画面を足し、一年後にはトラフィックの半分がファンアウトです。計測し、アラートを出し、上がっていくスキャッター比は、プロダクトが尋ねる質問とデータを切ったキーが離れていった合図として扱います。

## .NET では

仕掛けはありふれた `Task.WhenAll` で、規律はキャンセルトークンと結果の形にあります。

```csharp
// シャードごとにではなく、集め全体にひとつのタイムアウトを掛けます。呼び出し側が
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

扇が広がったら同時実行数を縛ります。`MaxDegreeOfParallelism` を与えた `Parallel.ForEachAsync` は、六十四のシャードを走査する処理がコネクションを六十四本いちどに開くのを防ぎ、`System.Threading.Channels` は各シャードが自分の行をひとつの合わせ処理へ流し込めるようにして、ルーターがすべての結果集合を実体化しないようにします。

```csharp
// シャードごとに、すでに並んだ `take` 件だけを求めます。すると合わせ処理は
// 全部ではなく最大 `take * shards` 件だけをメモリに置けば済みます。
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

Cosmos DB では同じ区別がフラグひとつです。述語にパーティションキーが入っているクエリは物理パーティションひとつが答え、入っていないクエリはパーティションをまたぐクエリになり、SDK は許可したときだけそれを走らせます。

```csharp
// キーのあるクエリ: パーティションひとつ、課金一回。
var keyed = container.GetItemQueryIterator<Order>(
    new QueryDefinition("SELECT * FROM c WHERE c.customerId = @id").WithParameter("@id", id),
    requestOptions: new QueryRequestOptions { PartitionKey = new PartitionKey(id) });
```

`PartitionKey` を空のままにすると、すべての物理パーティションへ広がるファンアウトになり、リクエスト料金は返った行数ではなくパーティション数につれて大きくなります。`QueryRequestOptions.MaxConcurrency` と `MaxItemCount` がそれを縛りますが、パーティションをまたぐクエリを静かに、どこでも有効にしておくことが匂いです。高価なクエリをコードレビューで安いクエリのように見せてしまうからです。

第四段階の仕掛けは、change feed か outbox が要約ドキュメントを動かすことであり、そのドキュメントは質問が尋ねられる形どおりにキーが付いています。

```csharp
// 注文へのすべての書き込みが顧客の累計要約を更新します。かつて撒いていた
// 読み取りが、いまはドキュメントひとつのポイント読み取りになります。
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

要約は複製なので、書き込みと更新のあいだは古く、更新をいちどでも取りこぼせば間違います。どちらも扱えます。change feed は少なくとも一回の配信を保証し、増分が二回当たることは、要約にバージョンや処理済みの印を付けて直すバグです。その代わりに得られるのは、そのままなら持っているすべてのマシンに尋ねなければならなかったストアで、プロダクトがいちばんよく尋ねる質問にキー読み取り一回で答える力です。
