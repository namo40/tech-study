---
title: "USE Method"
summary: "A checklist for finding a bottleneck: list every resource that can run out, then ask each one the same three questions about utilization, saturation and errors. Its value is coverage, because it makes you look where no dashboard was pointing."
category: "Requirements and quality attributes"
tags: ["metric"]
scene: throughput
sceneStep: 2
related:
  - label: Throughput
    slug: throughput
  - label: Utilization
    slug: utilization
  - label: Saturation
    slug: saturation
  - label: Tail Latency
    slug: tail-latency
  - label: dotnet-counters
    slug: dotnet-counters
  - label: Load Test
    slug: load-test
references:
  - title: "The USE Method"
    url: https://www.brendangregg.com/usemethod.html
  - title: "Performance efficiency design principles"
    url: https://learn.microsoft.com/en-us/azure/well-architected/performance-efficiency/principles
---

The three numbers the scene watches as load climbs, from the busy row in its second step to the queue that grows after it, are not three numbers about a system. They are three questions about one resource, and Brendan Gregg's USE method is the habit of asking them about every resource instead of the convenient one. For each resource: what is its utilization, what is its saturation, and is it producing errors. The method is not a metric and it adds no instrumentation of its own. It is an order of operations, and what it produces is a bottleneck rather than a graph.

The step people skip is the first one, which is that the resource list comes before any question. Write out everything in the system that has a limit and can therefore run out, without looking at a dashboard while you do it: CPU, memory, disk capacity and disk I/O, network interfaces, and then the software resources, which in a .NET service are usually the ones that actually bind. The thread pool has a size. A `SemaphoreSlim` gate has permits. `HttpClient` has a connection limit per endpoint if you set `MaxConnectionsPerServer`, which is unbounded by default, the SQL client has a pool, a `Channel` has a bounded capacity, and a downstream service has a quota. The list is what makes this a checklist rather than an intuition, and the discipline is to finish it before diagnosing anything. Its whole purpose is to surface the resource nobody built a panel for, because the resource nobody built a panel for is a good candidate for the one that is full.

Then walk the list and ask the three in the same shape every time, so the answers are comparable. Utilization is how much of the resource is in use over an interval, saturation is how much work is waiting because it was not available, and errors are the count of failed operations against it. Gregg suggests taking errors first in practice, since a non-zero error count is faster to interpret than either of the other two and often ends the investigation immediately. Two rules keep the walk honest. Answer every resource on the list, including the ones you are sure are fine, because certainty about the wrong resource is the reason the search was long. And where a metric is missing, record that it is missing rather than skipping the row; an unmeasured resource is an open question, not a healthy one.

The method's boundary is worth knowing as well as its shape. USE looks at a system from the resource side, and RED looks at the same system from the request's side, asking about the rate, errors and duration of a service; the two answer different questions and are usually run together, one to say that users are suffering and the other to say what ran out. What USE will not find is a problem that is not a resource: a lock that serialises work while nothing is busy, a query that is slow because it is wrong, a retry storm that looks like legitimate load, or a dependency whose own bottleneck is outside your list. It is also most useful applied under known load, which is why a load test and this checklist belong in the same afternoon.
