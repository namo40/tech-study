---
title: "Stress Test"
summary: "A stress test keeps raising the load past the point where throughput stops growing, to find out how the system fails rather than when."
category: "Testing and verification"
tags: ["overload"]
level: 4
scene: load-test
sceneStep: 2
related:
  - label: Load Test
    slug: load-test
  - label: Capacity Test
    slug: capacity-test
  - label: Load Shedding
    slug: load-shedding
  - label: Bulkhead
    slug: bulkhead
  - label: Circuit Breaker
    slug: circuit-breaker
  - label: Rate Limiter
    slug: rate-limiter
references:
  - title: Load and stress testing ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/test/load-tests?view=aspnetcore-10.0
  - title: NBomber documentation
    url: https://nbomber.com/docs/getting-started/overview/
---

A stress test starts where a load test stops. Past the knee, extra load buys no extra throughput, so all of it turns into queueing: latency climbs, the client timeout starts cutting requests off, and whichever resource saturated first decides the shape of the failure. The point is not to find a bigger number. It is to see the failure before a real traffic event shows it to you.

What you are watching for is the failure mode. A service that sheds load stays up and answers a smaller share of requests correctly; a service that queues everything eventually answers none of them, because every request has already timed out by the time it reaches the front. A bounded queue, a concurrency limit, and a short connect timeout are what turn a collapse into a degradation, and a stress test is how you find out whether yours work.

Then take the load away and watch the recovery. Note how long p95 takes to come back to normal, whether the connection pool and the thread pool drain on their own, and whether anything needed a restart. That interval is the one an incident will actually be judged by, and it is cheaper to measure it on purpose than to learn it at three in the morning.
