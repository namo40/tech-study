---
title: "Dead Letter Queue"
summary: "デッドレターキューは、ブローカーが決められた回数を超えて配信を試みたメッセージを脇へ置いておく場所です。毒メッセージ 1 つがスループットを削り続けるのをやめ、人を待つようになります。失われるものはありません。履歴を付けたまま停めてあるだけです。"
category: "メッセージングとイベント処理"
scene: dead-letter-queue
steps:
  - title: "毒メッセージ 1 つが列全体のコストになります"
    text: "処理が失敗するとブローカーは再配信し、回数が増えていきます。約束どおり at-least-once です。その間、後ろに並ぶすべてが待ち、キューの深さがその請求書です。"
  - title: "上限は慈悲です"
    text: "3 回目の失敗でブローカーは固執をやめます。メッセージは履歴を付けたまま脇へ移され、コンシューマーは解放されます。毒が列を離れた瞬間、スループットは元に戻ります。失われたものはありません。停めてあるだけです。"
  - title: "そこに置かれたものが理由を語ります"
    text: "再試行を使い切ったメッセージが 2 つ、速く失敗したものと遅く失敗したものが並び、そこへ誰かが手を付ける前に期限切れになったものが 1 つ加わります。どれも理由を付けて到着します。デッドレターキューはゴミ箱ではなく、ラベルの付いた棚です。"
  - title: "深さは警報で、再投入が修理です"
    text: "棚を見張ります。高いまま下がらない数は、いま上流の何かが壊れているという意味です。原因を直し、また動けるものは再投入し、本当に死んだものは記録を残して意図して捨てます。腐らせてはいけません。"
related:
  - label: Competing Consumers
    slug: competing-consumers
  - label: Consumer Acknowledgement
    slug: consumer-acknowledgement
  - label: Work Queue
    slug: work-queue
  - label: Web Queue Worker
    slug: web-queue-worker
  - label: Idempotent Consumer
    slug: idempotent-consumer
  - label: At-Least-Once
    slug: at-least-once
  - label: Message ID
    slug: message-id
  - label: Deduplication
    slug: deduplication
  - label: Retry
    slug: retry
  - label: Transactional Outbox
    slug: transactional-outbox
references:
  - title: Service Bus dead-letter queues
    url: https://learn.microsoft.com/en-us/azure/service-bus-messaging/service-bus-dead-letter-queues
  - title: Message expiration and time to live
    url: https://learn.microsoft.com/en-us/azure/service-bus-messaging/message-expiration
  - title: RabbitMQ dead letter exchanges
    url: https://www.rabbitmq.com/docs/dlx
---

## いつ使うか

- 再試行のあるキューにはすべて必要です。なければ結末は 2 つしかありません。毒メッセージが仕事の前で永遠に回り続けるか、ブローカーが黙って捨てるかです。棚を置くほうがどちらよりましです。
- 再試行では決して直らない理由で失敗するメッセージ。デシリアライズできない本文、誰かが消した行への参照、このコンシューマーが見たことのない契約のバージョンがそれにあたります。
- 期限のある仕事。長く待たされたメッセージは遅れて実行するより脇へ置くほうが妥当です。TTL とデッドレターへの退避は、同じ仕組みを両側から見たものです。
- そうしなければ何が失敗したのかログを掘ることになるすべてのパイプライン。デッドレターキューは「昨夜何かがおかしかった」を、数えられて絞り込めて再実行できる一覧に変えてくれます。

## 注意点

- 配信回数の上限は本物の取引です。大きくすると決して成功しないメッセージにコンシューマーがスループットを費やし、小さくすると遅い依存先 1 つのせいでまともな仕事がまとめてデッドレターキューへ行きます。上限はバックオフと組にしておきます。そうすれば再試行が 1 秒で使い切られず、時間の中に広がります。
- 誰も見ていないデッドレターキューは、手順が増えただけの静かな損失です。深さと最古のメッセージの経過時間に警報を掛け、どちらもデバッグ出力ではなく一級の指標として扱います。数が増えているなら、いま上流の何かが壊れているという意味です。
- 再投入は設計上の重複です。そのメッセージは前の試行ですでに一部の効果を残しているかもしれません。同じメッセージを 2 回受け取っても結果が変わらないコンシューマーであってはじめて再生を安全に提供でき、たいていはメッセージ id と処理済みの記録がその条件になります。
- どのメッセージがなぜデッドレターキューへ行ったのかを記録し、なぜ捨てたのかも記録します。理由こそが棚の価値のすべてで、記録のない破棄は消えてしまったメッセージと見分けが付きません。
- 再生の前に原因を直します。壊れたままの依存先へ戻せば棚がまた埋まるだけで、2 度目の履歴が 1 度目の履歴まで読みにくくします。
- これは他のキューとまったく同じものではありませんし、埋まるに任せた場合の代価はブローカーによって変わります。Service Bus のデッドレターキューは、親のエンティティと切り離して作ることも消すことも大きさを決めることもできず、中では TTL が働かず、掃除してくれるものもなく、そこに溜まったものは親のサイズ上限を食います。ですから誰も空けない棚が、本体のキューに新しい送信を拒ませ始めます。RabbitMQ はそうではなく dead letter exchange を経由してごく普通のキューへ流すので、長さの上限も TTL も、そこからさらにデッドレターへ送る先も、すべて自分で決められます。

