---
title: "Background Service"
summary: "バックグラウンドサービスはホストの中で回るループです。アプリが起動すると一緒に始まり、自分のペースでキューを空け、終了が来たら手にした作業を終えてから出ていきます。だからどのリクエストも遅い仕事を待たず、受け取った仕事も失われません。"
category: "スケジュールされた作業とワークフロー"
scene: background-service
steps:
  - title: "どんなリクエストも遅い仕事を待ってはいけません"
    text: "ゴーストはリクエストの中で作られるレポートを見せます。応答時間が膨らみ、クライアントはタイムアウトし、同じ重い仕事をもう一度頼むことになるでしょう。解決は手渡しです。仕事をキューに入れて今答え、時間を持っている何かにその仕事をさせるのです。"
  - title: "ホステッドサービスは、わざとホストと一緒に生き、一緒に死にます"
    text: "アプリが立ち上がると始まり、ループでキューを空けます。終了が来ると、殺されるのではなく告げられます。手にした仕事を終え、新しい仕事を取るのをやめ、きれいに出ていきます。優雅な終了は礼儀ではありません。「止まった」と「仕事を失った」の違いです。"
  - title: "仕事が育ったら、自分のプロセスを与えます"
    text: "ワーカーサービスはウェブアプリの外へ移した同じループです。自分の予定でデプロイされ、単独でスケールします。アプリが再起動してもワーカーは回り続け、ワーカーが再起動してもキューが仕事を抱えています。分離された寿命こそが機能です。"
  - title: "運用の 2 つの罪は、2 回回ることと 1 つを失うことです"
    text: "ワーカーを増やすと 2 つのインスタンスが同じ仕事をつかみます。リースが片方だけだと言ってくれなければ。ワーカーが途中で落ちても、キューはその仕事を抱えていなければなりません。状態をキューに置きワーカーをステートレスにすれば、どちらも設定の問題です。"
related:
  - label: IHostedService
    slug: ihostedservice
  - label: Worker Service
    slug: worker-service
  - label: Background Job
    slug: background-job
  - label: Scheduled Job
    slug: scheduled-job
  - label: Work Queue
    slug: work-queue
  - label: Competing Consumers
    slug: competing-consumers
  - label: Graceful Shutdown
    slug: graceful-shutdown
  - label: Cancellation Token
    slug: cancellation-token
  - label: Retry
    slug: retry
  - label: Poison Message
    slug: poison-message
  - label: At-Least-Once
    slug: at-least-once
  - label: State Machine
    slug: state-machine
references:
  - title: Background tasks with hosted services in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/host/hosted-services
  - title: Worker services in .NET
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/workers
  - title: Create a Queue Service
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/queue-service
---

## いつ使うか

- リクエストが遅い何かを待つことになるときに使います。歓迎メールの送信、エクスポートの生成、アップロード画像の縮小、夜間の同期。どれも呼び出し側が頼んだものではないのに、その場で処理すると全部が呼び出し側の時計に乗ります。キューの後ろへ移せばエンドポイントの仕事は「仕事を受け取って受け取ったと言う」だけになり、それならミリ秒で終わります。
- キューやストリームを消費する何かが要るときに使います。バックグラウンドサービスはコンシューマーの自然な形です。ホストと一緒に始まり、止まれと言われるまでループし、届いたものを処理します。Service Bus、RabbitMQ、Kafka、outbox テーブル、プロセス内の `Channel<T>` まで、出どころが変わってもループは変わりません。
- リクエストではなくリズムで仕事が起きてほしいときに使います。期限切れの行の掃除、パートナー API のポーリング、キャッシュの再計算などです。ループの中に `PeriodicTimer` を置けばリズムがサービスの一部になり、別に運用しなければならない外部スケジューラーが要りません。逃した実行窓、遅れの取り戻し、重なりまで耐えなければならなくなった時点でそれはスケジュールされた作業であり、スケジュールを所有するものに任せるべきです。
- ウェブ層とは別にスケールさせたいときに使います。トラフィックとキューの深さは別の数字で、2 つ目の数字でスケールするワーカーは、仕事を生み出すアプリに触らずに適切な大きさへ寄せられます。
- ただ遅く感じるだけのリクエスト処理には**使いません**。30 ミリ秒で済むはずのクエリが 900 ミリ秒かかるなら、それはクエリの問題です。キューの後ろに隠すと、直せたはずのレイテンシのバグが、状態取得エンドポイントと再試行ポリシーと「結果はどこへ行ったのか」という問い合わせを連れた非同期フローに変わります。まずその経路を直してから判断してください。
- 呼び出し側が結果を受け取らないと次へ進めない仕事にも**使いません**。次の画面を描くのにその答えが必要なら、その仕事はリクエストの一部です。動かせるのは、その答えが依存していない残りの部分です。

