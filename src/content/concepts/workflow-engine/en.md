---
title: "Workflow Engine"
summary: "A workflow engine runs a multi-step process and keeps its progress outside the process that runs it: steps are recorded as they complete, so the work survives crashes, retries its failures, and can wait — for a timer or a human — without holding anything in memory."
category: "Scheduled work and workflows"
scene: workflow-engine
steps:
  - title: "The schedule wakes it; the record keeps it"
    text: "At 02:00 the engine starts an instance, runs step one, writes its line, and moves on to step two. What matters is that line in the history — the engine's memory is a record, not a process."
  - title: "It dies mid-step and continues anyway"
    text: "The engine crashes, restarts, and replays its history: finished steps are skipped and the interrupted one is run again from the start. Step one did not run twice, because progress lived in the record — not in the process that died."
  - title: "A failed step is retried, not a failed workflow"
    text: "Step three fails; the engine backs off and runs that one step again — attempt two succeeds. Retrying is safe exactly when each step can run twice without harm; that is the contract every step signs."
  - title: "Waiting is a step too"
    text: "The last step waits for an approval — for hours, if it takes hours — holding no thread, no memory, no lock. When the answer arrives, the engine wakes, finishes, and writes the last line. The workflow outlived every process that ran it."
related:
  - label: Durable Workflow
    slug: durable-workflow
  - label: Long-Running Process
    slug: long-running-process
  - label: State Machine
    slug: state-machine
  - label: Scheduled Job
    slug: scheduled-job
  - label: Retryable Step
    slug: retryable-step
  - label: Human Approval
    slug: human-approval
  - label: Background Job
    slug: background-job
  - label: Saga
    slug: saga
  - label: Retry
    slug: retry
  - label: Transactional Outbox
    slug: transactional-outbox
references:
  - title: "Durable Functions overview"
    url: https://learn.microsoft.com/en-us/azure/durable-task/durable-functions/durable-functions-overview
  - title: "Durable Functions orchestrations"
    url: https://learn.microsoft.com/en-us/azure/durable-task/common/durable-task-orchestrations
  - title: "Background tasks with hosted services in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/host/hosted-services
---

## When to use

- When the process outlives the request that started it. Provisioning an environment, fulfilling an order, taking a contract through three approvals, running the nightly settlement: none of these fits inside an HTTP handler, and none of them is finished when the handler returns. A workflow engine is what you reach for when the unit of work is measured in hours or days and has to survive everything that happens in between.
- When the description of the work is "and then, and then, and then". One sequence of steps, each depending on the last, with waits and retries scattered through it, is exactly the shape an engine has. If the process can be written down as a numbered list, and the list has waits in it, an engine will earn its keep before the second incident.
- When some of the steps are waits. A timer that has to survive a deployment, an approval that might come back on Monday, a webhook from a payment provider that arrives whenever it arrives. `Task.Delay` and an in-memory `TaskCompletionSource` both die with the process; a durable timer and a durable external event do not, and the difference is not visible in a demo — only in production.
- When you already have the homegrown version. A `status` column, a `next_attempt_at` column and a cron job that sweeps the table is a workflow engine with no history, no replay, no versioning story and no visibility. It is a reasonable thing to have built and a bad thing to keep extending: the day somebody asks "which step is order 4417 stuck on, and how many times has it been tried", you needed the engine.
- When somebody has to be able to answer what happened. The history an engine writes is an operational asset in its own right. It says which step failed, how often it was retried, how long an approval sat unanswered, and where a batch of stuck instances all stopped. That is a different question from "what is the state now", and only one of the two survives a restart.

## Cautions

