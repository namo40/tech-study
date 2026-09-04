---
title: "Work Queue"
summary: "A work queue is the buffer between the tier that accepts a request and the tier that does the work, so each of them runs at its own speed and a peak turns into a backlog rather than a failure."
category: "Application architecture"
tags: ["queue"]
scene: web-queue-worker
sceneStep: 2
related:
  - label: Web Queue Worker
    slug: web-queue-worker
  - label: Background Job
    slug: background-job
  - label: Competing Consumers
    slug: competing-consumers
  - label: Queue-Based Load Leveling
    slug: queue-based-load-leveling
  - label: Dead Letter Queue
    slug: dead-letter-queue
  - label: Azure Service Bus
    slug: azure-service-bus
  - label: RabbitMQ
    slug: rabbitmq
references:
  - title: Queue-Based Load Leveling pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/queue-based-load-leveling
  - title: Competing Consumers pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/competing-consumers
  - title: System.Threading.Channels
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/channels
---

The queue is what separates the two tiers in time. The web tier writes a job and is finished with it; a worker reads that job whenever it has room. Neither side has to be sized for the other's worst minute, and the arrival rate stops being the thing that decides whether requests succeed. It also hands you the one measurement that matters: queue depth, and the age of the oldest message. Depth that climbs and never comes back down is not a spike, it is a tier that is permanently short of workers, and no CPU graph will tell you that as plainly.

A queue is only as durable as whatever holds it. `System.Threading.Channels` gives an in-process queue that is ideal for development and for work you would happily lose, because a restart takes everything still in it. Work that must survive belongs in a broker such as Azure Service Bus or RabbitMQ. That leaves one gap: writing to the database and writing to the broker are two operations that can fail apart from each other. An outbox table, written in the same transaction as the business data and relayed to the broker afterwards, closes it.

One queue read by several workers is the competing consumers pattern, and it is what makes adding a worker a throughput change and nothing else. The price is order. Messages leave the queue in order but finish in whatever order the workers finish them, so any two jobs that must not overlap need a partition key rather than a shared queue: sessions on Azure Service Bus, a consistent hash exchange on RabbitMQ, one queue per tenant. Everywhere else, let the workers compete, and write handlers that do not care which of their siblings got there first.
