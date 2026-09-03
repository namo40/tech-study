---
title: "Temporal"
summary: "Temporal is a durable execution platform you run: your workers execute the workflow code, the Temporal server keeps its event history, and a crash, a deploy or a week-long wait is just a gap between two entries in that history rather than lost work."
category: "Scheduled work and workflows"
related:
  - label: Durable Workflow
    slug: durable-workflow
  - label: Workflow Engine
    slug: workflow-engine
  - label: State Machine
    slug: state-machine
  - label: Human Approval
    slug: human-approval
  - label: Retryable Step
    slug: retryable-step
  - label: Saga
    slug: saga
  - label: Azure Durable Functions
    slug: azure-durable-functions
  - label: Dapr Workflow
    slug: dapr-workflow
references:
  - title: Temporal Documentation
    url: https://docs.temporal.io/
  - title: Temporal .NET SDK
    url: https://docs.temporal.io/develop/dotnet
---

## When to use

- Take it when a business process runs for days or weeks and has to be written as one readable program. A subscription lifecycle, a claims process, an onboarding that spans four systems and two approvals: as a workflow this is a method with loops and branches, and the platform makes it survive every restart that happens during those weeks without the state being spread across a status column and a cron job.
- Use it when something outside has to talk to a running instance. Signals deliver an event into a workflow that is mid-execution, queries read its current state without changing it, and updates do both in one call. That is how a cancellation, an amendment or an approval reaches work already in flight, and it is the part hand-built workflow tables usually never get.
- Reach for it when retries and timeouts should be declared rather than coded. Each activity carries a retry policy and a set of timeouts, so backoff, attempt caps and the difference between "this attempt took too long" and "the whole activity took too long" are configuration on the call rather than a `while` loop somebody wrote once and nobody tuned.
- Choose it when you want durable execution without tying the design to one cloud. The server is open source and runs on your infrastructure against your database, the SDKs are ordinary libraries in your own services, and Temporal Cloud is the managed option for the same API rather than a different product you would have to port to.

## Cautions

- Workflow code must be deterministic, and the rule is the same one every replay-based engine has. Wall-clock reads, `Guid.NewGuid()`, `Random`, direct I/O and anything that depends on the machine it runs on will answer differently on the replay and desynchronise the workflow from its history. Use `Workflow.UtcNow`, `Workflow.NewGuid()`, `Workflow.DelayAsync` and activities; the SDK's analyzer and its replay tests are there to catch the rest.
- Changing workflow logic while instances are running is the operational problem to plan for, not to discover. An old instance replays against a history the new code no longer produces, and the result is a non-determinism error rather than a wrong answer. Temporal's answer is patching: `Workflow.Patched` marks the changed branch so old histories take the old path and new ones take the new, followed later by `DeprecatePatch` and then removal once nothing old remains. Learn that three-step sequence before the first change, because it is the whole versioning story.
- You are operating a distributed system, and self-hosting means owning it. The server needs a database (Cassandra, MySQL or PostgreSQL), plus visibility storage, plus the usual monitoring, upgrades and capacity planning; retention settings decide how long histories live and how large the store grows. Temporal Cloud removes that work and replaces it with a bill and a vendor. Either is fine, and pretending the first option is free is not.
- Task queues and worker capacity are your throughput design, not a detail. Workers poll named task queues, and a queue whose workers are saturated simply accumulates tasks: workflow tasks and activity tasks have separate concurrency limits, and long-running activities on the same queue as short ones will starve them. Separate the queues by workload shape before load shows you why.

## In .NET

- The Temporalio SDK makes a workflow a class and activities plain methods. The workflow body never touches I/O directly; every outside effect goes through `ExecuteActivityAsync`, which is what the history records.

```csharp
[Workflow]
public class OnboardWorkflow
{
    [WorkflowRun]
    public async Task<string> RunAsync(Signup signup)
    {
        // Timeouts and retries are declared on the call, not coded in a loop.
        var account = await Workflow.ExecuteActivityAsync(
            (Activities a) => a.CreateAccountAsync(signup),
            new()
            {
                StartToCloseTimeout = TimeSpan.FromMinutes(2),
                RetryPolicy = new() { MaximumAttempts = 4, InitialInterval = TimeSpan.FromSeconds(5) },
            });

        // A durable wait: no thread, and it survives a worker restart. The
        // condition is fed by the signal handler below.
        if (!await Workflow.WaitConditionAsync(() => approved is not null, TimeSpan.FromDays(3)))
        {
            return "escalated";
        }

        return approved == true ? "active" : "rejected";
    }

    private bool? approved;

    // The outside world reaches a running instance through signals.
    [WorkflowSignal]
    public Task ApproveAsync(bool decision)
    {
        approved = decision;
        return Task.CompletedTask;
    }
}
```

- Registering the worker is where the task queue is chosen, and it is a deliberate choice. A `TemporalWorker` binds a client, a queue name, the workflow types and the activity instances, so splitting slow activities onto their own queue and their own worker process is a registration change rather than a rewrite.
- Activities may be run more than once, so the deduplication obligation is unchanged. Temporal guarantees the workflow's progress, not that an activity's side effect happened exactly once, and a heartbeat on a long activity is what lets the server detect a dead worker rather than waiting out the full timeout.
- Test the replay, not just the happy path. The SDK can run a recorded history against the current code and fail if it no longer matches, which turns the versioning caution above into a check that runs in CI before a deployment breaks an instance that started last week.
