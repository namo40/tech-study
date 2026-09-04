---
title: "Dapr Workflow"
summary: "Dapr Workflow is the durable workflow building block of the Dapr runtime: you write the orchestration in your own language SDK, the sidecar persists its progress to a configured state store, and the replay-based execution model is the same one Durable Functions and Temporal use."
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
  - label: Azure Durable Functions
    slug: azure-durable-functions
  - label: Temporal
    slug: temporal
  - label: Sidecar
    slug: sidecar
  - label: Scheduled Job
    slug: scheduled-job
references:
  - title: "Dapr Workflow overview"
    url: https://docs.dapr.io/developing-applications/building-blocks/workflow/workflow-overview/
---

## When to use

- Take it when the services already run with Dapr and now need a long-running process. The workflow arrives as one more building block beside state management and pub/sub, reached through the same sidecar, configured with the same component files and secured by the same access control, so there is no second runtime to deploy or a second set of credentials to manage.
- Use it for durable orchestration on your own Kubernetes cluster. The engine runs in the sidecar next to your process rather than in a hosted service, which is what makes a multi-step process that survives restarts available to a self-hosted platform without adopting a separate workflow server.
- Reach for it when the shape of the problem is activities, timers, external events and child workflows. Those four primitives cover most orchestrations: call a step and get a durable result, sleep for a day without holding a thread, wait for an approval that arrives from outside, and factor a large process into workflows that call each other.
- Consider it as the middle position between a cloud-specific serverless orchestrator and a full workflow platform. It is less tied to one vendor than Durable Functions and less operational work than running a Temporal cluster, which makes it a reasonable choice when portability matters more than the deepest feature set.

## Cautions

- Workflow code must be deterministic, and the rule is the family rule rather than a Dapr quirk. The engine reconstructs state by replaying the workflow from its history, so `DateTime.UtcNow`, `Guid.NewGuid()`, `Random` and direct I/O will answer differently on a replay and desynchronise the instance. Read the clock through the workflow context, generate randomness in an activity, and keep every side effect behind `CallActivityAsync`. Durable Functions and Temporal state the same constraint in their own APIs, so learning it once carries across all three.
- The state store is the durability, and its guarantees become the workflow's guarantees. Progress lives in whichever component you configured, so a store that is not transactional, not backed up or not durable makes the workflow the same. Check that the chosen store supports the transactional and actor state requirements before treating a long-running instance as safe.
- The sidecar is a runtime you now operate. Every workflow host needs its Dapr sidecar reachable and healthy, the placement service has to be there for the actors underneath and the scheduler service for the reminders its timers are built on, and upgrading the runtime is a coordinated operation rather than a library bump. A workflow whose sidecar is missing does not fail loudly at compile time; it fails at start.
- It is the youngest of the three engines here. The building block has been stable since Dapr 1.15, but its APIs and defaults moved between releases on the way there, which makes an old sample an unreliable guide. Pin the runtime version, read that version's notes, and check what the building block's own page says about it rather than trusting a tutorial.

## In .NET

- The `Dapr.Workflow` package makes a workflow a class with a `RunAsync` method and activities separate classes. The workflow body never calls a service directly: every outside effect goes through `CallActivityAsync`, which is what the history records and what a replay can skip.

```csharp
public class OrderWorkflow : Workflow<OrderPayload, string>
{
    public override async Task<string> RunAsync(WorkflowContext context, OrderPayload order)
    {
        // Activities are the only place I/O is allowed.
        var reserved = await context.CallActivityAsync<bool>(nameof(ReserveStock), order);
        if (!reserved) return "rejected";

        // A durable wait for something outside: no thread, survives a restart.
        try
        {
            await context.WaitForExternalEventAsync<Approval>("approval", TimeSpan.FromDays(2));
        }
        catch (TaskCanceledException)
        {
            await context.CallActivityAsync(nameof(ReleaseStock), order);
            return "expired";
        }

        // The clock comes from the context, never from DateTime.UtcNow.
        await context.CreateTimer(context.CurrentUtcDateTime.AddMinutes(5), CancellationToken.None);
        await context.CallActivityAsync(nameof(ChargeCard), order);
        return "completed";
    }
}
```

- Registration and hosting are ordinary ASP.NET Core wiring. `builder.Services.AddDaprWorkflow(o => { o.RegisterWorkflow<OrderWorkflow>(); o.RegisterActivity<ReserveStock>(); })` puts the workflow types in the host, and the process must then run with a sidecar beside it, which in development means `dapr run` and in Kubernetes means the `dapr.io/enabled` annotation on the pod.
- Starting, querying and terminating an instance is a client call rather than a message. `DaprWorkflowClient` schedules a new instance with an id you choose, reads its current status, raises an external event into a running one and terminates it, which is how an operator tool or an HTTP endpoint drives instances without reaching into the state store.
- Activities can run more than once, so the deduplication obligation is unchanged. A retried activity may repeat a side effect that already happened, and the engine guarantees the workflow's progress rather than exactly-once effects, which is the same trade every replay-based engine makes.
