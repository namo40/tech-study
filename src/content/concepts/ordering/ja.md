---
title: "Ordering"
summary: "メッセージの順序は、範囲が決まった約束です。消費が並列になった瞬間に全域順序は失われるため、システムはキーの中でだけ順序を保証します。そのキーを選ぶことは、何を順序どおりに守り、何をスケールさせられるままにするかを同時に選ぶことです。"
category: "メッセージングとイベント処理"
scene: ordering
steps:
  - title: "発行順は処理順ではありません"
    text: "+100 が -30 より先に出たのに、並列に動く 2 つのコンシューマーが逆順に終え、一瞬だけ残高がマイナスになりました。失われたものも重複したものもありません。順序だけが覆りました。並列性は、全域順序が死にに行く場所です。"
  - title: "順序はキーの中に生きています"
    text: "同じキー、同じパーティション、1 本の append、1 つのコンシューマー。そのレーンの中では、順序は希望ではなく物理です。違うキーは違うレーンを走り、両者に約束はありません。そしてそれで十分です。2 つの口座は、そもそも互いの順序を必要としていませんでした。"
  - title: "順序を保証してくれるそのキーが、負荷も集めます"
    text: "人気キー 1 つはホットパーティション 1 つです。P0 が沸騰する間 P1 は遊び、コンシューマーを増やしても無駄です。約束そのものがそのキーを 1 本のレーンに釘付けにするからです。順序は並列性で買うものであり、請求書は最も熱いキー宛てに届きます。"
  - title: "約束の範囲は、それを必要とする最小の単位に"
    text: "システム全体の順序ではなく、口座 1 つの順序です。キーごとに自分のレーンを守り、レーンはパーティションに均等に広がり、2 つの性質が同時に成り立ちます。すべての口座が一貫し、すべてのパーティションが忙しくなります。全部に順序を掛ければ全部が直列になり、必要な分だけ掛ければスケールします。"
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

順序は、オンにする機能というより、ほかを選ぶ前に答えておくべき問いです。つまり、何を基準にした順序なのかということです。その答えがキーであり、キーを選ぶことにはスループットの請求書が付いてきます。

- コンシューマーの正しさが順序に依存するときです。入金より先に出金を反映する残高、`paid` より先に `shipped` を受け取るステートマシン、まだ挿入していない行に更新を当てる CDC ストリーム。どれもイベントは全部届いているのに結果だけが誤ります。
- 順序がシステム全体ではなくエンティティ単位のときです。口座が 2 つ、注文が 2 つ、デバイスが 2 つ。それぞれの内部では順序が要り、互いの間では要りません。順序保証が作られた場所がここです。約束と並列性を同時に守れる唯一のケースだからです。
- 滞留を解くためにコンシューマーを増やそうとしている瞬間です。増えた同時実行が何を並べ替えてよいのかを詰めるべきときが、まさにそこです。「コンシューマーを増やそう」と「順序は守ろう」は、1 つの文の中で反対方向に引っ張り合います。
- 再生が元の実行と同じ結果を出す必要があるときです。履歴から作り直したプロジェクションが再現可能であるためには、再生が各キーのイベントをログの持つ順序どおりに適用しなければなりません。

## 注意点

- 全域 FIFO と並列に動くコンシューマーは、チューニングの問題ではなく矛盾です。1 つのキューを 4 つのワーカーで分ければ順序はまったく無くなり、どの設定でも戻りません。両方を得る道は、約束をストリーム全体より小さくすることだけです。
- 再試行とデッドレターキューは順序を音もなく壊しますが、壊れる場所は思っているところではありません。セッションやパーティションは失敗したメッセージを同じ位置に戻すので、再試行そのものは順序に何の代価も払わせません。壊すのは再試行の予算が尽きる瞬間で、そこでブローカーはそのメッセージを脇へ置き、レーンの残りを先へ進めてしまいます。あとから戻したデッドレターは、元の位置ではなく新しいシーケンス番号を持って到着するので、失った順序はもう取り戻せません。ですからキー単位の順序にはキー単位のエラー処理が要ります。そのキーを止めるのか、欠落を記録するのか、人に渡すのかを先に決めておいてください。
- タイムスタンプは順序ではありません。プロデューサーの時計はずれ、1 ミリ秒差で刻まれた 2 つのイベントが実際には逆順に出ていたこともあります。システムが実際に知っている順序は、1 つのパーティション内のシーケンスだけです。タイムスタンプはいつだったかのヒントであって、何の後だったかの主張ではありません。
- ホットなキー 1 つがスループットを釘付けにします。有名人の口座、1 つの倉庫、突出して忙しいテナント 1 つ。そのキーのイベントは構造上すべて 1 つのパーティションに、1 つのコンシューマーへ行きます。コンシューマーをいくら増やしても、そのキーの上限はコンシューマー 1 つの速度です。
- コンシューマーはキー単位でシングルスレッドでなければなりません。パーティションのイベントをスレッドプールに渡せば再び並列になり、パーティションが解いていた問題がそのまま戻ります。コンシューマーの中で同時実行が必要なら、バッチ単位ではなくキー単位で直列化してください。チャネル 1 つ、ワーカー 1 つ、キー 1 つです。
- パーティション数を変えるとキーが移ります。個数が変われば、キーの落ちるレーンが変わり、変更が落ち着くまで 1 つのキーのイベントが 2 本のレーンに同時に存在しえます。スライダーではなく、ドレインを伴う移行として扱ってください。

