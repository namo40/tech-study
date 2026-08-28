---
title: "Publish/Subscribe"
summary: "発行-購読は 1 つのイベントを購読ごとの写しとして配ります。購読者はそれぞれ自分の位置から自分のペースで読み、落ちて戻れば離れた場所から再開し、発行者は彼らが存在することさえ最後まで知りません。"
category: "メッセージングとイベント処理"
scene: publish-subscribe
steps:
  - title: "1 つのイベント、購読ごとに写し"
    text: "キューは一人に仕事を渡し、トピックは全員に写しを渡します。イベントが三つ出て、それぞれ二回ずつ届きます。購読ごとに一回ずつです。発行者は発行して立ち去るだけで、何人が聞いているかを最後まで知りません。その無知こそが結合の除去です。"
  - title: "購読ごとの自分のペース"
    text: "どの購読も、自分の位置から自分のペースで読みます。A は最新を追い、B は遅れますが、互いの存在を知りません。offset は共有ログに挟んだしおりにすぎず、しおりを持つ遅い読者は誰も塞ぎません。"
  - title: "落ちても位置は記録にある"
    text: "落ちた購読者が失うのは時間だけです。B は位置を checkpoint に記録して落ち、イベントを二つ逃します。逃したものは B のメモリではなくログで待っています。再起動すれば checkpoint から再開し、たまった分を空けます。ログが安全網であり、checkpoint はその上に降り立つ場所です。"
  - title: "新しい購読と保持期間"
    text: "新しい購読者は自分の始点を選びます。C はずっと後に合流し、最初から履歴を再生します。ログが保管してくれた同じイベントをもう一度受け取るのです。ただし保持期間が但し書きです。ログは窓を保管するのであって、永遠を保管するのではありません。その窓の外は、生まれたての購読者にも見えません。"
related:
  - label: Competing Consumers
    slug: competing-consumers
  - label: Work Queue
    slug: work-queue
  - label: Event Stream
    slug: event-stream
  - label: Offset
    slug: offset
  - label: Checkpoint
    slug: checkpoint
  - label: Ordering
    slug: ordering
  - label: Event Replay
    slug: event-replay
  - label: Event Sourcing
    slug: event-sourcing
  - label: Transactional Outbox
    slug: transactional-outbox
  - label: At-Least-Once
    slug: at-least-once
  - label: Dead Letter Queue
    slug: dead-letter-queue
references:
  - title: Publisher-Subscriber pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/publisher-subscriber
  - title: Service Bus queues, topics, and subscriptions
    url: https://learn.microsoft.com/en-us/azure/service-bus-messaging/service-bus-queues-topics-subscriptions
  - title: EventPosition (Event Hubs)
    url: https://learn.microsoft.com/en-us/dotnet/api/azure.messaging.eventhubs.consumer.eventposition
---

## いつ使うか

- 1 つの事実に独立した反応がいくつもぶら下がるときです。`OrderPlaced` はメール、分析、在庫、監査のすべてに届く必要がありますが、その四つのどれも注文が入った理由ではありません。
- コンシューマーを増やすことが producer に触れてはならないときです。新しい購読は購読側のデプロイでしかなく、発行側では何事も起きません。結合がないという言葉の実際がこれです。
- 再生や backfill が重要なときです。ログを土台にしたブローカーなら、新しいコンシューマーが最初から始めて履歴を畳み直し、自分のビューを作れます。プロジェクションを移行する代わりに、捨てて作り直せるということです。
- コンシューマーごとに速度が違い、それでよいときです。夜間の分析ジョブとリアルタイムの通知サービスが 1 つのストリームを共有しても、遅いほうが速いほうの問題になりません。

## 注意点

- 発行-購読が増やすのは配信であって理解ではありません。購読者ごとに自前のリトライ、自前の dead-letter queue、すでに見たメッセージが再び来ても耐える処理が必要です。fan-out は同じバグが N 回走るようになる、ということでもあります。
- 誰も空けない購読は際限なく伸びます。Service Bus ではその購読の滞留が名前空間のクォータを削り、やがて埋めてしまいます。Event Hubs では保持期間の外へ押し出されたコンシューマーが、読めなかったイベントを静かに失います。エラーだけでなく遅れにも通知を仕掛けておいてください。
- 順序はよくてパーティション単位で、しかもそのパーティションを 1 つのコンシューマーが持つときだけです。トピック全体に全体順序はないので、「作成が更新より先」を前提にするハンドラーにはパーティションキーか Service Bus のセッション、あるいはイベントに載せたバージョンが要ります。
- 配信は少なくとも 1 回です。作業と checkpoint のあいだで落ちれば同じ写しが二回届くので、ハンドラーは再実行しても安全でなければなりません。
- フィルターは無料ではありません。Service Bus の SQL フィルターは購読ごと、メッセージごとに評価されるため、重なり合う規則が数十あるトピックは、安上がりな fan-out をメッセージ単位のルールエンジンに変えてしまいます。一致を見るだけの場所には correlation フィルターを使ってください。
- 発行者の無知は諸刃です。購読が消されたか、設定を誤っているか、すべてのメッセージで例外を投げているかを発行者に知らせるものは何もありません。fan-out の健康は購読側から見張ることになります。

