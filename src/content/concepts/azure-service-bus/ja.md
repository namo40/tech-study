---
title: "Azure Service Bus"
summary: "Azure Service Bus は Azure のマネージドなメッセージブローカーです。コマンドにはキュー、ファンアウトにはトピックとサブスクリプションを使い、ロックに基づく消費のモデルでは、再配信もデッドレターへの退避も順序付きのセッションも、自分たちが書くコードではなくサービスに付いてくる装備です。"
category: "メッセージングとイベント処理"
related:
  - label: Work Queue
    slug: work-queue
  - label: Web Queue Worker
    slug: web-queue-worker
  - label: Competing Consumers
    slug: competing-consumers
  - label: Dead Letter Queue
    slug: dead-letter-queue
  - label: Publish/Subscribe
    slug: publish-subscribe
  - label: Ordering
    slug: ordering
  - label: MassTransit
    slug: masstransit
  - label: RabbitMQ
    slug: rabbitmq
references:
  - title: "What is Azure Service Bus?"
    url: https://learn.microsoft.com/en-us/azure/service-bus-messaging/service-bus-messaging-overview
  - title: "Send and receive messages from an Azure Service Bus queue (.NET)"
    url: https://learn.microsoft.com/en-us/azure/service-bus-messaging/service-bus-dotnet-get-started-with-queues
---

## いつ使うか

- ワークロードが Azure にあり、メッセージがコマンドであれば既定にします。ワーカーの前にキューを置けば遅いリクエストが受け付けられたリクエストに変わりますし、マネージドなサービスなので当てるべきブローカーの修正も、定足数を保つクラスターもありません。SDK も Functions のトリガーもマネージド ID の連携も、残りのアプリケーションが動いている基盤にすでにつながっています。
- 1 つのイベントを互いに無関係な複数の読み手が受け取るときはトピックとサブスクリプションを使います。発行側はトピックへ送り、サブスクリプションごとに自分のフィルターと自分の配信回数と自分のデッドレターキューを持つ写しを抱えます。ですから遅いコンシューマーや壊れたコンシューマーは、発行側や隣ではなく自分のサブスクリプションだけを詰まらせます。
- at-most-once の読み取りではなく、ロックに基づく消費が欲しいときに使います。peek-lock のモードでは、受け取ったメッセージは他のコンシューマーからは見えませんがブローカーの上には残っています。完了すれば消え、放棄すればすぐ戻って次の試行を待ち、どちらもしなければロックが切れて自分で戻ってきます。落ちても失わないほうが既定であって、あとから足す機能ではありません。
- 関連するメッセージの群れを 1 つのコンシューマーが順に処理する必要があるときはセッションを持ち出します。セッション id は、そのキーを持つすべてのメッセージをセッションのロックが掛かった受信側 1 つに束ねます。コンシューマーを何台も並べても顧客ごとや注文ごとの順序が残る仕組みがこれです。

## 注意点

- ロックの保持時間は処理時間についての約束で、それを破ると重複という代金を払います。ロックは長くても 5 分です。切れるとメッセージはまた見えるようになり、最初のハンドラーがまだ働いている最中に別の側へ配信され、同じ仕事が二度起きます。長い作業が動いている間はロックを更新し、`MaxAutoLockRenewalDuration` は中央値ではなく現実的に最悪の場合に合わせてください。それでもネットワークの乱れでロックは失われうるので、ハンドラーは二度動いても平気な形にしておきます。
- デッドレターへの退避は自動で、しかも静かです。メッセージが `MaxDeliveryCount` を超えるか、期限切れ時の退避を有効にしたまま期限を過ぎると、ブローカーはそれをそのエンティティのデッドレターのサブキューへ移し、以後は何も言いません。失敗するものもなく、警報も鳴らず、送った側から見れば仕事は終わったように見えます。読む人もおらずデッドレターキューの深さへの警報もないキューは、丁寧にメッセージを失うキューです。
- 階層は値段だけの話ではなく機能の決定です。メッセージの大きさの上限もスループットも、大きなメッセージのような機能も、Basic と Standard と Premium で違いますし、Premium の専用のリソースは待ち時間を見通せるものにしてくれるものでもあります。ペイロードが育って上限を越えた瞬間に本番で天井を見つけるのは、設計がどの階層を前提にしていたかを知るには最も高くつくやり方です。
- これはブローカーであってストリームではありません。Service Bus は、それぞれにルーティングとロックと配信回数が必要な数十万件の規模のメッセージのために作られています。大量のテレメトリーを取り込み、オフセットから読み直す仕事は Event Hubs のものです。選び違えると、エラーのメッセージではなく費用と制限として表に出ます。

