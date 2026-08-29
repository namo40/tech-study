---
title: "Ordering"
summary: "メッセージの順序は、範囲が決まった約束です。消費が並列になった瞬間に全域順序は失われるため、システムはキーの中でだけ順序を保証します。そのキーを選ぶことは、何を順序どおりに守り、何をスケールさせられるままにするかを同時に選ぶことです。"
category: "メッセージングとイベント処理"
scene: ordering
steps:
  - title: "発行順は処理順ではありません"
    text: "+100 が -30 より先に出たのに、並列の消費者二人が逆順に終え、一瞬だけ残高がマイナスになりました。失われたものも重複したものもありません。順序だけが覆りました。並列性は、全域順序が死にに行く場所です。"
  - title: "順序はキーの中に生きています"
    text: "同じキー、同じパーティション、一本の append、一人の消費者。その車線の中では、順序は希望ではなく物理です。違うキーは違う車線を走り、両者に約束はありません。そしてそれで十分です。二つの口座は、そもそも互いの順序を必要としていませんでした。"
  - title: "順序を保証してくれるそのキーが、負荷も集めます"
    text: "人気キー一つは熱いパーティション一つです。P0 が沸騰する間 P1 は遊び、消費者を増やしても無駄です。約束そのものがそのキーを一本の車線に釘付けにするからです。順序は並列性で買うものであり、請求書は最も熱いキー宛てに届きます。"
  - title: "約束の範囲は、それを必要とする最小の単位に"
    text: "システム全体の順序ではなく、口座一つの順序です。キーごとに自分の車線を守り、車線はパーティションに均等に広がり、二つの性質が同時に成り立ちます。すべての口座が一貫し、すべてのパーティションが忙しい。全部に順序を掛ければ全部が直列になり、必要な分だけ掛ければスケールします。"
related:
  - label: Event Stream
    slug: event-stream
  - label: Hot Partition
    slug: hot-partition
  - label: Publish/Subscribe
    slug: publish-subscribe
  - label: Competing Consumers
    slug: competing-consumers
  - label: Offset
    slug: offset
  - label: Sharding
    slug: sharding
  - label: Consistent Hashing
    slug: consistent-hashing
  - label: Event Sourcing
    slug: event-sourcing
  - label: Event Replay
    slug: event-replay
  - label: At-Least-Once
    slug: at-least-once
  - label: Dead Letter Queue
    slug: dead-letter-queue
references:
  - title: Message sequencing and timestamps
    url: https://learn.microsoft.com/en-us/azure/service-bus-messaging/message-sequencing
  - title: Message sessions (Service Bus)
    url: https://learn.microsoft.com/en-us/azure/service-bus-messaging/message-sessions
  - title: Features and terminology in Azure Event Hubs
    url: https://learn.microsoft.com/en-us/azure/event-hubs/event-hubs-features
---

## いつ使うか

順序は、オンにする機能というより、ほかを選ぶ前に答えておくべき問いです。何を基準にした順序なのか。その答えがキーであり、キーを選ぶことにはスループットの請求書が付いてきます。

- 消費者の正しさが順序に依存するときです。入金より先に出金を反映する残高、`paid` より先に `shipped` を受け取る状態機械、まだ挿入していない行に更新を当てる CDC ストリーム。どれもイベントは全部届いているのに結果だけが誤ります。
- 順序がシステム全体ではなくエンティティ単位のときです。口座が二つ、注文が二つ、デバイスが二つ。それぞれの内部では順序が要り、互いの間では要りません。順序保証が作られた場所がここです。約束と並列性を同時に守れる唯一のケースだからです。
- 滞留を解くために消費者を増やそうとしている瞬間です。増えた同時実行が何を並べ替えてよいのかを詰めるべきときが、まさにそこです。「消費者を増やそう」と「順序は守ろう」は、一つの文の中で反対方向に引っ張り合います。
- 再生が元の実行と同じ結果を出す必要があるときです。履歴から作り直したプロジェクションが再現可能であるためには、再生が各キーのイベントをログの持つ順序どおりに適用しなければなりません。

## 注意点

