---
title: "Human Approval"
summary: "A human approval is a step in a process that waits for a person to decide. It is an external event with no service level agreement, so it needs a state to wait in, a deadline, and something to do when the deadline passes."
category: "Scheduled work and workflows"
scene: state-machine
sceneStep: 4
related:
  - label: State Machine
    slug: state-machine
  - label: Durable Workflow
    slug: durable-workflow
  - label: Long-Running Process
    slug: long-running-process
  - label: Workflow Engine
    slug: workflow-engine
  - label: Scheduled Job
    slug: scheduled-job
  - label: Timeout
    slug: timeout
  - label: Idempotency
    slug: idempotency
  - label: Saga
    slug: saga
  - label: Azure Durable Functions
    slug: azure-durable-functions
  - label: Temporal
    slug: temporal
references:
  - title: "Human interaction in durable functions"
    url: https://learn.microsoft.com/en-us/azure/azure-functions/durable/durable-functions-overview#human
  - title: "Wait for external events in durable orchestrations"
    url: https://learn.microsoft.com/en-us/azure/azure-functions/durable/durable-functions-external-events
  - title: "Temporal signals"
    url: https://docs.temporal.io/encyclopedia/application-message-passing
---

An approval looks like a call to another service until you notice that it has no timeout worth the name. A service either answers in a second or it has failed; a person answers in an hour, or on Monday, or after being reminded twice, and none of those are failures. That single difference is what makes an approval a state rather than a call.

So the process parks. It moves into a state that says what it is waiting for, writes that state down, and stops running: exactly what the fourth step of the scene shows, with the order sitting in `Paid` while the engine's step reads `wait for approval`. Nothing is holding a thread, nothing is holding a connection, and if every machine in the fleet restarts, the only thing that has to survive is the row. What the person eventually does arrives as an ordinary event, is looked up in the same table as every other event, and moves the machine on.

A wait with no end is a leak, so an approval always comes with a deadline armed at the same time as the wait begins. The interesting design question is what the deadline does. Escalating is the usual answer: reassign to a second approver, or to the first one's manager, and arm a new deadline. Auto-approving is legitimate for low-value decisions and a liability for anything else. Auto-rejecting is safest when the decision is about permitting something. Whatever the choice, it belongs in the table as a transition from the waiting state on a `timeout` event, which is what stops it being an accident of whichever background job happens to sweep the table.

Two details cause most of the trouble in practice. The first is that approvals arrive twice: someone clicks the link in the email, then clicks it again from their phone, or a reminder is answered after the decision has already been taken. The handler has to check the state it expects to be leaving rather than assume it, or the same approval will move a machine that has already moved on. The second is that people leave. An approval addressed to an individual outlives their account more often than anyone plans for, so address it to a role and resolve the role when the notification goes out.

Finally, treat the record as part of the feature rather than as logging. Who approved it, when, on what version of the request, and what they saw at the time are the questions asked after the fact, and a durable workflow already keeps a history that answers them. What it will not answer by itself is what the approver was looking at, so put the decision's inputs in the event rather than a link to whatever the screen shows now.
