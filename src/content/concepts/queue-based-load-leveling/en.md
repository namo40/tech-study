---
title: "Queue-Based Load Leveling"
summary: "Putting a queue between a bursty producer and a steady consumer, so the burst is absorbed rather than felt. It levels the rate, not the total, and only a bounded queue turns that into a promise."
category: "Resilience"
tags: ["queue", "overload"]
scene: backpressure
sceneStep: 2
related:
  - label: Backpressure
    slug: backpressure
  - label: Bounded Concurrency
    slug: bounded-concurrency
  - label: Batching
    slug: batching
  - label: Web Queue Worker
    slug: web-queue-worker
  - label: Work Queue
    slug: work-queue
  - label: Competing Consumers
    slug: competing-consumers
  - label: Rate Limiter
    slug: rate-limiter
  - label: Bulkhead
    slug: bulkhead
  - label: Thread Pool
    slug: thread-pool
  - label: Spike Test
    slug: spike-test
references:
  - title: "Queue-Based Load Leveling pattern"
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/queue-based-load-leveling
  - title: "System.Threading.Channels"
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/channels
  - title: "BoundedChannelOptions class"
    url: https://learn.microsoft.com/en-us/dotnet/api/system.threading.channels.boundedchanneloptions
---

The second step of the scene is the pattern working exactly as advertised. Input triples, the consumer does not flinch, and everything downstream of the buffer carries on at the rate it was already comfortable with. That is the whole trade: the queue converts a spike in arrival rate into a rise in depth, and depth is a much easier thing for a system to survive than a rate it cannot serve. Nothing downstream had to be scaled, nothing had to be told, and no request was refused. For a burst — a marketing email going out, a batch job waking up, a partner's nightly push — that is often the entire fix.

What makes it work is that a burst is finite. Levelling is arithmetic over time: if the consumer can do C per second and the producer offers an average of A per second with A below C, then any amount of burstiness is survivable given enough buffer, because the queue drains between bursts. The buffer is paying for variance, not for capacity. It is worth saying that out loud, because the pattern is routinely deployed against the case it cannot fix. When A is above C and stays there, the queue is not levelling anything; it is accumulating. There is no depth at which that stops.

Which is why the second half of the step matters more than the first. While input stays above output, the depth only grows, and every item's wait grows with it. An item that arrives when the buffer holds 400 items and the consumer does 50 a second is going to wait eight seconds before it is even looked at, and if the caller's timeout is five, the work will still be done and the answer will still be thrown away. That is the failure mode nobody watches for, because throughput looks fine — the consumer is at a hundred percent, doing exactly what it always did. The dashboard is green while every user is timing out.

So the two numbers worth alerting on are depth and the age of the oldest item. Depth tells you the buffer is filling; age tells you what an item is actually experiencing, and it is the one that maps onto a promise you can make to a caller. If you know the oldest item is never more than two seconds old, you know something useful. If you only know throughput, you know nothing about whether the queue is keeping up, because a saturated system and an idle one have the same throughput when the idle one has no work.

The queue also has to be bounded, or the levelling has no edge and neither does the promise. Capacity should come from the wait you are willing to accept: worst acceptable wait times consumer rate. Two seconds at fifty a second is a hundred items, and the hundred-and-first is where the system has to make a decision — wait, drop, or refuse. That decision is unpleasant to write down and that is exactly why it is worth writing down, because the alternative is a buffer that keeps growing until the process is killed, which is the same decision made badly by a machine at three in the morning.

Levelling is also not the same thing as smoothing consumption. If the consumer scales with the queue, depth stays low and you have bought responsiveness rather than protection; if the consumer is deliberately fixed — a rate-limited third-party API, a database you refuse to hammer, a licence with a seat count — depth is the price of that decision and should be expected to move. Decide which of the two you are doing before you tune anything, because the alarms are opposite: in the first case a persistently non-empty queue means scaling is broken, and in the second it means the system is working.