## .NET では

Azure Service Bus はすべてのキューとサブスクリプションにデッドレターのサブキューを標準で用意します。`MaxDeliveryCount` がブローカー自身でメッセージを移す時点を決め、`DeadLetterMessageAsync` は再試行が無駄だとすでに分かるときにコンシューマーがその場で移せるようにします。

```csharp
// エンティティの設定: 3 回配信したら、ブローカー自身がメッセージを脇へ置く。
await admin.CreateQueueAsync(new CreateQueueOptions("orders")
{
    MaxDeliveryCount = 3,
    DefaultMessageTimeToLive = TimeSpan.FromMinutes(30),
    DeadLetteringOnMessageExpiration = true,
});

processor.ProcessMessageAsync += async args =>
{
    OrderPlaced order;
    try
    {
        order = args.Message.Body.ToObjectFromJson<OrderPlaced>();
    }
    catch (JsonException ex)
    {
        // 解析できない本文は再試行では直らない。理由を付けて今すぐ棚へ置く。
        await args.DeadLetterMessageAsync(args.Message, "DeserializationFailed", ex.Message);
        return;
    }

    await handler.HandleAsync(order, args.CancellationToken);   // ここで例外を投げてもロックを放棄するだけ
};

// 棚を読み、原因が直ったらメッセージを戻す。
var dead = client.CreateReceiver("orders", new ServiceBusReceiverOptions
{
    SubQueue = SubQueue.DeadLetter,
});

await foreach (var message in dead.ReceiveMessagesAsync())
{
    var reason = message.DeadLetterReason;               // MaxDeliveryCountExceeded、TTLExpiredException、または自分で付けた理由
    var detail = message.DeadLetterErrorDescription;

    if (!CanRunAgain(reason)) { await dead.CompleteMessageAsync(message); continue; }   // 意図して捨てる

    var resubmit = new ServiceBusMessage(message)
    {
        // 新しい id にする。重複検出は元の id の写しを受け付けたうえで
        // 黙って捨ててしまうため。
        MessageId = Guid.NewGuid().ToString(),
    };
    resubmit.ApplicationProperties["original-message-id"] = message.MessageId;

    await sender.SendMessageAsync(resubmit);              // 再投入: 配信回数はまた 1 から
    await dead.CompleteMessageAsync(message);
}
```

知っておく価値のある点が 2 つあります。`DeadLetterMessageAsync` は理由と説明を受け取り、それらはメッセージに `DeadLetterReason` と `DeadLetterErrorDescription` として届きます。仕分けできる棚と、1 つずつ開けるしかない山との差はここで生まれます。そして再投入は新しいメッセージです。`new ServiceBusMessage(message)` で古いメッセージを写すと本文とアプリケーションプロパティは引き継がれますが、`MessageId` まで一緒に残すのは、重複検出を有効にしたエンティティでは罠になります。窓が開いているあいだ、既定で 10 分、長ければ 7 日のあいだ、その写しは送信済みと報告されたうえで捨てられ、元のメッセージのほうは棚から完了済みになっています。写しには新しい id を与え、古い id はアプリケーションプロパティに載せ、重複はその値で落としてください。セッションを有効にしたエンティティでは写しに新しいシーケンス番号も付くので、元の位置ではなくセッションの末尾に並び直します。RabbitMQ は同じことを別の形で用意します。キューの `x-dead-letter-exchange` 引数に名前を書いた dead letter exchange を使い、その先のキューはごく普通のキューです。だからそちらでは再生が単なるもう一度の発行になります。