## 注意点

- 停止トークンをあらゆる場所で尊重しないと、終了が強制終了になります。トークンは `ExecuteAsync` に渡され、その中のすべての await に届かなければなりません。受信呼び出し、HTTP 呼び出し、データベース呼び出し、遅延まで全部です。トークンを無視するループは、ホストが終了のタイムアウトを数えている間も働き続け、そのあと作業の途中でプロセスがもぎ取られます。優雅な終了という契約は、結局あの引数 1 つを本気で受け取ることです。
- `ExecuteAsync` で捕まえられなかった例外はループを止め、どれだけ大きな音を立てるかはホストが決めます。.NET 6 以降の既定は `BackgroundServiceExceptionBehavior.StopHost` なので、抜け出た例外はアプリケーションを落とします。`Ignore` に戻すと以前の挙動になりますが、そちらのほうが厄介です。登録されているのにもう回っていないサービスができあがり、ヘルスチェックは全部緑のままです。ループの中で捕まえ、どの作業か分かるだけの文脈を添えて記録し、例外ごとに続けるか、キューへ戻すか、止めるかを決めます。
- スコープ付きの依存関係は、反復ごとに新しいスコープが要ります。ホステッドサービスはシングルトンなので、コンストラクターに `DbContext` を注入すると起動時に失敗するか、プロセスの寿命いっぱい 1 つのコンテキストを使い続けて追跡エンティティが積み上がり、どこかで倒れます。`IServiceScopeFactory` を注入し、ループの中でスコープを作り、そこで解決し、作業が終わったら破棄します。
- メモリーの中のキューはプロセスと一緒に消えます。`Channel<T>` は 1 つのアプリケーション内の手渡しとしては優秀ですが、永続性の話としては貧弱です。ポッドが追い出されたときに中にあったものは消え、誰もそれを知らされません。1 件失うことが事故なら、キューはプロセスの外になければなりません。ブローカーか、ポーリングするテーブルです。
- スケールアウトには単一実行の保護が要ります。同じワーカーのレプリカ 2 つは、何かが止めない限り同じ項目を一緒に取ります。メッセージごとにロックやリースを与えるブローカー、作業を囲む分散ロック、あるいは 2 つが同じ仕事を見ないようにするパーティション割り当てが、その何かです。本物のキューの上の競合コンシューマーはこれを無料でくれますが、共有テーブルの上のタイマーはくれません。
- `StartAsync` の中で仕事をしません。ホストがそれを待つので、起動が長いとアプリケーション全体が立ち上がれず、コンテナーでは忙しいサービスではなく失敗した準備状態プローブに見えます。ループを始めて戻ります。`BackgroundService` は最初の await で `ExecuteAsync` を返すことで、すでにそうしています。
- どの作業も少なくとも一度は走り、ときどき二度走ると考えておきます。「仕事は終わった」と「メッセージは確認された」の間で死ぬとメッセージが再生されますが、これは正しい挙動であって、キューで直すバグではありません。同じ作業を繰り返しても結果が一度と同じになるようにするか、処理済みのものを記録して飛ばします。

## .NET では

`BackgroundService` が基底クラスで、書くメソッドはちょうど 1 つです。トークンが契約です。ホストが終了を始めるときに取り消され、ループの中のすべての await がそれを受け取ることになっています。

