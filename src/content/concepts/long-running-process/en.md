---
title: "Long-Running Process"
summary: "A long-running process is work that outlives the request that started it, and usually the process that started it too. Its state has to live outside memory, its waits have to be deadlines rather than blocked threads, and every step has to be safe to run again."
category: "Scheduled work and workflows"
scene: state-machine
sceneStep: 4
related:
  - label: State Machine
    slug: state-machine
  - label: Durable Workflow
    slug: durable-workflow
  - label: Human Approval
    slug: human-approval
  - label: Workflow Engine
    slug: workflow-engine
  - label: Retryable Step
    slug: retryable-step
  - label: Scheduled Job
    slug: scheduled-job
  - label: Background Job
    slug: background-job
  - label: Idempotency
    slug: idempotency
  - label: Graceful Shutdown
    slug: graceful-shutdown
  - label: Saga
    slug: saga
references:
  - title: "Web-Queue-Worker architecture style"
    url: https://learn.microsoft.com/en-us/azure/architecture/guide/architecture-styles/web-queue-worker
  - title: "Implement background tasks in microservices with IHostedService"
    url: https://learn.microsoft.com/en-us/dotnet/architecture/microservices/multi-container-microservice-net-applications/background-tasks-with-ihostedservice
  - title: "Durable Functions overview"
    url: https://learn.microsoft.com/en-us/azure/durable-task/durable-functions/durable-functions-overview
---

Three things distinguish a long-running process from work that merely takes a while. It waits for something outside itself, so its duration is not decided by how fast the code is. It spans deployments, so no version of the code owns it from beginning to end. And it is longer than any reasonable timeout, so nothing upstream can be holding a connection open for the answer.

Each of those forces something. Because it waits on the outside world, the wait has to be a stored deadline rather than a blocked thread: a row with a due time that a scheduler will notice, not a `Task.Delay` inside a request handler. A thread parked for two days is a thread lost at the first restart, and the restart will come. Because it spans deployments, its state has to be written down somewhere that survives them, and the current step has to be a value in a store rather than a program counter. And because nobody is waiting on the line, the caller has to be given a receipt when the work starts and a way to find out what happened later, which means the process needs an identity of its own from the first moment.

The state machine in the scene is what that comes to in practice. Every point the process can be parked at is a named state, every thing that can move it on is an event, and the current state is a row. It does not matter whether the event is a message from another service, a person clicking approve, or a timer coming due; they all arrive the same way and are all looked up in the same table. The step the process is on is not implicit in where the code happens to be, because there is no running code most of the time.

The part people underestimate is that every step has to be safe to run twice. A worker can commit its work and die before it records that it did, so the next worker will pick the same step up again. The fix is not to make the crash window smaller, because the window cannot be closed; it is to make repetition harmless. Give each step a key derived from the instance and the step, and let the first thing it does be a check for whether the effect is already there.

The choice of tool follows the shape of the waits. A process that is a chain of queued messages with no long gaps can be a background service reading a queue. One with waits measured in days, retries per step, and a need to answer "where is it?" for thousands of instances at once is what workflow engines exist for, and writing that machinery yourself means writing the history, the replay, the timers and the versioning yourself as well.
