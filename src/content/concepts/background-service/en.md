---
title: "Background Service"
summary: "A background service is a loop that lives inside the host: it starts when the app starts, drains a queue at its own pace, and when shutdown comes it finishes the job in hand before it exits — so no request waits for slow work and no accepted work is lost."
category: "Scheduled work and workflows"
tags: ["queue"]
scene: background-service
steps:
  - title: "No request should wait for slow work"
    text: "The ghost shows a report built inside the request: the reply time balloons and the client times out — and would retry the same heavy job again. The fix is a handoff — enqueue the work, answer now, and let something that owns time do the doing."
  - title: "A hosted service lives and dies with the host — on purpose"
    text: "It starts when the app starts and drains the queue in its loop. When shutdown comes, it is told, not killed: it finishes the job in hand, stops taking new ones, and exits clean. Graceful shutdown is not politeness; it is the difference between \"stopped\" and \"lost work\"."
  - title: "When the work grows, give it its own process"
    text: "A worker service is the same loop moved out of the web app: it deploys on its own schedule and scales alone. The app restarts and the worker keeps running; the worker restarts and the queue holds the work. Decoupled lifetimes are the feature."
  - title: "The two production sins: running twice, and losing one"
    text: "Scale the worker out and both instances grab the same job — unless a lease says only one may. If a worker crashes mid-job, the queue must still hold it. Keep the state in the queue and the worker stateless, and both become configuration."
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

## When to use

- When a request would otherwise wait for something slow. Sending the welcome email, rendering the export, resizing the upload, pushing the nightly sync: none of these are what the caller asked for, and all of them are on the caller's clock if you do them inline. Move them behind a queue and the endpoint's job shrinks to "accept the work and say so", which is a job it can do in milliseconds.
- When something has to consume a queue or a stream. A background service is the natural shape for a consumer: it starts with the host, loops until it is told to stop, and processes whatever arrives. Service Bus, RabbitMQ, Kafka, an outbox table, an in-process `Channel<T>` — the source changes, the loop does not.
- When work has to happen on a rhythm rather than on a request. Cleaning up expired rows, polling a partner API, recomputing a cache: put a `PeriodicTimer` inside the loop and the rhythm becomes part of the service rather than an external scheduler you also have to operate. Once the rhythm has to survive missed windows, catch-up and overlap, that is a scheduled job and belongs in something that owns schedules.
- When the work should scale independently of the web tier. Traffic and queue depth are different numbers, and a worker that scales on the second one can be right-sized without touching the app that produces the work.
- **Not** for request-scoped work that merely feels slow. A 900 ms query that should be a 30 ms query is a query problem, and hiding it behind a queue turns a fixable latency bug into an asynchronous flow with a status endpoint, a retry policy and a support question about where the result went. Fix the path first, then decide.
- **Not** as a place to put work whose result the caller needs before it can continue. If the answer is required to render the next screen, the work is part of the request; what you can move is everything the answer does not depend on.

## Cautions

- Honour the stopping token everywhere, or shutdown becomes kill. The token is passed into `ExecuteAsync` and has to reach every await inside it — the receive call, the HTTP call, the database call, the delay. A loop that ignores it keeps working while the host counts down its shutdown timeout, and then the process is torn down mid-job. The whole graceful contract is that one parameter being taken seriously.
- An unhandled exception in `ExecuteAsync` stops the loop, and how loudly depends on the host. Since .NET 6 the default is `BackgroundServiceExceptionBehavior.StopHost`, so an escaping exception takes the application down; set it back to `Ignore` and you get the older behaviour, which is worse — a registered service that silently no longer runs while every health check stays green. Catch inside the loop, log with enough context to identify the job, and decide per exception whether to continue, requeue or stop.
- Scoped dependencies need a scope per iteration. A hosted service is a singleton, so injecting a `DbContext` into its constructor either fails at startup or gives you one context for the lifetime of the process, accumulating tracked entities until something falls over. Inject `IServiceScopeFactory`, create a scope inside the loop, resolve there, and dispose it when the job is done.
- An in-memory queue dies with the process. `Channel<T>` is an excellent handoff inside one application and a poor durability story: whatever is in it when the pod is evicted is gone, and nobody is told. If losing an item is an incident, the queue has to be outside the process — a broker, or a table you poll.
- Scale-out needs single-flight protection. Two replicas of the same worker will both take the same item unless something stops them: a broker with a lock or lease per message, a distributed lock around the job, or partition assignment so the two never look at the same work. Competing consumers on a real queue give you this for free; a timer over a shared table does not.
- Do not do the work in `StartAsync`. The host awaits it, so a long startup blocks the whole application from coming up, and in a container it looks like a failed readiness probe rather than a busy service. Start the loop and return; `BackgroundService` already does this for you by handing `ExecuteAsync` back at the first await.
- Expect every job to run at least once, and sometimes twice. A crash between "work done" and "message acknowledged" replays the message, which is correct behaviour and not a bug to be fixed in the queue. Make the effect of a repeated job safe, or record what has already been processed and skip it.