- Every step must be safe to run twice, and the engine assumes it in two separate places. A crash between doing the work and recording it will re-run the step on resume, and a retry after a failure will re-run it too. Anything with an outside effect needs a key the far end can deduplicate on, or a check-then-act that is cheap to repeat. A step that charges a card with neither will charge it twice, and no amount of engine configuration will fix that.
- Orchestration code has to be deterministic. Most engines rebuild an instance's position by replaying the orchestrator against the history, which makes `DateTime.UtcNow`, `Guid.NewGuid()`, `Random` and direct I/O inside the orchestrator bugs rather than shortcuts: they answer differently on the replay than they did the first time, and the engine loses its place. The framework hands you deterministic replacements for all of them. Everything else belongs in the steps.
- Versioning a definition while instances are in flight is the hard operational problem, and no engine makes the decision for you: they give you a version marker to branch on, and you still have to choose when the old path can go. An instance that started under version 1 replays against version 1's history; insert a step into the middle of the definition and deploy, and the replay meets a history that no longer matches the code. The usual answers are to version the definition explicitly and let old instances finish on the old one, or to hold the deploy until the in-flight population drains. Pick one before the first release, not during the first incident.
- Timers and external events have to be durable. `Task.Delay(TimeSpan.FromDays(2))` is not a two day wait, it is a two day wait that any deployment cancels, and an in-memory completion source is worse. If the wait matters, it lives in the same store the history does.
- The store is not free. Every step writes rows, and an orchestration with a loop in it writes a lot of them. Decide early what a completed instance costs to keep, how long you keep it, and what the purge looks like — a history table nobody prunes becomes the largest table in the database, and it becomes that quietly.
- Keep business rules out of the orchestrator. Its job is to say what runs next, and it will be replayed many times over an instance's life. Validation, computation and policy belong in the steps, where they run once, fail honestly, and can be tested without a runtime underneath them.

## In .NET

Azure Durable Functions is the shortest path to the whole shape: the orchestrator is ordinary C#, and the runtime is what makes it survive. The `await` points are checkpoints — the function is unloaded between them and replayed from the history when the next result arrives, which is why the code reads like a script and behaves like a state machine.

```csharp
[Function(nameof(Onboard))]
public static async Task<string> Onboard(
    [OrchestrationTrigger] TaskOrchestrationContext context)
{
    var input = context.GetInput<Signup>()!;

    // Each call is a step. Its result is written to the history, so a replay
    // after a crash returns the recorded value instead of calling again.
    var account = await context.CallActivityAsync<Account>(nameof(CreateAccount), input);
    await context.CallActivityAsync(nameof(SeedWorkspace), account);

    // A retry policy belongs to one step, not to the workflow. Only this call
    // is repeated, and only until it succeeds or the policy gives up.
    await context.CallActivityAsync(
        nameof(ProvisionLicence),
        account,
        TaskOptions.FromRetryPolicy(new RetryPolicy(
            maxNumberOfAttempts: 4,
            firstRetryInterval: TimeSpan.FromSeconds(5),
            backoffCoefficient: 2)));

    // The wait. Neither of these holds a thread: the instance is unloaded and
    // the runtime brings it back when the event or the timer arrives.
    using var cts = new CancellationTokenSource();
    var approval = context.WaitForExternalEvent<bool>("Approved");
    var deadline = context.CreateTimer(context.CurrentUtcDateTime.AddDays(3), cts.Token);

    if (approval != await Task.WhenAny(approval, deadline))
    {
        await context.CallActivityAsync(nameof(Escalate), account);
        return "escalated";
    }

    cts.Cancel();
    await context.CallActivityAsync(nameof(Activate), account);
    return "active";
}
```

Two rules make that work, and both are about the replay. `context.CurrentUtcDateTime` rather than `DateTime.UtcNow`, and `context.NewGuid()` rather than `Guid.NewGuid()`, because a replay has to reach the same values it reached the first time. And the activities are where everything else lives: they are called once per recorded result, they may do I/O, and they are the only place a side effect is allowed.

```csharp
[Function(nameof(ProvisionLicence))]
public static async Task ProvisionLicence([ActivityTrigger] Account account)
{
    // The step is written so that running it twice is the same as running it
    // once: the key is derived from the account, so the second call is a
    // conflict the provider absorbs rather than a second licence.
    await licences.CreateAsync(new LicenceRequest
    {
        AccountId = account.Id,
        IdempotencyKey = $"licence:{account.Id}",
    });
}
```

Starting an instance is a client call, and the instance id is worth choosing rather than generating. Give it a name derived from the thing it is about and the engine will refuse to start a second one while the first is still running, which is the cheapest deduplication you will ever get — though once an instance has finished the id is free again, so at most once per order needs a status check in front of the call.

