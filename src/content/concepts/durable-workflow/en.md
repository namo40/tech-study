---
title: "Durable Workflow"
summary: "A durable workflow is a process whose progress is written down as it happens, so it can be rebuilt after a crash and carry on from where it stopped. The code reads as a sequence; the engine turns it into a record."
category: "Scheduled work and workflows"
scene: state-machine
sceneStep: 4
related:
  - label: State Machine
    slug: state-machine
  - label: Long-Running Process
    slug: long-running-process
  - label: Human Approval
    slug: human-approval
  - label: Workflow Engine
    slug: workflow-engine
  - label: Retryable Step
    slug: retryable-step
  - label: Idempotency
    slug: idempotency
  - label: Saga
    slug: saga
  - label: Azure Durable Functions
    slug: azure-durable-functions
  - label: Temporal
    slug: temporal
  - label: Dapr Workflow
    slug: dapr-workflow
references:
  - title: "Durable Functions overview"
    url: https://learn.microsoft.com/en-us/azure/durable-task/durable-functions/durable-functions-overview
  - title: "Durable orchestrations: code constraints"
    url: https://learn.microsoft.com/en-us/azure/durable-task/common/durable-task-code-constraints
  - title: "Temporal .NET SDK"
    url: https://docs.temporal.io/develop/dotnet
---

The fourth step of the scene puts a history strip under the machine and a bar that sweeps it. That strip is the whole idea. A durable workflow does not keep its progress in the call stack, because a call stack does not survive the process it lives in. It keeps it as an append-only list of things that have already happened: this step was scheduled, this step returned this value, this timer was armed, this external event arrived.

Replay is what turns that list back into a running process. When an instance has to be resumed, the engine runs the orchestration code again from the top, and every call the code makes is answered out of the history instead of being performed. A call to a step that already returned yields the recorded result immediately; a timer that already fired completes immediately; a wait for an event that already arrived returns it. The code races forward through everything it has already done, reaches the first thing that has not happened yet, and blocks there. From the outside it has resumed; from the inside it has simply been re-executed with its past handed to it.

That mechanism is also the constraint. Replay only produces the same sequence if the code is deterministic, so an orchestration may not read the clock, generate a random number or a new identifier, or call out to anything directly. Everything non-deterministic has to go through the engine, which performs it once and records the answer: a durable timer instead of `Task.Delay`, an activity instead of an `HttpClient` call, an engine-supplied identifier instead of `Guid.NewGuid()`. Ordinary code that would be perfectly correct anywhere else becomes wrong here, and the mistake is invisible until an instance is replayed on a different day.

Versioning is the second consequence. An instance started last week is a history written against last week's code, and if the new code schedules different steps in a different order, replaying that history through it produces a mismatch. Engines detect this and stop rather than corrupt the instance. The ways out are all deliberate: let existing instances drain on the old version before deploying the new one, branch inside the orchestration on a version marker the engine supplies, or start a new workflow type and leave the old one running until nothing uses it.

What you get for the trouble is a process that survives everything short of losing the history itself. A deployment in the middle of a two-day wait is not an incident. A crashed worker is picked up by another one. And because the history is a record of what happened rather than a log message about it, the state of every in-flight instance is queryable: you can ask which orders are waiting on an approval, and how long they have been waiting, without adding any tracking of your own.
