---
title: "Scheduled Job"
summary: "Work that starts because the clock said so rather than because somebody asked. The schedule owns when it fires; something else has to own whether it finished."
category: "Scheduled work and workflows"
scene: workflow-engine
sceneStep: 1
related:
  - label: Workflow Engine
    slug: workflow-engine
  - label: Background Job
    slug: background-job
  - label: Long-Running Process
    slug: long-running-process
  - label: Durable Workflow
    slug: durable-workflow
  - label: Retryable Step
    slug: retryable-step
  - label: Human Approval
    slug: human-approval
  - label: Leader Election
    slug: leader-election
  - label: Distributed Lock
    slug: distributed-lock
  - label: Competing Consumers
    slug: competing-consumers
  - label: Web-Queue-Worker
    slug: web-queue-worker
references:
  - title: "Timer trigger for Azure Functions"
    url: https://learn.microsoft.com/en-us/azure/azure-functions/functions-bindings-timer
  - title: "Worker services in .NET"
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/workers
  - title: "Background tasks with hosted services in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/host/hosted-services
---

The first step of the scene has two boxes in it and they are doing two entirely different jobs. The Schedule holds a standing instruction — `daily 02:00` — and the only thing it ever does is light `due` and send one signal down the lane. The Engine takes that signal and starts an instance. Everything after that belongs to the Engine, and the Schedule never hears about it again. That separation is the whole idea of a scheduled job, and it is the part people collapse when they build one by hand.

A schedule is a trigger, not a supervisor. It answers exactly one question — is it time — and it answers it by wall clock. It does not know whether the last run finished, whether it finished successfully, whether it is still running, or what it got through before it stopped. If you want any of those answers, something on the other side of the lane has to be keeping them, which is why the `history` card sits in the Engine box and not in the Schedule box.

Which means the two hard questions about a scheduled job are both about overlap. What happens if the run at 02:00 is still going at 03:00, when the next one fires? A schedule with no answer starts a second one, and now two processes are working the same rows. The usual fixes are a concurrency guard that makes the second fire a no-op, a lease the run holds for its duration, or a definition that is safe to run twice at once. Pick one deliberately; the default in most schedulers is "start it anyway".

And what happens when the scheduled hour passes while nobody is running? A deployment, a rolling restart, a node that was cordoned for twenty minutes at exactly the wrong time. Some schedulers fire late, some skip the occurrence entirely, and the difference between the two is a settlement that ran and a settlement that silently did not. Find out which one yours does before you need to know, and decide whether a missed occurrence should be caught up or written off.

The second half of it is running only once when the service runs on more than one node. A `PeriodicTimer` inside an `IHostedService` is a per-process timer, so three replicas mean three runs a night — usually discovered when the third replica is added, months after the job was written. The answers are to move the schedule outside the app (a scheduler service, a cron object, a timer-triggered function), or to take a distributed lock or a leader election in front of the timer so only one replica acts on the tick.

Finally: the schedule is not the record. It is tempting to treat "the job ran at 02:00" as good enough, because the log line exists. But a log line says the process started, not that the work completed, and it certainly does not say which of nine steps got through before the pod was evicted. That is the argument the rest of this scene makes. The clock is a good way to start something. It is a terrible way to know what happened.