```csharp
public sealed class ReportWorker(
    IReportQueue queue,
    IServiceScopeFactory scopes,
    ILogger<ReportWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            var job = await queue.DequeueAsync(stoppingToken);

            // 作業ごとにスコープ 1 つ。DbContext はその仕事と共に生き、共に死ぬ。
            await using var scope = scopes.CreateAsyncScope();
            var reports = scope.ServiceProvider.GetRequiredService<ReportService>();

            try
            {
                await reports.BuildAsync(job, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                throw;      // 失敗ではなく終了
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Report {JobId} failed", job.Id);
            }
        }
    }
}
```

登録は 1 行で、この 1 行がサービスの寿命をホストの寿命に結びます。

```csharp
builder.Services.AddHostedService<ReportWorker>();
```

1 つのアプリケーションの中の手渡しは `Channel<T>` です。背圧が組み込まれたキューで、境界のあるチャネルは滞留が際限なく伸びるのを許す代わりにプロデューサーを待たせます。消費する側が遅い状況では、たいていそれが望みの挙動です。

```csharp
public sealed class ReportQueue : IReportQueue
{
    private readonly Channel<ReportJob> _channel =
        Channel.CreateBounded<ReportJob>(new BoundedChannelOptions(200)
        {
            FullMode = BoundedChannelFullMode.Wait,
        });

    public ValueTask EnqueueAsync(ReportJob job, CancellationToken ct) =>
        _channel.Writer.WriteAsync(job, ct);

    public ValueTask<ReportJob> DequeueAsync(CancellationToken ct) =>
        _channel.Reader.ReadAsync(ct);
}
```

するとエンドポイントは、仕事を受け取って答えがどこに現れるかを言うだけになります。シーンの 1 番目のステップをそのまま書いたものです。応答がもうレポートを含まないので、応答がレポートぶんの代金を払うこともありません。

```csharp
app.MapPost("/reports", async (ReportRequest request, IReportQueue queue, CancellationToken ct) =>
{
    var job = ReportJob.From(request);
    await queue.EnqueueAsync(job, ct);
    return Results.Accepted($"/reports/{job.Id}");   // レポートではなく 202
});
```

キューから来る仕事ではなくリズムで回る仕事なら、`PeriodicTimer` が同じループの中に入ります。自分自身とティックが重ならず、停止トークンを受け取ります。昔の `Timer` コールバックがここで扱いにくかった理由が、まさにこの 2 つの性質でした。

```csharp
using var timer = new PeriodicTimer(TimeSpan.FromMinutes(5));

while (await timer.WaitForNextTickAsync(stoppingToken))
{
    await CleanUpExpiredAsync(stoppingToken);
}
```

ループが自分のプロセスを持つに値するようになったら、ワーカーサービスのテンプレートが答えです。同じクラスに別のホストをかぶせたもので、サービスが終了について言うことがあるときは `IHostApplicationLifetime` で合わせます。

```csharp
var builder = Host.CreateApplicationBuilder(args);
builder.Services.AddHostedService<ReportWorker>();

// ホストが ExecuteAsync の戻りをどれだけ待つか。
builder.Services.Configure<HostOptions>(options =>
{
    options.ShutdownTimeout = TimeSpan.FromSeconds(30);
    options.BackgroundServiceExceptionBehavior = BackgroundServiceExceptionBehavior.StopHost;
});

await builder.Build().RunAsync();
```

最後の断片が、4 番目のステップの言っていることです。そのワーカーのレプリカ 2 つが同じキューを読むので、キューは項目ごとに片方だけへ渡し、終わったと言われるまで抱えていなければなりません。本物のブローカーではメッセージロックであり、テーブルの上では自分で取って更新するリースです。

```csharp
await foreach (var message in receiver.ReceiveMessagesAsync(stoppingToken))
{
    try
    {
        await Handle(message, stoppingToken);
        await receiver.CompleteMessageAsync(message, stoppingToken);   // ここで初めて消える
    }
    catch (Exception)
    {
        await receiver.AbandonMessageAsync(message, cancellationToken: stoppingToken);
    }
}
```

そのためにワーカー自身が特別である必要はなく、特別であってもいけません。状態はキューが持ち、誰が手を出してよいかはリースが決め、ワーカーは何台立っているか誰も知らなくても、殺してまた立ち上げられるプロセスです。