## .NET では

Azure Service Bus はキーをセッションと呼びます。メッセージの `SessionId` がキーであり、ブローカーは 1 つのセッションを一度に 1 つのプロセッサーだけに渡してロックを取ります。「キーごとにコンシューマー 1 つ」がコードの慣習ではなくブローカーの性質になる理由です。

```csharp
var client = new ServiceBusClient(connectionString);

// セッションが仕組みのすべて: 同時に扱うセッションの数がコンシューマーを
// スケールさせ、セッションごとに一度に 1 回しか呼ばないことが各キーの順序を保つ。
var processor = client.CreateSessionProcessor("ledger", new ServiceBusSessionProcessorOptions
{
    MaxConcurrentSessions = 8,           // 一度に 8 キー
    MaxConcurrentCallsPerSession = 1,    // 1 キーの中では一度に 1 メッセージ
    AutoCompleteMessages = false,
    SessionIdleTimeout = TimeSpan.FromSeconds(30),
});

processor.ProcessMessageAsync += async args =>
{
    var entry = args.Message.Body.ToObjectFromJson<LedgerEntry>();
    try
    {
        await ledger.ApplyAsync(args.SessionId, entry, args.CancellationToken);
        await args.CompleteMessageAsync(args.Message, args.CancellationToken);
    }
    catch (Exception ex) when (args.Message.DeliveryCount >= 5)
    {
        // セッションは失敗したメッセージを同じ位置に戻すので、再試行そのものは
        // 順序を壊さない。壊すのは予算の尽きる瞬間で、ブローカーがそのメッセージを
        // デッドレターにして残りのセッションを先へ進めてしまう。その前に欠落を
        // セッション状態へ記録する。
        await args.SetSessionStateAsync(
            new BinaryData($"poisoned at {args.Message.SequenceNumber}"), args.CancellationToken);
        await args.DeadLetterMessageAsync(
            args.Message, "SessionPoisoned", ex.Message, args.CancellationToken);
    }
};

// エラーハンドラーが見るのはポンプ自体の障害だけなので、セッションについての
// 判断は上の、失敗したメッセージの隣に置く。
processor.ProcessErrorAsync += args =>
{
    logger.LogError(args.Exception, "ledger pump: {Source}", args.ErrorSource);
    return Task.CompletedTask;
};

await processor.StartProcessingAsync();
```

送る側はプロパティ 1 つで、このページ全体が扱う設計判断がまさにその 1 行です。

```csharp
await sender.SendMessageAsync(new ServiceBusMessage(payload)
{
    SessionId = accountId,   // 約束の範囲を、ここで選ぶ
});
```

Azure Event Hubs は同じ線をパーティションで引きます。`PartitionKey` がハッシュされて 1 つのパーティションに割り当てられ、そのキーを持つイベントはすべてそのパーティションのログへ順番に append され、`EventProcessorClient` はコンシューマーグループの中でパーティション 1 つをちょうど 1 つのインスタンスに任せます。

```csharp
await using var producer = new EventHubProducerClient(connectionString, "ledger");

// 同じキー、同じパーティション、同じ順序。大きさではなくキーでまとめることが、
// それを本当のままにする。
using var batch = await producer.CreateBatchAsync(new CreateBatchOptions { PartitionKey = accountId });
batch.TryAdd(new EventData(payload));
await producer.SendAsync(batch);
```

消費側で正確に押さえておくことが 2 つあります。`ProcessEventAsync` は 1 つのパーティションの中では一度に 1 イベントずつ呼ばれ、別のパーティションは並行して動くので、ハンドラーを最後まで `await` している限りそのパーティションの順序は保たれます。ところが `await` せずに処理を投げたり、イベントをバックグラウンドのキューに渡したりした瞬間に保証は消え、誰も教えてくれません。そしてチェックポイントはパーティション単位なので、そのレーンがどこまで処理されたかだけを記録します。失敗したイベントを飛ばしてその先にチェックポイントを打ったパーティションは、順序保証をベストエフォートへ静かに置き換えたことになります。

プロセス内では、同じ形がキーごとの `Channel` 1 つになります。チャネルの辞書、チャネルごとに 1 つのリーダータスク、そしてキーでチャネルを選ぶルーターです。このページ全体を最小の形で写した正直なモデルです。ルーターがパーティショナー、チャネルがパーティション、単一リーダーが約束であり、トラフィックの大半を取るキー 1 つが、リーダーのうちちょうど 1 つをボトルネックにします。

```csharp
// キーごとにチャネル 1 つ、チャネルごとにリーダー 1 つ。キーをまたいでは並行に、
// キーの中では厳密な順序で。
private readonly ConcurrentDictionary<string, Lazy<Channel<LedgerEntry>>> lanes = new();

private ChannelWriter<LedgerEntry> LaneFor(string key) =>
    // GetOrAdd は同じキーに対してファクトリーを複数回走らせ、負けた側を捨てる
    // ことがあるので、リーダータスクは一度だけ走る Lazy の中で始める。
    lanes.GetOrAdd(key, k => new Lazy<Channel<LedgerEntry>>(() =>
    {
        var channel = Channel.CreateBounded<LedgerEntry>(new BoundedChannelOptions(256)
        {
            SingleReader = true,   // 約束を、オプションとして書いたもの
            SingleWriter = false,
        });
        _ = Task.Run(() => DrainAsync(k, channel.Reader));
        return channel;
    })).Value.Writer;
```