## .NET では

- `ServiceBusProcessor` が受信のループで、ロックのポリシーが住む場所はそのオプションです。ハンドラーが完了と放棄を自分で決め、エラーのハンドラーは省けるものではありません。それがないと、ポンプの中で起きた失敗が見えなくなります。

```csharp
await using var client = new ServiceBusClient(fullyQualifiedNamespace, new DefaultAzureCredential());

var processor = client.CreateProcessor("orders", new ServiceBusProcessorOptions
{
    MaxConcurrentCalls = 8,
    // 代わりに始末を付けないでください。決めるのはハンドラーです。
    AutoCompleteMessages = false,
    // 長い作業はロックを保ち続け、知らないうちに再配信されることがありません。
    MaxAutoLockRenewalDuration = TimeSpan.FromMinutes(10),
});

processor.ProcessMessageAsync += async args =>
{
    try
    {
        await handler.HandleAsync(args.Message.Body.ToObjectFromJson<OrderPlaced>(), args.CancellationToken);
        await args.CompleteMessageAsync(args.Message);
    }
    catch (Exception ex) when (ex is TimeoutException or ServiceBusException { IsTransient: true })
    {
        // すぐキューへ戻します。配信回数が増え、MaxDeliveryCount に達すると
        // ブローカーが断りなくデッドレターへ送ります。
        await args.AbandonMessageAsync(args.Message);
    }
};

processor.ProcessErrorAsync += args =>
{
    logger.LogError(args.Exception, "{Source}", args.ErrorSource);
    return Task.CompletedTask;
};
await processor.StartProcessingAsync();
```

- Azure Functions の Service Bus トリガーは、ポンプを隠した同じモデルですが、手で操ることもできます。バインディングは戻り値でメッセージの始末を付けますが、トリガーに `AutoCompleteMessages = false` を付けて `ServiceBusMessageActions` のパラメーターを受け取れば、`CompleteMessageAsync` や `AbandonMessageAsync` や `DeadLetterMessageAsync` で自分で始末を付けられますし、ロックの更新は host.json の `maxAutoRenewDuration` です。セッションやプリフェッチや同時実行数をコードの中で握らなければならないときは、上のプロセッサーのほうが正直な形になります。
- デッドレターキューは普通のエンティティとして読みます。受信側に `SubQueue.DeadLetter` を指定して宛先にし、メッセージごとに `DeadLetterReason` と `DeadLetterErrorDescription` が付いています。戻すことは写しを元のエンティティへ送ることで、そうすれば配信回数もまた最初から始まります。
- 予約されたメッセージと重複検出は、自分で作り直す前に知っておく価値のあるブローカーの機能です。`ScheduleMessageAsync` は自分たちのプロセスにタイマーを置かずに未来の時刻へメッセージを届け、重複検出は設定した時間の窓の中で同じ `MessageId` がまた来たら捨てます。その窓は既定で 10 分、20 秒から 7 日まで設定できます。発行側の再試行はこれで覆えますが、コンシューマー側の 2 度目の配信は覆えません。しかも予約されたメッセージも検査の対象なので、元の `MessageId` を保ったままの再試行の写しやデッドレターキューからの再送は、送信済みと報告されたうえで、窓が開いている間は捨てられます。