```csharp
await client.ScheduleNewOrchestrationInstanceAsync(
    nameof(Onboard), signup, new StartOrchestrationOptions($"onboard-{signup.Id}"));
```

When a framework is more than the problem deserves, the same shape fits in a `BackgroundService` and two tables. One row per instance holding the definition it runs and the step it has reached, one row per completed step, and a unique key that makes the record the arbiter rather than the code.

```csharp
public class WorkflowInstance
{
    public Guid Id { get; set; }
    public string Definition { get; set; } = "";
    public int Position { get; set; }              // the last recorded step
    public DateTimeOffset? WakeAt { get; set; }    // when a wait is due
    public string Status { get; set; } = "running";
}

public class StepRecord
{
    public Guid InstanceId { get; set; }
    public int Step { get; set; }
    public int Attempts { get; set; }
    public DateTimeOffset At { get; set; }
}

protected override void OnModelCreating(ModelBuilder model)
{
    // One row per finished step, and no way to write it twice. Position is a
    // cache of this table, not a second source of truth.
    model.Entity<StepRecord>().HasKey(s => new { s.InstanceId, s.Step });
}
```

The worker is a loop with no memory between iterations, which is the point: everything it needs to decide what to do next is a query.

```csharp
protected override async Task ExecuteAsync(CancellationToken stopping)
{
    while (!stopping.IsCancellationRequested)
    {
        var due = await db.Instances
            .Where(i => i.Status == "running")
            .Where(i => i.WakeAt == null || i.WakeAt <= DateTimeOffset.UtcNow)
            .OrderBy(i => i.Id)
            .Take(20)
            .ToListAsync(stopping);

        foreach (var instance in due) await AdvanceAsync(instance, stopping);
        await Task.Delay(TimeSpan.FromSeconds(5), stopping);
    }
}

async Task AdvanceAsync(WorkflowInstance instance, CancellationToken token)
{
    var steps = definitions[instance.Definition];
    // Where to carry on from is a fact about the record, not about the code
    // that happens to be running. A process that died here loses nothing.
    var next = await db.Steps.CountAsync(s => s.InstanceId == instance.Id, token);
    if (next >= steps.Count) { instance.Status = "done"; await db.SaveChangesAsync(token); return; }

    try
    {
        // A step returns null when it is done, or the deadline it is parked
        // until. Parking records nothing: it is still the current step.
        var parkedUntil = await steps[next].RunAsync(instance, token);
        if (parkedUntil is { } until)
        {
            instance.WakeAt = until;
        }
        else
        {
            db.Steps.Add(new StepRecord { InstanceId = instance.Id, Step = next, At = DateTimeOffset.UtcNow });
            instance.Position = next + 1;
            instance.WakeAt = null;
        }
    }
    catch (Exception ex) when (ex is not OperationCanceledException)
    {
        // The step failed, not the workflow. Back off and try this one again.
        var attempts = await Bump(instance.Id, next, token);
        instance.WakeAt = DateTimeOffset.UtcNow + TimeSpan.FromSeconds(Math.Pow(2, attempts));
        if (attempts >= 5) instance.Status = "failed";
    }

    await db.SaveChangesAsync(token);
}
```

`WakeAt` is doing two jobs, and both of them are the reason this survives a restart: it is the backoff for a failed step, and it is the durable timer for a step that is a wait. A step that waits for a person returns the escalation deadline instead of finishing, so nothing is recorded and `WakeAt` becomes that timer; the webhook that carries the answer writes the step record and clears `WakeAt`, and the next sweep picks the instance up exactly where the record says it is. Run one replica of this sweep, or take a lease on the instance as you claim it: the composite key stops a step being *recorded* twice, not two workers *running* it at once.

If all you need is the first half — something at 02:00, reliably, with a history of runs and a retry policy — Hangfire and Quartz.NET both do that without asking you to model the workflow at all. `IHostedService` with a `PeriodicTimer` is enough for a single instance; the moment there are two, you need either a scheduler that takes a lock or a leader election in front of the timer, or the job runs twice a night and nobody notices until it matters.
