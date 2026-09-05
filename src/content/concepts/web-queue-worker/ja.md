---
title: "Web Queue Worker"
summary: "Web-Queue-Worker はサービスを 2 つに分けます。リクエストを受け取ってミリ秒で答える Web 層と、長い処理をキューから取り出して自分のペースで進めるワーカーです。キューがピークを吸収し、2 つの層はそれぞれ独立して増やせます。"
category: "アプリケーションアーキテクチャ"
scene: web-queue-worker
steps:
  - title: "リクエストの中で"
    text: "Web 層が処理をリクエストの上でそのまま実行します。ユーザーはそれが終わるまで待ち、後ろに並んだリクエストも一緒に待ちます。1 件は大きく遅れて戻り、もう 1 件は始まる前にあきらめます。"
  - title: "受け取り、答え、あとで処理する"
    text: "Web 層はジョブをキューに入れ、数ミリ秒で 202 を返します。ワーカーがそれを取り、自分のペースで実行します。クライアントは知りたいときに結果を尋ねます。いまは pending、少しあとには done です。"
  - title: "負荷の平準化"
    text: "12 件のリクエストが一度に届きます。素早い 202 が 12 個と、すでに 2 件が動いている 10 段のキューができ、ワーカーはこなせる速度で消化していきます。キューの手前は何 1 つ遅くなりませんでした。"
  - title: "Web ではなくワーカーを増やす"
    text: "ワーカーを 2 つ足すと、6 段のキューを一度に 4 件ずつ処理できます。2 回失敗したジョブは、再試行を延々と回す代わりに dead-letter queue に送ります。ハンドラーが何度実行されても安全でなければならない理由がここにあります。"
related:
  - label: Work Queue
    slug: work-queue
  - label: Background Job
    slug: background-job
  - label: Competing Consumers
    slug: competing-consumers
  - label: Queue-Based Load Leveling
    slug: queue-based-load-leveling
  - label: Dead Letter Queue
    slug: dead-letter-queue
  - label: Idempotent Consumer
    slug: idempotent-consumer
  - label: Background Service
    slug: background-service
  - label: Worker Service
    slug: worker-service
  - label: MassTransit
    slug: masstransit
  - label: Azure Service Bus
    slug: azure-service-bus
  - label: RabbitMQ
    slug: rabbitmq
references:
  - title: Queue-Based Load Leveling pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/queue-based-load-leveling
  - title: Worker services in .NET
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/workers
  - title: System.Threading.Channels
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/channels
---

## いつ使うか

- 人が座って待つには長すぎる処理のときです。エクスポート、メディア処理、メール送信、レポート生成、外部サービスとの同期などです。
- ワーカーがリアルタイムでは追いつけないものの、あとから取り戻せるピークのあるトラフィックのときです。
- マイクロサービスにするほど複雑ではなく、デプロイ単位をもう 1 つ（ワーカー）足せば十分なドメインのときです。

## 注意点

- プロセス内のキューはプロセスと一緒に消えます。失ってはいけないものは、Azure Service Bus、RabbitMQ、あるいはすでに書き込んでいるデータベースの outbox テーブルのような、永続性のあるブローカーに置きます。
- 配信は at-least-once なので、ハンドラーは同じジョブを 2 回見ることがあります。ジョブ id をキーにして冪等にし、やり直す前にすでに終わっているかどうかを確認します。
- 再試行の回数に上限を設け、そのあとは dead-letter queue に送ります。上限なく再試行される poison message は 1 件でワーカーを永久に占有し、層全体のスループットまで道連れにします。
- `202 Accepted` は結果ではなく約束です。クライアントが結果を知る手段（ポーリングできる状態エンドポイント、webhook、通知のいずれか）も一緒に用意します。
- ワーカーは CPU ではなく、キューの深さか最も古いメッセージの経過時間で増やします。遅い外部サービスを待っているワーカーは忙しいわけではありませんし、どれだけ遅れているかを教えてくれるのはキューだけです。

## .NET では

```csharp
// ジョブは自分の試行回数を持ち、最初の実行が 1 回目です。
public sealed record ExportJob(Guid Id, Guid ReportId, int Attempt = 1);

// Web 層。ジョブを受け取り、202 を返し、状態を見る URL を渡します。
app.MapPost("/exports", async (ExportRequest request, IJobQueue queue, CancellationToken ct) =>
{
    var jobId = Guid.NewGuid();
    await queue.EnqueueAsync(new ExportJob(jobId, request.ReportId), ct);
    return Results.Accepted($"/exports/{jobId}");
});

app.MapGet("/exports/{jobId:guid}", async (Guid jobId, IJobStatus status, CancellationToken ct) =>
    await status.FindAsync(jobId, ct) is { } job ? Results.Ok(job) : Results.NotFound());

// ワーカー。キューを消化する、別のデプロイ単位です。
public sealed class ExportWorker(IJobQueue queue, IJobStatus status, ILogger<ExportWorker> log)
    : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        await foreach (var job in queue.ReadAllAsync(ct))
        {
            if (await status.IsDoneAsync(job.Id, ct)) continue;   // すでに完了
            try
            {
                await RunExportAsync(job, ct);
                await status.MarkDoneAsync(job.Id, ct);
            }
            catch (Exception ex) when (job.Attempt < 2)   // 2 回目の失敗で dead-letter へ
            {
                log.LogWarning(ex, "Export {JobId} failed, attempt {Attempt}", job.Id, job.Attempt);
                await queue.RequeueAsync(job with { Attempt = job.Attempt + 1 }, ct);
            }
            catch (Exception ex)
            {
                await queue.DeadLetterAsync(job, ex, ct);
            }
        }
    }
}
```

`IJobQueue` は Azure Service Bus で実装するか、MassTransit を通して RabbitMQ で実装し、`System.Threading.Channels` の実装は開発環境だけに残します。チャネルは 1 プロセス内のキューなので、プロセスを再起動すれば中に残っていたものはすべて消えます。