## .NET では

Azure Service Bus はこの境界をトピックと購読で引きます。一度送れば購読ごとに写しが 1 つでき、各購読は自分のプロセッサーが自分の並行度と自分の dead-letter queue を持って空けていきます。

```csharp
var client = new ServiceBusClient(connectionString);

// 購読 1 つにプロセッサー 1 つ。ここのどこにも発行者の名前はなく、
// 発行者のする仕事のどこにもこのコードの名前はない。
var processor = client.CreateProcessor("orders", "inventory", new ServiceBusProcessorOptions
{
    MaxConcurrentCalls = 4,
    PrefetchCount = 20,
    AutoCompleteMessages = false,        // 作業が durable になってから complete
    MaxAutoLockRenewalDuration = TimeSpan.FromMinutes(5),
});

processor.ProcessMessageAsync += async args =>
{
    var placed = args.Message.Body.ToObjectFromJson<OrderPlaced>();

    // 少なくとも 1 回: この写しは前にも来ているかもしれない。
    if (await processed.TryMarkAsync(args.Message.MessageId, args.CancellationToken))
    {
        await inventory.ReserveAsync(placed, args.CancellationToken);
    }

    await args.CompleteMessageAsync(args.Message, args.CancellationToken);
};

processor.ProcessErrorAsync += args => { logger.LogError(args.Exception, "inventory subscription"); return Task.CompletedTask; };
await processor.StartProcessingAsync();
```

同じトピックに `analytics` 購読を足す作業は、別のサービスで `CreateProcessor` をもう一度呼ぶだけです。発行者の `SendMessageAsync` は変わらず、そのことを知りもせず、遅くもなりません。どの購読までメッセージが届くかは規則とフィルターが決めます。`Subject` やアプリケーションプロパティを見る correlation フィルターは索引の参照に近く、SQL フィルターはメッセージごとに評価される式なので、既定は安いほうに寄せておくのが無難です。

Azure Event Hubs は同じ境界を別の引き方でつくり、シーンの 3 番目と 4 番目のステップが語るのはこちらの形です。パーティションに分かれたログが 1 つあり、コンシューマーグループが購読にあたり、その位置はブローカーが握るロックではなく blob ストレージに書かれる checkpoint です。

```csharp
var storage = new BlobContainerClient(storageConnectionString, "checkpoints");
var processor = new EventProcessorClient(storage, "analytics", eventHubConnectionString, "orders");

processor.ProcessEventAsync += async args =>
{
    if (!args.HasEvent) return;
    await projection.ApplyAsync(args.Data, args.CancellationToken);

    // checkpoint は再起動が降り立つ場所だ。作業のあとに書き、
    // イベントごとには書かない。一回が blob への書き込み一回になる。
    if (args.Data.SequenceNumber % 100 == 0)
    {
        await args.UpdateCheckpointAsync(args.CancellationToken);
    }
};
```

`EventProcessorClient` は保存された checkpoint からコンシューマーグループを始め、checkpoint がなければ `EventPosition` から始めます。`EventPosition.Earliest` は保持期間がまだ握っているものをすべて再生し、`EventPosition.Latest` は今から来るものだけを受け取ります。4 番目のステップで C がした選択がこれで、一行の判断のわりに結果の差は大きいものです。checkpoint を自分で書くという事実から二つのことが出てきます。副作用が durable になってから checkpoint を書かないと、途中で落ちたときに作業は繰り返される代わりに消えます。そして望ましい失敗は繰り返されるほうです。またイベントごとではなく一定の間隔で書きます。`UpdateCheckpointAsync` 一回が blob ストレージへの往復一回なので、実際に決めるのは、落ちたあと何件まで処理し直す覚悟があるかということです。
