---
title: "Dead Letter Queue"
summary: "dead-letter queue は、ブローカーが何度も配送を試みたメッセージを脇へ置いておく場所です。毒メッセージ一つがスループットを削り続けるのをやめ、人を待つようになります。失われるものはありません。履歴を付けたまま停めてあるだけです。"
category: "メッセージングとイベント処理"
scene: dead-letter-queue
steps:
  - title: "毒メッセージ一つが列全体のコストになります"
    text: "処理が失敗するとブローカーは再配送し、回数が増えていきます。約束どおり少なくとも一回です。その間、後ろに並ぶすべてが待ち、キューの深さがその請求書です。"
  - title: "上限は慈悲です"
    text: "三回目の失敗でブローカーは固執をやめます。メッセージは履歴を付けたまま脇へ移され、コンシューマーは解放されます。毒が列を離れた瞬間、スループットは元に戻ります。失われたものはありません。停めてあるだけです。"
  - title: "そこに置かれたものが理由を語ります"
    text: "どうしても解釈できないメッセージ、再試行が尽きたメッセージ、誰かが届く前に期限切れになったメッセージが、それぞれ理由を付けて到着します。dead-letter queue はゴミ箱ではなく、ラベルの付いた棚です。"
  - title: "深さは警報で、再投入が修理です"
    text: "棚を見張ります。増えていく数は、いま上流の何かが壊れているという意味です。原因を直し、また動けるものは再投入し、本当に死んだものは記録を残して意図して捨てます。腐らせてはいけません。"
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

- 再試行のあるキューにはすべて必要です。なければ結末は二つしかありません。毒メッセージが仕事の前で永遠に回り続けるか、ブローカーが黙って捨てるかです。棚を置くほうがどちらよりましです。
- 再試行では決して直らない理由で失敗するメッセージ。デシリアライズできない本文、誰かが消した行への参照、このコンシューマーが見たことのない契約のバージョンがそれにあたります。
- 期限のある仕事。長く待たされたメッセージは遅れて実行するより脇へ置くほうが妥当です。TTL と dead-letter 処理は、同じ仕組みを両側から見たものです。
- そうしなければ何が失敗したのかログを掘ることになるすべてのパイプライン。dead-letter queue は「昨夜何かがおかしかった」を、数えられて絞り込めて再実行できる一覧に変えてくれます。

## 注意点

- 配送回数の上限は本物の取引です。大きくすると決して成功しないメッセージにコンシューマーがスループットを費やし、小さくすると遅い依存先ひとつのせいでまともな仕事がまとめて dead-letter へ行きます。上限はバックオフと組にしておきます。そうすれば再試行が一秒で使い切られず、広がって配置されます。
- 誰も見ていない dead-letter queue は、手順が増えただけの静かな損失です。深さと最古のメッセージの経過時間に警報を掛け、どちらもデバッグ出力ではなく一級の指標として扱います。数が増えているなら、いま上流の何かが壊れているという意味です。
- 再投入は設計上の重複です。そのメッセージは前の試行ですでに一部の効果を残しているかもしれません。同じメッセージを二回受け取っても結果が変わらないコンシューマーであってはじめて再生を安全に提供でき、たいていはメッセージ id と処理済みの記録がその条件になります。
- どのメッセージがなぜ dead-letter へ行ったのかを記録し、なぜ捨てたのかも記録します。理由こそが棚の価値のすべてで、記録のない破棄は消えてしまったメッセージと見分けが付きません。
- 再生の前に原因を直します。壊れたままの依存先へ戻せば棚がまた埋まるだけで、二度目の履歴が一度目の履歴まで読みにくくします。
- dead-letter queue も他のキューと同じで、自分の割り当てと自分の期限を持ちます。埋まるに任せると受け付けなくなり、そのときは失敗の記録まで本当に失われます。

## .NET では

Azure Service Bus はすべてのキューとサブスクリプションに dead-letter サブキューを標準で用意します。`MaxDeliveryCount` がブローカー自身でメッセージを移す時点を決め、`DeadLetterMessageAsync` は再試行が無駄だとすでに分かるときにコンシューマーがその場で移せるようにします。

```csharp
// Entity setup: three deliveries, then the broker sets the message aside itself.
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
        // A retry cannot fix a payload that does not parse: shelve it now, with the reason.
        await args.DeadLetterMessageAsync(args.Message, "DeserializationFailed", ex.Message);
        return;
    }

    await handler.HandleAsync(order, args.CancellationToken);   // throwing here just abandons the lock
};

// Reading the shelf, and putting a message back once the cause is fixed.
var dead = client.CreateReceiver("orders", new ServiceBusReceiverOptions
{
    SubQueue = SubQueue.DeadLetter,
});

await foreach (var message in dead.ReceiveMessagesAsync())
{
    var reason = message.DeadLetterReason;               // MaxDeliveryCountExceeded, TTLExpired, or yours
    var detail = message.DeadLetterErrorDescription;

    if (!CanRunAgain(reason)) { await dead.CompleteMessageAsync(message); continue; }   // discarded, on purpose

    await sender.SendMessageAsync(new ServiceBusMessage(message)); // resubmit: a fresh delivery count
    await dead.CompleteMessageAsync(message);
}
```

知っておく価値のある点が二つあります。`DeadLetterMessageAsync` は理由と説明を受け取り、それらはメッセージに `DeadLetterReason` と `DeadLetterErrorDescription` として届きます。仕分けできる棚と、一つずつ開けるしかない山との差はここで生まれます。そして再投入は新しいメッセージです。`new ServiceBusMessage(message)` で古いメッセージを写すと本文とアプリケーションプロパティがそのまま引き継がれ、自分で付けた `MessageId` も一緒に来るので、その値で重複を除くコンシューマーは繰り返しだと気付きます。RabbitMQ は同じことを別の形で用意します。キューの `x-dead-letter-exchange` 引数に名前を書いた dead letter exchange を使い、その先のキューはごく普通のキューです。だからそちらでは再生が単なるもう一度の発行になります。
