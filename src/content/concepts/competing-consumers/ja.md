---
title: "Competing Consumers"
summary: "競合するコンシューマーは 1 つのキューを分け合い、各メッセージはそのうち 1 つだけに渡るので、コンシューマーを増やせばスループットが伸びます。その代わり配信は at-least-once になり全体の順序は失われますが、繰り返しても安全なハンドラーとキーごとの分割がその代償を取り戻します。"
category: "メッセージングとイベント処理"
scene: competing-consumers
steps:
  - title: "コンシューマー 1 つ"
    text: "メッセージは 1 つのコンシューマーが処理し終えるより速く届きます。キューは伸び、メッセージがキューで待つ時間も伸びていきます。"
  - title: "競合するコンシューマー"
    text: "4 つのコンシューマーが同じキューから取ります。各メッセージはそのうち 1 つだけに渡ってスループットは 4 倍になり、プロデューサーが同じ間隔で送り続けても滞留が減っていきます。"
  - title: "at-least-once"
    text: "ack する前に死んだコンシューマーは、メッセージをキューに戻します。別のコンシューマーが仕上げ、ときにはコピーが 2 回届きます。ハンドラーは繰り返しても結果が同じでなければならず、失敗し続けるメッセージはデッドレターキューに送ります。"
  - title: "キーごとの順序"
    text: "競合するコンシューマーは全体の順序を手放します。1 人の顧客や 1 件の注文の中で順序が重要なら、そのキーで分割し、そのキーは 1 つのコンシューマーが順に処理し、ほかは並列に動かします。"
related:
  - label: Work Queue
    slug: work-queue
  - label: Web Queue Worker
    slug: web-queue-worker
  - label: Consumer Acknowledgement
    slug: consumer-acknowledgement
  - label: Idempotent Consumer
    slug: idempotent-consumer
  - label: Consumer Group
    slug: consumer-group
  - label: Deduplication
    slug: deduplication
  - label: At-Least-Once
    slug: at-least-once
  - label: Dead Letter Queue
    slug: dead-letter-queue
  - label: Background Job
    slug: background-job
references:
  - title: Competing Consumers pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/competing-consumers
  - title: RabbitMQ reliability guide
    url: https://www.rabbitmq.com/docs/reliability
  - title: MassTransit consumers
    url: https://masstransit.massient.com/concepts/consumers
---

## いつ使うか

- どの順で処理してもよい独立した作業単位。メール送信、サムネイル生成、Webhook の配信、レコード単位の同期などです。
- 1 つのプロセスを速くするのではなく、プロセスを増やしてスループットを伸ばしたいとき。仕事が I/O 中心で、キューがすでに埋まっている場合がこれにあたります。
- 到着が波打つとき。キューが波を受け止め、コンシューマーは自分がさばける速さで減らしていけます。

## 注意点

- 配信は exactly-once ではなく at-least-once です。メッセージ id で重複を落とすか、2 回動いても作業が 2 回起きないハンドラーを書きます。
- ack（確認応答）は作業とその副作用が永続化されたあとに送ります。先に送ると、落ちたときにメッセージは再配信されずそのまま消えます。
- 再試行の回数を決め、失敗し続けるメッセージはデッドレターキューに送ります。再処理の手順も一緒に残します。そうしないと、そのメッセージは巡ってくるたびにコンシューマーを 1 つずつ道連れにします。
- コンシューマーが 2 つ以上になった時点で全体の順序は失われます。1 人の顧客や 1 件の注文の中で順序が重要なら、そのキーで分割します。Kafka のパーティション、Azure Service Bus のセッション、RabbitMQ の consistent-hash exchange がその手段です。
- prefetch を調整します。prefetch を大きくすると、空いているコンシューマーが取れたはずのメッセージが 1 つのコンシューマーのバッファーに溜まり、そのコンシューマーが死ぬとバッファーの分がすべて再配信されます。
- ボトルネックが別の場所に移れば、コンシューマーを増やしても効かなくなります。小さな接続プール 1 つに 5 つのコンシューマーをぶら下げるのは、手前に待ち行列が 1 つ増えただけのコンシューマー 1 つと変わりません。

## .NET では

MassTransit では受信エンドポイントがそのまま競合するコンシューマーになります。サービスのインスタンスはすべて同じキューにバインドし、ブローカーは各メッセージをそのうち 1 つだけに渡します。

```csharp
builder.Services.AddMassTransit(x =>
{
    x.AddConsumer<OrderPlacedConsumer>();
    x.UsingRabbitMq((context, cfg) =>
    {
        cfg.Host("rabbitmq");
        cfg.ReceiveEndpoint("orders", e =>
        {
            e.PrefetchCount = 1;                 // コンシューマー 1 つにつき同時 1 件
            e.ConcurrentMessageLimit = 1;
            e.UseMessageRetry(r => r.Exponential(3, TimeSpan.FromSeconds(1), TimeSpan.FromSeconds(30), TimeSpan.FromSeconds(2)));
            e.ConfigureConsumer<OrderPlacedConsumer>(context);
            // 再試行を使い切ると、MassTransit はメッセージを orders_error (デッドレターキュー) へ移す。
        });
    });
});

public sealed class OrderPlacedConsumer(IProcessedMessages processed, IOrderProjector projector)
    : IConsumer<OrderPlaced>
{
    public async Task Consume(ConsumeContext<OrderPlaced> context)
    {
        var messageId = context.MessageId ?? throw new InvalidOperationException("MessageId is required");

        // 1 つのトランザクションで、一意制約付きのメッセージ id の挿入と
        // projection の書き込みを行う。先に id を記録してから適用するのは
        // メッセージを失う典型で、ApplyAsync が例外を投げるとプロセス内の
        // 再試行が記録済みの id を見つけて飛ばし、例外なしに戻るので、
        // 書かれていない projection を ack してしまう。
        var claimed = await processed.RunOnceAsync(
            messageId,
            ct => projector.ApplyAsync(context.Message, ct),
            context.CancellationToken);

        if (!claimed) return;   // 重複: 一意制約が挿入を弾いた
        // 例外なしに戻れば、それがメッセージの ack になる。
    }
}
```

`PrefetchCount` と `ConcurrentMessageLimit` は、1 つのインスタンスが同時に抱える仕事の量を決めます。どちらも 1 のまま始めるのが正直な出発点です。仕事が待つ場所をキュー 1 か所に保てるからです。再試行ポリシーはコンシューマーのプロセス内で動くので、一時的な失敗にブローカーを往復する必要がありません。ポリシーを使い切ると、MassTransit はメッセージを回し続けるかわりに `orders_error` へ移します。そのあとのスケールアウトはデプロイの話になります。同じサービスのレプリカを増やし、それぞれが同じ `orders` キューにバインドするだけです。1 つのキーの中で順序が重要なら、競合するコンシューマーはそのままにしてルーティングだけを変えます。consistent-hash exchange、Service Bus のセッション、Kafka のパーティションキーのいずれかを使えば、そのキーは 1 つのコンシューマーに集まり、ほかは並列に動き続けます。
