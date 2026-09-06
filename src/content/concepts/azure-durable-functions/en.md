---
title: "Azure Durable Functions"
summary: "Azure Durable Functions is the serverless way to write a workflow as ordinary C#: the orchestrator's awaits are checkpoints, the runtime unloads the function between them and replays it from an event-sourced history, so the process survives crashes, scale-in and waits measured in days."
category: "Scheduled work and workflows"
level: 5
related:
  - label: Durable Workflow
    slug: durable-workflow
  - label: Workflow Engine
    slug: workflow-engine
  - label: Human Approval
    slug: human-approval
  - label: State Machine
    slug: state-machine
  - label: Scheduled Job
    slug: scheduled-job
  - label: Retryable Step
    slug: retryable-step
  - label: Temporal
    slug: temporal
  - label: Dapr Workflow
    slug: dapr-workflow
  - label: Event Sourcing
    slug: event-sourcing
references:
  - title: Durable Functions overview
    url: https://learn.microsoft.com/en-us/azure/durable-task/durable-functions/durable-functions-overview
  - title: "Durable orchestrations: code constraints"
    url: https://learn.microsoft.com/en-us/azure/durable-task/common/durable-task-code-constraints
---

## When to use

- Reach for it when several functions have to be coordinated and the coordination itself needs to be reliable. Sequential chaining, fan-out to a hundred parallel activities and fan-in to aggregate their results are the two shapes it exists for, and both are a few lines of `await` rather than a queue per step plus a table to count completions in.
- Use it when the process contains waiting. `context.CreateTimer` survives a deployment, and `WaitForExternalEvent` holds an instance open for an approval that comes back on Monday, both without a thread, a lock or a warm instance. The human approval page is the shape; this is one runtime that implements it without asking you to run anything.
- Take it when you want durable orchestration and no servers. The history lives in whichever storage backend the app is configured with, the scale controller adds and removes instances by queue depth, and consumption billing charges for the activity executions rather than for the days an instance spent waiting. A workflow that idles for a week is close to free while it idles.
- Write the state machine as code when the diagram is genuinely a program. Branches, loops and error handling in an orchestrator are `if`, `while` and `try`, which is easier to read and to test than the same transitions spread across a table, and the history gives you the audit trail a hand-rolled machine would have needed a design for.

## Cautions

- The orchestrator must be deterministic, because it is replayed from the start every time it resumes. `DateTime.UtcNow`, `Guid.NewGuid()`, `Random`, direct HTTP or database calls and non-deterministic LINQ ordering all answer differently on the replay than they did the first time, and the runtime loses its place. Use `context.CurrentUtcDateTime`, `context.NewGuid()` and `CallActivityAsync`, and read the code constraints page before writing the first one.
- Every side effect belongs in an activity, and there is no exception worth making. Activities run once per recorded result and their outputs are written to the history, so a replay returns the recorded value instead of calling again. Anything done directly in the orchestrator is done again on every replay, which is how a workflow sends the same email five times without a single retry being configured.
- Changing an orchestrator while instances are in flight breaks their replay. An instance that started on version 1 replays against version 1's history; insert an activity call in the middle and deploy, and the replay meets a history that no longer matches the code. The runtime's own answer is orchestration versioning: every instance is stamped with the version it started under, an orchestrator running newer code can branch on that stamp and keep old instances going, and workers on older code are kept off newer instances. Side-by-side deployment to a new task hub or storage account is the isolation-first alternative, and stopping the in-flight population is for prototypes. Pick one before the first release.
- A long history costs money and time on every replay. Loops are the usual culprit: an eternal orchestration that polls forever accumulates events until replay itself is the slow part. `ContinueAsNew` is the fix, restarting the instance with fresh state and an empty history, and it is the standard shape for anything monitoring or recurring rather than an optimisation to add later.

## In .NET

- In the isolated worker model — the only supported model once in-process support ends in November 2026 — the orchestrator is a function like any other, and `TaskOrchestrationContext` is the whole API surface that keeps it replayable.

```csharp
[Function(nameof(Onboard))]
public static async Task<string> Onboard(
    [OrchestrationTrigger] TaskOrchestrationContext context)
{
    var signup = context.GetInput<Signup>()!;

    // Each call is a checkpoint: the result is written to the history, so a
    // replay returns the recorded value instead of running the activity again.
    var account = await context.CallActivityAsync<Account>(nameof(CreateAccount), signup);

    // A retry policy belongs to one activity, not to the orchestration.
    await context.CallActivityAsync(
        nameof(ProvisionLicence),
        account,
        TaskOptions.FromRetryPolicy(new RetryPolicy(
            maxNumberOfAttempts: 4,
            firstRetryInterval: TimeSpan.FromSeconds(5),
            backoffCoefficient: 2)));

    // Neither of these holds a thread. Note the deterministic clock: the
    // deadline is derived from context, never from DateTime.UtcNow.
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

- Activities are where I/O is allowed, and they carry the usual message-handling obligation: the runtime may run one twice, so a step with an outside effect needs a key the far end can deduplicate on.
- Raise external events through the client, and choose the instance id rather than generating one. `ScheduleNewOrchestrationInstanceAsync` with an id derived from the thing the workflow is about refuses to start a second instance while the first is still running or pending, which is the cheapest deduplication available — but once that instance has completed, failed or been terminated the id is free again, so at most once per order still needs a status check in front of the call. `RaiseEventAsync` with the event name is what the approval webhook calls.
- Pick the storage provider deliberately. Azure Storage is the built-in one, needs no setup and has the lowest-cost billing model; the managed Durable Task Scheduler is the recommended backend and supports the highest throughput; the Microsoft SQL provider is the answer for on-premises and disconnected deployments; and Netherite is on its way out, with support ending in March 2028. Moving between them is a redeployment rather than a code change, and there is no migration path for existing state.
