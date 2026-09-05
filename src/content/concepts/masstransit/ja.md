---
title: "MassTransit"
summary: "MassTransit はメッセージブローカーの上に載せるアプリケーションフレームワークです。コンシューマーも再試行のポリシーも遅延再配信も saga も .NET のコードとして一度書けば、その下の転送はアプリケーションの形ではなく設定の 1 行になります。"
category: "メッセージングとイベント処理"
related:
  - label: Web Queue Worker
    slug: web-queue-worker
  - label: Work Queue
    slug: work-queue
  - label: Competing Consumers
    slug: competing-consumers
  - label: Dead Letter Queue
    slug: dead-letter-queue
  - label: Saga
    slug: saga
  - label: Orchestration
    slug: orchestration
  - label: Transactional Outbox
    slug: transactional-outbox
  - label: Azure Service Bus
    slug: azure-service-bus
  - label: RabbitMQ
    slug: rabbitmq
references:
  - title: MassTransit concepts
    url: https://masstransit.massient.com/concepts
---

## いつ使うか

- メッセージを処理する仕事が、リクエストを処理する仕事のように見えてほしいときに使います。コンシューマーは `Consume` メソッドを 1 つ持つクラスで、アプリケーションの他のすべてと同じくコンテナーから解決され、受信のループもデシリアライズも ack（確認応答）もフレームワークが握ります。ホステッドサービスの中に埋もれたブローカー SDK の呼び出しと、チームが見つけて依存を注入してテストできる作業の単位との違いがこれです。
- 再試行と遅延再配信とエラーキューを手で組まず宣言で置きたいときに使います。一時的な失敗には即座の再試行、依存先が落ちているときは数分後の予約された再配信、試行が尽きたらエラーキューへ移します。この 3 つがエンドポイントの設定の 3 行で、コンシューマーごとに作り直すのではなくすべてのコンシューマーに同じように適用されます。
- 1 つのやり取りが複数のメッセージにまたがり、どこまで進んだかを覚えておく必要があるときに持ち出します。saga のステートマシンはそのやり取りに明示的な型を与えます。状態とイベント、その間の遷移、そして相関 id で引ける保存されたインスタンスです。`IHostedService` のクラスを集めたフォルダーが自然には育てられない部分でもあります。
- 転送の選択が設計の決定ではなくデプロイの決定であってほしいときに選びます。同じコンシューマーのコードが、テストではインメモリの転送、開発者のマシンでは RabbitMQ、本番では Azure Service Bus を相手に動きます。変わるのは起動時の `UsingRabbitMq` か `UsingAzureServiceBus` の呼び出しであって、その周りのクラスではないからです。

## 注意点

- ブローカーのトポロジーを決めるのはフレームワークで、その規約を知らないとブローカーのコンソールが読めません。MassTransit はメッセージの型でルーティングします。`OrderPlaced` を発行すればその型の名前を取った exchange かトピックができ、それを消費する側ごとにその名前へ束ねられたキューができます。ポータルに並ぶエンティティは自分たちが打ち込んだどの名前とも一致しないので、障害の日に初めて覗くことにならないよう、命名の規則を先に身に付けてください。
- 抽象化が隠すのはブローカー同士の違いであって、その違いを自分たちの手元から消してくれるわけではありません。Service Bus のセッション、パーティションキー、RabbitMQ の exchange の種類、転送ごとの割り当ては残っていますし、そこへ触れるには転送固有の設定が要り、コードは静かに 1 つのブローカーへ縛られます。移植性は普通の経路では本当のことで、その外では試してみる価値のある主張です。
- コンシューマーは今でも二度呼ばれることがあり、フレームワークがその事実を変えるわけではありません。再試行も遅延再配信もブローカーの at-least-once の配信も、同じハンドラーが同じメッセージをもう一度見る可能性があるという意味です。ですから外に副作用を残すコンシューマーには、いつもの備えが要ります。メッセージ id、すでに処理したものの記録、あるいは発行側の outbox（送信箱）です。
- メジャーバージョンの間の変化が大きく、サンプルはすぐ古くなります。設定の API も outbox もスケジューリングも、リリースをまたいで形が変わりましたし、ライセンスも一緒に変わりました。v8 は Apache 2.0 のオープンソースのままですが、2026 年にリリースされた v9 は商用ライセンスで提供されます。バージョンを固定し、そのバージョンのドキュメントを読み、メジャー 2 つ前のブログの記事は手順書ではなく手掛かりとして扱ってください。

## .NET では

- 登録は呼び出し 1 つで、その中でコンシューマーと転送とエンドポイントが一緒に結び付きます。`AddMassTransit` がコンシューマーを集め、転送の呼び出しがブローカーを選び、再試行と遅延再配信のポリシーはハンドラーの中ではなく受信のエンドポイントに付きます。

```csharp
builder.Services.AddMassTransit(x =>
{
    x.AddConsumer<OrderPlacedConsumer>();

    x.UsingRabbitMq((context, cfg) =>
    {
        cfg.Host("rabbitmq://localhost");

        cfg.ReceiveEndpoint("order-processing", e =>
        {
            // フィルターは登録順に、外側から入れ子になる。だから予約された
            // キューへの戻しを、その内側で回る再試行より先に宣言する。
            // RabbitMQ ではこのフィルターに delayed-exchange プラグインが要り、
            // なければ UseQueueBasedDelayedRedelivery が TTL と
            // dead-letter exchange で同じ仕事をする。
            e.UseDelayedRedelivery(r => r.Intervals(
                TimeSpan.FromMinutes(1), TimeSpan.FromMinutes(10)));
            // 一時的な失敗への素早い試行はその内側で回る。
            e.UseMessageRetry(r => r.Interval(3, TimeSpan.FromSeconds(2)));

            e.ConfigureConsumer<OrderPlacedConsumer>(context);
        });
    });
});

public class OrderPlacedConsumer : IConsumer<OrderPlaced>
{
    public async Task Consume(ConsumeContext<OrderPlaced> context)
    {
        // ここで例外を投げることが、エンドポイントの再試行ポリシーへの合図になる。
        // フレームワークが ack するのは、このメソッドが戻ったときだけ。
        await handler.HandleAsync(context.Message, context.CancellationToken);
    }
}
```

- 発行と送信が別の動詞であることには理由があります。`Publish` はその型を購読するすべてのコンシューマーへメッセージを広げ、`Send` はエンドポイントを 1 つ直接指名します。取り違えると、イベントが一度しか届かなかったり、コマンドが 4 回届いたりします。
- インメモリのテストハーネスは、ブローカーなしでコンシューマーをテストできるようにする仕掛けです。バスをプロセスの中で立ち上げ、テストがメッセージを発行してから、コンシューマーが呼ばれたことと期待したメッセージが出たことを確かめさせてくれます。再試行とルーティングの設定が、docker-compose のファイルではなく普通の単体テストで覆われることになります。
- トランザクションと同じ範囲で書く outbox は、自分たちで作るものではなく標準の機能です。Entity Framework Core の統合と一緒に有効にすると、出ていくメッセージが状態の変更と同じトランザクションで記録され、そのあとで配信されます。データベースのコミットは成功したのに発行は失敗する、その隙間がこうして閉じます。
