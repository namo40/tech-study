---
title: "Soak Test"
summary: "A soak test holds a load the system can handle for hours, and looks for the faults that only appear with time: leaks, drift, and anything that grows and never comes back down."
category: "Testing and verification"
tags: ["memory"]
scene: load-test
sceneStep: 3
related:
  - label: Load Test
    slug: load-test
  - label: Capacity Test
    slug: capacity-test
  - label: Database Connection Pool
    slug: database-connection-pool
  - label: Thread Pool Starvation
    slug: threadpool-starvation
  - label: Garbage Collection
    slug: garbage-collection
  - label: Connection Lifetime
    slug: connection-lifetime
references:
  - title: dotnet-counters
    url: https://learn.microsoft.com/en-us/dotnet/core/diagnostics/dotnet-counters
  - title: Debug a memory leak in .NET
    url: https://learn.microsoft.com/en-us/dotnet/core/diagnostics/debug-memory-leak
---

A soak test is deliberately unexciting. Pick a load the service has already been shown to handle, usually the sustainable throughput a capacity test found, and hold it for hours rather than minutes. Nothing dramatic is supposed to happen, which is the point: what you are looking for is the slow class of fault that a ten minute run cannot produce.

The signal is a trend rather than a level. Plot working set, gen 2 heap size, open connections, thread count and handle count against elapsed time, and treat anything that rises steadily over hours and never falls as the finding, even when every latency number stayed flat. A leak of a few dozen bytes per request is invisible for the first million requests and fatal by the tenth. The same is true of a connection that is never returned, a cache with no bound, and a log file nobody rotates.

Restart nothing during the run, and compare the last hour with the first rather than with the objective. A soak that ends the moment a graph starts bending has not run long enough to answer the question it was asked, and one that ends with every graph flat is a result worth recording, because it is what makes the next regression obvious.
