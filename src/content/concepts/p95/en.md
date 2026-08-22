---
title: "p95"
summary: "p95 is the latency the slowest one request in twenty sees. It moves early enough to be a useful warning and has enough samples behind it to stay steady, which is why alerts are usually set on it."
category: "Requirements and quality attributes"
scene: tail-latency
sceneStep: 1
related:
  - label: Tail Latency
    slug: tail-latency
  - label: p50
    slug: p50
  - label: p99
    slug: p99
  - label: Hedging
    slug: hedging
references:
  - title: Built-in metrics in ASP.NET Core
    url: https://learn.microsoft.com/en-us/dotnet/core/diagnostics/built-in-metrics-aspnetcore
---

p95 is the usual alerting threshold because it sits between the two things you want from a number, sensitivity and stability. p99 reacts to a handful of requests and jitters along with them; p50 barely reacts at all. p95 moves when a real fraction of the traffic has slowed down, and it moves before p99 does.

It is also the number a hedge is normally configured from. Wait about p95 before sending a second copy and nineteen calls in twenty are never duplicated, which is what keeps the extra load small enough for the trade to be worth making.

Read p95 as a ratio to p50 rather than on its own. A p95 twice p50 is an ordinary spread. A p95 ten times p50 says there are two populations in there, and the interesting question is what separates them: a cache miss, a cold connection, a different shard.