- 全域 FIFO と並列消費者は、チューニングの問題ではなく矛盾です。一つのキューを四人のワーカーで分ければ順序はまったく無くなり、どの設定でも戻りません。両方を得る道は、約束をストリーム全体より小さくすることだけです。
- リトライとデッドレターキューは、順序を音もなく壊します。失敗して待ってから戻ってきたメッセージは、待っている間に届いたすべてに追い越された状態です。ですからキー単位の順序にはキー単位のエラー処理が要ります。メッセージではなくキーを止めてください。壊れたイベントの後も配信を続けるパーティションは、代価を払って買った性質をすでに失っています。
- タイムスタンプは順序ではありません。プロデューサーの時計はずれ、1 ミリ秒差で刻まれた二つのイベントが実際には逆順に出ていたこともあります。システムが実際に知っている順序は、一つのパーティション内のシーケンスだけです。タイムスタンプはいつだったかのヒントであって、何の後だったかの主張ではありません。
- 熱いキー一つがスループットを釘付けにします。有名人の口座、一つの倉庫、突出して忙しいテナント一つ。そのキーのイベントは構造上すべて一つのパーティションに、一人の消費者へ行きます。消費者をいくら増やしても、そのキーの上限は消費者一人の速度です。
- 消費者はキー単位でシングルスレッドでなければなりません。パーティションのイベントをスレッドプールに渡せば再び並列になり、パーティションが解いていた問題がそのまま戻ります。消費者の中で同時実行が必要なら、バッチ単位ではなくキー単位で直列化してください。チャネル一つ、ワーカー一つ、キー一つです。
- パーティション数を変えるとキーが移ります。個数が変われば、キーの落ちる車線が変わり、変更が落ち着くまで一つのキーのイベントが二本の車線に同時に存在しえます。スライダーではなく、ドレインを伴う移行として扱ってください。

## .NET では

Azure Service Bus はキーをセッションと呼びます。メッセージの `SessionId` がキーであり、ブローカーは一つのセッションを一度に一つのプロセッサーだけに渡してロックを取ります。「キーごとに消費者一人」がコードの慣習ではなくブローカーの性質になる理由です。

```csharp
var client = new ServiceBusClient(connectionString);

// Sessions are the whole mechanism: concurrent sessions scale the consumer,
// and the single call per session is what keeps each key in order.
var processor = client.CreateSessionProcessor("ledger", new ServiceBusSessionProcessorOptions
{
    MaxConcurrentSessions = 8,           // eight keys at once
    MaxConcurrentCallsPerSession = 1,    // one message at a time inside a key
    AutoCompleteMessages = false,
    SessionIdleTimeout = TimeSpan.FromSeconds(30),
});

processor.ProcessMessageAsync += async args =>
{
    var entry = args.Message.Body.ToObjectFromJson<LedgerEntry>();
    await ledger.ApplyAsync(args.SessionId, entry, args.CancellationToken);
    await args.CompleteMessageAsync(args.Message, args.CancellationToken);
};

// A failure inside a session has to stop that session, or the next message
// overtakes the one that failed and the order is gone without a trace.
processor.ProcessErrorAsync += async args =>
{
    logger.LogError(args.Exception, "ledger session");
};

await processor.StartProcessingAsync();
```

送る側はプロパティ一つで、このページ全体が扱う設計判断がまさにその一行です。

```csharp
await sender.SendMessageAsync(new ServiceBusMessage(payload)
{
    SessionId = accountId,   // the scope of the promise, chosen here
});
```

Azure Event Hubs は同じ線をパーティションで引きます。`PartitionKey` がハッシュされて一つのパーティションに割り当てられ、そのキーを持つイベントはすべてそのパーティションのログへ順番に append され、`EventProcessorClient` はコンシューマーグループの中でパーティション一つをちょうど一つのインスタンスに任せます。

```csharp
await using var producer = new EventHubProducerClient(connectionString, "ledger");

// Same key, same partition, same order. Batching by key rather than by size is
// what keeps that true.
using var batch = await producer.CreateBatchAsync(new CreateBatchOptions { PartitionKey = accountId });
batch.TryAdd(new EventData(payload));
await producer.SendAsync(batch);
```

消費側で正確に押さえておくことが二つあります。`ProcessEventAsync` はパーティション一つずつ呼ばれるので、ハンドラーを最後まで `await` している限りそのパーティションの順序は保たれます。ところが `await` せずに処理を投げたり、イベントをバックグラウンドのキューに渡したりした瞬間に保証は消え、誰も教えてくれません。そしてチェックポイントはパーティション単位なので、その車線がどこまで処理されたかだけを記録します。失敗したイベントを飛ばしてその先にチェックポイントを打ったパーティションは、順序保証をベストエフォートへ静かに置き換えたことになります。

プロセス内では、同じ形がキーごとの `Channel` 一つになります。チャネルの辞書、チャネルごとに一つのリーダータスク、そしてキーでチャネルを選ぶルーターです。このページ全体を最小の形で写した正直なモデルです。ルーターがパーティショナー、チャネルがパーティション、単一リーダーが約束であり、トラフィックの大半を取るキー一つが、リーダーのうちちょうど一つをボトルネックにします。

```csharp
// One channel per key, one reader per channel. Concurrency across keys,
// strict order inside a key.
private readonly ConcurrentDictionary<string, Channel<LedgerEntry>> lanes = new();

private ChannelWriter<LedgerEntry> LaneFor(string key) =>
    lanes.GetOrAdd(key, k =>
    {
        var channel = Channel.CreateBounded<LedgerEntry>(new BoundedChannelOptions(256)
        {
            SingleReader = true,   // the promise, stated as an option
            SingleWriter = false,
        });
        _ = Task.Run(() => DrainAsync(k, channel.Reader));
        return channel;
    }).Writer;
```
