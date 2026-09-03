---
title: "Latency"
summary: "Latency is what one request took, from the moment the caller sent it to the moment the answer arrived. Because every request has its own, what you actually hold is a distribution, and every single number quoted from it is a lossy summary."
category: "Requirements and quality attributes"
tags: ["latency"]
scene: tail-latency
sceneStep: 1
related:
  - label: Tail Latency
    slug: tail-latency
  - label: p95
    slug: p95
  - label: p99
    slug: p99
  - label: Throughput
    slug: throughput
  - label: Histogram
    slug: histogram
  - label: Request Timeout
    slug: request-timeout
references:
  - title: "Performance efficiency quick links"
    url: https://learn.microsoft.com/en-us/azure/well-architected/performance-efficiency/
  - title: "The Tail at Scale"
    url: https://research.google/pubs/the-tail-at-scale/
---

The scene's first step quotes three numbers for one endpoint: a mean of 62 ms, a median of 44, and a p99 of 400. They do not disagree. They are three summaries of the same pile of measurements, and the pile is the real object. Latency is a property of a request rather than of a service, so a service does not have a latency; it has thousands of them per minute, arranged in a shape. Which summaries of that shape are worth quoting is what the percentile pages next door are about. What matters here is that any single number is a reduction, and reductions throw things away.

One request's time is a sum of parts, and they behave differently. There are the network legs out and back, the time the request spends waiting in queues along the way, and the time something spends actually doing the work. The waiting term is the one that catches people out. It hides in accept backlogs, thread pool queues, connection pool checkouts and broker backlogs, none of which appear in a profiler, and it grows out of proportion to load: as utilization climbs toward saturation, processing time stays where it was while queueing time doubles and doubles again. A handler that measures 6 ms of its own work can be answering callers in 300. Half of measuring latency is saying which of these parts your number includes.

Latency and throughput are separate axes that pull on each other. Throughput is work finished per unit of time, and adding concurrency raises it until some resource saturates, after which the extra concurrency only makes queues longer: throughput flattens while latency climbs. Little's law states the coupling plainly, since the number of requests inside the system equals the arrival rate times the average time each spends there. At a fixed arrival rate, anything that raises latency raises the number of requests in flight, and with them the memory, connections and threads being held. This is why a system tuned for maximum throughput is usually a system with full queues, and why capacity plans that quote only a request rate are incomplete.

Where you measure decides what you have measured. Handler duration recorded inside the server excludes everything that happened before the handler was reached, which is exactly the queueing you most want to see. A client-side stopwatch includes name resolution, connection setup, retries and the client's own concurrency limits, so it is always the larger number and always the honest one when the question is what a user experienced. Quote the boundary next to the value. Record the observations as a distribution rather than as a running average, because an average cannot be un-averaged once written. And remember that latency has no natural upper bound of its own: the only reason a request stops taking longer is that a timeout, a circuit breaker or an impatient user gave up on it.
