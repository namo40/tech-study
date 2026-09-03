---
title: "RabbitMQ"
summary: "RabbitMQ は自分たちで運用するオープンソースのブローカーです。発行側は交換器へ送り、どのキューに写しが届くかはバインディングが決めます。ルーティングはクラウドのサービスが代わりに決めるものではなく、標準のプロトコルの上で自分たちがブローカーへ宣言するものです。"
category: "メッセージングとイベント処理"
related:
  - label: Work Queue
    slug: work-queue
  - label: Web-Queue-Worker
    slug: web-queue-worker
  - label: Competing Consumers
    slug: competing-consumers
  - label: Dead Letter Queue
    slug: dead-letter-queue
  - label: Publish/Subscribe
    slug: publish-subscribe
  - label: Backpressure
    slug: backpressure
  - label: MassTransit
    slug: masstransit
  - label: Azure Service Bus
    slug: azure-service-bus
references:
  - title: RabbitMQ documentation
    url: https://www.rabbitmq.com/docs
  - title: ".NET/C# Client API Guide"
    url: https://www.rabbitmq.com/client-libraries/dotnet-api-guide
---

## いつ使うか

- ブローカーが自分たちの動く場所で動き、誰のものでもない必要があるときに選びます。サーバーにもコンテナーにも Kubernetes のクラスターにも入りますし、AMQP 0-9-1 を話すのでクライアントが特定のベンダーに縛られません。ノートパソコンからデータセンターへ、さらに別のクラウドへ移っても、住所が違うだけの同じブローカーです。
- ルーティングがコンシューマーではなくブローカーにあるべきときに使います。交換器の種類がそのまま表に出たルーティングの規則です。`direct` はルーティングキーを正確に合わせ、`topic` は `orders.*.created` のような形を合わせ、`fanout` は自分に束ねられたすべてへ写し、`headers` は属性で合わせます。読み手を新しく足すことはバインディングを足すことであって、発行側のコードを直すことではありません。
- ワーカーの群れに仕事を公平に配る作業キューを作るときに使います。複数のコンシューマーがひとつのキューを分け合い、それぞれが確認応答をしていないメッセージを決まった数だけ抱えます。ブローカーは、すでに忙しいワーカーへ順番に配るのではなく、余裕のある側へ次のメッセージを渡します。
- 開発とテストと本番が同じブローカーであってほしいときに持ち出します。イメージは数秒で立ち上がり、管理の UI は自分たちのコードが宣言した交換器とキューをそのまま見せます。手元でデバッグした振る舞いが、エミュレーターの近似ではなく本番で実際に得られる振る舞いです。

## 注意点

- 既定の上限なしの prefetch は初日に直すべき落とし穴です。prefetch はコンシューマーが抱えられる未確認のメッセージの上限です。上限がなければ、ブローカーは先につながったコンシューマー一台へキューをまるごと押し込みます。ほかのワーカーは遊び、メモリーは膨らみ、そのコンシューマーが落ちればそのメッセージのすべてが再配信されます。`BasicQos` を小さな数に決め、必要なときに意識して上げてください。
- 確認応答を受け取れなかった仕事は戻ってきますし、ですから重複は例外ではなく普通のことです。ack の前にチャネルが閉じたり接続が切れたりすると、ブローカーはメッセージをキューへ戻し、別のコンシューマーがそれを動かします。ですから外に副作用を残すコンシューマーには、メッセージ id とすでに処理したものの記録が要ります。確認応答は作業の前ではなく作業のあとで行い、再試行では決して直らないメッセージには `requeue: false` を付けた `BasicNack` と配信不能の交換器を使います。
- クラシックなキューはひとつのノードに住み、クラスターを組んだだけでそれが変わるわけではありません。そのノードが落ちればキューは使えなくなり、耐久性がなければ消えます。複製は明示的な選択です。ノードをひとつ失っても残らなければならないものには quorum queue を宣言し、キューは durable に、メッセージは persistent に印を付け、耐久性の代金は発行の経路でのディスクへの書き込みで払うことを覚えておきます。
- 運用は自分たちの仕事で、マネージドなブローカーが隠していたやり方で壊れます。メモリーとディスクの水位は発行側を流量の制御で止め、短命な接続が数千あればファイル記述子が尽き、上限のないキューはやがて自分のコンシューマーだけでなくノード全体を止めます。キューの長さの上限を置き、水位を見張り、障害の日ではなく計画に沿って上げてください。

## .NET では

- 公式の `RabbitMQ.Client` のパッケージが接続とチャネルとコンシューマーを与えます。トポロジーは起動時に宣言し、消費を始める前に prefetch を決め、確認応答は作業が成功したあとにだけ送ります。

```csharp
var factory = new ConnectionFactory { HostName = "localhost" };
await using var connection = await factory.CreateConnectionAsync();
await using var channel = await connection.CreateChannelAsync();

// Declaring is safe to repeat: it creates or verifies, it does not duplicate.
await channel.QueueDeclareAsync("orders", durable: true, exclusive: false, autoDelete: false);

// The cap on in-flight messages. Without it the first consumer takes the lot.
await channel.BasicQosAsync(prefetchSize: 0, prefetchCount: 16, global: false);

var consumer = new AsyncEventingBasicConsumer(channel);
consumer.ReceivedAsync += async (_, ea) =>
{
    try
    {
        await handler.HandleAsync(Decode(ea.Body.Span));
        await channel.BasicAckAsync(ea.DeliveryTag, multiple: false);
    }
    catch (PoisonMessageException)
    {
        // No requeue: the dead-letter exchange on the queue takes it from here.
        await channel.BasicNackAsync(ea.DeliveryTag, multiple: false, requeue: false);
    }
};

await channel.BasicConsumeAsync("orders", autoAck: false, consumer: consumer);
```

- 宣言は何度繰り返しても安全です。なければ作り、あれば確かめるだけで、同じものを二重には作りません。いっぽう接続は高く付き、チャネルはスレッドに対して安全ではありません。アプリケーションごとに長く生きる接続をひとつ開き、コンシューマーや発行するスレッドごとに自分のチャネルを渡してください。チャネルをスレッドで共有するとプロトコルのフレームが壊れ、ブローカーの不具合のように見える失敗が出ます。クライアントの自動の回復は、ネットワークが切れたあとに接続とチャネルとコンシューマーを開き直してくれるので、有効のままにしておく価値があります。
- `autoAck: true` は多くても一度で、望みどおりであることはまれです。配信の時点で確認応答をしてしまうので、ハンドラーの途中で落ちるとメッセージは静かに消えます。上の再配信を成り立たせているのは手動の確認応答です。
- 発行側の確認は、メッセージを失わない話のもう半分です。発行はブローカーが確認するまでは送りっぱなしなので、仕事を落としてはならない発行側は確認を待ちます。durable なキューと persistent なメッセージと発行側の確認、この三つがブローカーの再起動を越えるための一式です。