## In .NET

`BackgroundService` is the base class, and there is exactly one method to write. The token is the contract: it is cancelled when the host starts shutting down, and every await in the loop is expected to receive it.

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

            // One scope per job: the DbContext lives and dies with the work.
            await using var scope = scopes.CreateAsyncScope();
            var reports = scope.ServiceProvider.GetRequiredService<ReportService>();

            try
            {
                await reports.BuildAsync(job, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                throw;      // shutdown, not a failure
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Report {JobId} failed", job.Id);
            }
        }
    }
}
```

Registration is one line, and it is what ties the service's lifetime to the host's.

```csharp
builder.Services.AddHostedService<ReportWorker>();
```

The handoff inside a single application is a `Channel<T>`. It is a queue with backpressure built in: a bounded channel makes the producer wait rather than letting the backlog grow without limit, which is usually what you want when the consumer is the slow side.

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

The endpoint then does nothing but accept the work and say where the answer will appear. This is the first step of the scene written out: the reply no longer contains the report, so the reply no longer costs what the report costs.

```csharp
app.MapPost("/reports", async (ReportRequest request, IReportQueue queue, CancellationToken ct) =>
{
    var job = ReportJob.From(request);
    await queue.EnqueueAsync(job, ct);
    return Results.Accepted($"/reports/{job.Id}");   // 202, not the report
});
```

For work on a rhythm rather than work from a queue, `PeriodicTimer` belongs inside the same loop. It does not overlap ticks with itself and it takes the stopping token, which is the pair of properties that made the old `Timer` callback awkward here.

```csharp
using var timer = new PeriodicTimer(TimeSpan.FromMinutes(5));

while (await timer.WaitForNextTickAsync(stoppingToken))
{
    await CleanUpExpiredAsync(stoppingToken);
}
```

When the loop deserves its own process, the Worker Service template is the same class with a different host around it, and shutdown is coordinated through `IHostApplicationLifetime` when the service needs to say something about it.

```csharp
var builder = Host.CreateApplicationBuilder(args);
builder.Services.AddHostedService<ReportWorker>();

// How long the host waits for ExecuteAsync to return before it stops waiting.
builder.Services.Configure<HostOptions>(options =>
{
    options.ShutdownTimeout = TimeSpan.FromSeconds(30);
    options.BackgroundServiceExceptionBehavior = BackgroundServiceExceptionBehavior.StopHost;
});

await builder.Build().RunAsync();
```

The last piece is the one the fourth step is about. Two replicas of that worker both read the same queue, so the queue has to hand each item to one of them and hold it until they say it is finished. On a real broker that is the message lock; over a table it is a lease you take and renew.

```csharp
await foreach (var message in receiver.ReceiveMessagesAsync(stoppingToken))
{
    try
    {
        await Handle(message, stoppingToken);
        await receiver.CompleteMessageAsync(message, stoppingToken);   // only now is it gone
    }
    catch (Exception)
    {
        await receiver.AbandonMessageAsync(message, cancellationToken: stoppingToken);
    }
}
```

Nothing about the worker itself has to be unique for that to work, and nothing about it should be. The queue holds the state, the lease decides who may act on it, and the worker is a process that can be killed and started again without anybody having to know how many of them there are.
