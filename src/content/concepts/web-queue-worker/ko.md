---
title: "Web Queue Worker"
summary: "Web-Queue-Worker는 서비스를 둘로 나눕니다. 요청을 받아 밀리초 단위로 답하는 웹 계층과, 긴 작업을 큐에서 꺼내 자기 속도로 처리하는 워커입니다. 큐가 피크를 흡수하고, 두 계층은 각각 따로 늘릴 수 있습니다."
category: "애플리케이션 아키텍처"
scene: web-queue-worker
steps:
  - title: "요청 안에서"
    text: "웹 계층이 요청 위에서 작업을 그대로 돌립니다. 사용자는 그 작업이 끝날 때까지 기다리고, 뒤에 선 요청도 함께 기다립니다. 한 요청은 한참 늦게 돌아오고, 다른 하나는 시작도 못 한 채 포기합니다."
  - title: "받아 두고, 답하고, 나중에 처리합니다"
    text: "웹 계층은 작업을 큐에 넣고 몇 밀리초 만에 202로 답합니다. 워커가 그 작업을 가져가 자기 속도로 처리하고, 클라이언트는 원할 때 결과를 묻습니다. 지금은 pending, 잠시 뒤에는 done입니다."
  - title: "부하 평준화"
    text: "요청 12개가 한꺼번에 들어옵니다. 빠른 202 12개와, 둘은 이미 처리 중인 10칸짜리 큐가 생기고, 워커는 감당할 수 있는 속도로 큐를 비워 갑니다. 큐 앞쪽에서는 아무것도 느려지지 않았습니다."
  - title: "웹이 아니라 워커를 늘립니다"
    text: "워커를 둘 더하면 6칸짜리 큐를 한 번에 4개씩 처리하게 됩니다. 두 번 실패한 작업은 재시도를 영원히 도는 대신 데드 레터 큐로 보냅니다. 핸들러가 여러 번 실행돼도 안전해야 하는 이유가 여기 있습니다."
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

## 언제 쓰나

- 사람이 앉아서 기다리기에는 긴 작업일 때입니다. 내보내기, 미디어 처리, 메일 발송, 리포트 생성, 외부 서비스와의 동기화 같은 것들입니다.
- 워커가 실시간으로는 따라잡지 못하지만 나중에 밀린 만큼 처리할 수 있는, 피크가 있는 트래픽일 때입니다.
- 마이크로서비스까지 갈 만큼 복잡하지는 않고, 배포 단위 하나(워커)만 더 있으면 충분한 도메인일 때입니다.

## 주의점

- 프로세스 안에 있는 큐는 프로세스와 함께 사라집니다. 잃어버리면 안 되는 것은 내구성 있는 브로커에 둡니다. Azure Service Bus, RabbitMQ, 또는 이미 쓰고 있는 데이터베이스의 outbox 테이블이 그런 자리입니다.
- 전달은 최소 한 번(at-least-once)이라서 핸들러는 때로 같은 작업을 두 번 보게 됩니다. 작업 id를 키로 삼아 반복해도 결과가 같게(idempotent) 만들고, 다시 시작하기 전에 이미 끝난 작업인지 확인합니다.
- 재시도 횟수에 상한을 두고, 그 뒤에는 데드 레터 큐로 넘깁니다. 상한 없이 재시도되는 poison message 하나가 워커를 영원히 붙잡고, 계층 전체의 처리량까지 함께 끌어내립니다.
- `202 Accepted`는 결과가 아니라 약속입니다. 클라이언트가 결과를 알 수 있는 길을 함께 줍니다. 폴링할 수 있는 상태 엔드포인트, 웹훅, 알림 중 하나면 됩니다.
- 워커는 CPU가 아니라 큐 길이나 가장 오래된 메시지의 나이를 보고 늘립니다. 느린 외부 서비스를 기다리는 워커는 바쁜 것이 아니고, 얼마나 밀렸는지 알려 주는 것은 큐뿐입니다.

## .NET에서는

```csharp
// 작업은 자기 시도 횟수를 들고 다니고, 첫 실행이 1회째다.
public sealed record ExportJob(Guid Id, Guid ReportId, int Attempt = 1);

// 웹: 작업을 받아 202로 답하고, 상태 URL을 돌려준다.
app.MapPost("/exports", async (ExportRequest request, IJobQueue queue, CancellationToken ct) =>
{
    var jobId = Guid.NewGuid();
    await queue.EnqueueAsync(new ExportJob(jobId, request.ReportId), ct);
    return Results.Accepted($"/exports/{jobId}");
});

app.MapGet("/exports/{jobId:guid}", async (Guid jobId, IJobStatus status, CancellationToken ct) =>
    await status.FindAsync(jobId, ct) is { } job ? Results.Ok(job) : Results.NotFound());

// 워커: 큐를 비워 내는 별도의 배포물.
public sealed class ExportWorker(IJobQueue queue, IJobStatus status, ILogger<ExportWorker> log)
    : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        await foreach (var job in queue.ReadAllAsync(ct))
        {
            if (await status.IsDoneAsync(job.Id, ct)) continue;   // 이미 끝났다
            try
            {
                await RunExportAsync(job, ct);
                await status.MarkDoneAsync(job.Id, ct);
            }
            catch (Exception ex) when (job.Attempt < 2)   // 두 번째 실패에서 dead-letter로 보낸다
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

`IJobQueue`는 Azure Service Bus로 구현하거나 MassTransit을 통해 RabbitMQ로 구현하고, `System.Threading.Channels` 구현은 개발 환경에만 남겨 둡니다. 채널은 한 프로세스 안의 큐라서, 프로세스를 재시작하면 그 안에 남아 있던 것은 전부 사라집니다.
