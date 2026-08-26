---
title: "Web-Queue-Worker"
summary: "Web-Queue-Worker splits a service in two: a web tier that accepts a request and answers it in milliseconds, and workers that take the long jobs off a queue at their own pace. The queue absorbs the peaks, and the two tiers scale on their own."
category: "Application architecture"
tags: ["queue"]
scene: web-queue-worker
steps:
  - title: "Inside the request"
    text: "The web tier runs the job on the request itself, so the user waits for the whole of it and everyone behind them waits too. One request comes back long after it should have, and one gives up before it is ever started."
  - title: "Accept, answer, work later"
    text: "The web tier puts the job on a queue and answers 202 in milliseconds. A worker takes it and runs it at its own pace, and the client asks for the outcome when it wants it: pending now, done a moment later."
  - title: "Load levelling"
    text: "Twelve requests arrive at once. That is twelve fast 202s and a queue twelve deep, and the workers drain it at the rate they can manage. Nothing in front of the queue slowed down at all."
  - title: "Scale the workers, not the web"
    text: "Two more workers turn a queue of six into four jobs at a time. A job that fails twice goes to a dead-letter queue instead of going round the retry loop forever, which is why a handler has to be safe to run more than once."
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
  - label: BackgroundService
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

## When to use

- Work that takes longer than a person should sit and wait for: exports, media processing, email, report generation, a sync with a third party.
- Traffic with peaks the workers cannot match in real time but can catch up on afterwards.
- A domain simple enough that microservices would be too much, and where one more deployable, the worker, is exactly enough.

## Cautions

- An in-process queue disappears with the process. Anything that must not be lost belongs in a durable broker: Azure Service Bus, RabbitMQ, or an outbox table in the database the work is already writing to.
- Delivery is at least once, so a handler will sometimes see the same job twice. Make it idempotent, keyed on the job id, and check whether the work is already done before starting it again.
- Bound the retries and give up into a dead-letter queue. A poison message retried without a limit holds a worker forever and takes the throughput of the whole tier with it.
- `202 Accepted` is a promise, not a result. Give the client a way to learn the outcome: a status endpoint it can poll, a webhook, or a notification.
- Scale the workers on queue depth or on the age of the oldest message, not on CPU. A worker waiting on a slow third party is not busy, and the queue is the only thing that says how far behind it is.

## In .NET

```csharp
// Web: accept the job, answer 202, and hand back a status URL.
app.MapPost("/exports", async (ExportRequest request, IJobQueue queue) =>
{
    var jobId = Guid.NewGuid();
    await queue.EnqueueAsync(new ExportJob(jobId, request.ReportId));
    return Results.Accepted($"/exports/{jobId}");
});

app.MapGet("/exports/{jobId:guid}", async (Guid jobId, IJobStatus status) =>
    await status.FindAsync(jobId) is { } job ? Results.Ok(job) : Results.NotFound());

// Worker: a separate deployable that drains the queue.
public sealed class ExportWorker(IJobQueue queue, IJobStatus status, ILogger<ExportWorker> log)
    : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        await foreach (var job in queue.ReadAllAsync(ct))
        {
            if (await status.IsDoneAsync(job.Id, ct)) continue;   // already done
            try
            {
                await RunExportAsync(job, ct);
                await status.MarkDoneAsync(job.Id, ct);
            }
            catch (Exception ex) when (job.Attempt < 3)
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

Implement `IJobQueue` on Azure Service Bus, or on RabbitMQ through MassTransit, and keep the `System.Threading.Channels` implementation for development only. A channel is a queue inside one process: restart the process and everything still in it is gone.
