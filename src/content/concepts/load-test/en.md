---
title: "Load Test"
summary: "A load test pushes realistic traffic at a system and watches what bends first. The number you are after is not the peak throughput but the highest load at which latency and errors still meet the objective."
category: "Testing and verification"
tags: ["overload"]
level: 3
scene: load-test
steps:
  - title: "Ramp"
    text: "Warm up first, then raise the load in steps and hold each one. At 100 virtual users the service answers 475 requests a second with a p95 of 40 ms and no errors. While throughput rises in a straight line and latency stays flat, the system is not the bottleneck yet."
  - title: "The knee"
    text: "Past about 300 users, more load adds no throughput, only queueing: p95 climbs to 540 ms and timeouts begin. The dependency meters say what saturated first. The connection pool is full with 180 requests waiting for one while the CPU is at 60%, so the pool is the thing to fix or size."
  - title: "Sustainable, then soak"
    text: "Back off to the highest load that still meets the objective. Here that is 890 requests a second at a p95 of 180 ms, and that number, not the peak of 1,060, is the capacity. Then hold it: the heap climbs 40% to 65%, a leak no short test shows."
  - title: "Make it real"
    text: "One hot id makes every request a cache hit, and the same service reports 1,121 requests a second at a p95 of 24 ms. With ten thousand ids and a 60% hit ratio it reports 886 and 189 ms. Read the load with a fixed arrival rate too, because users who politely wait let a slow server throttle its own test."
related:
  - label: Stress Test
    slug: stress-test
  - label: Spike Test
    slug: spike-test
  - label: Capacity Test
    slug: capacity-test
  - label: Soak Test
    slug: soak-test
  - label: Throughput
    slug: throughput
  - label: Tail Latency
    slug: tail-latency
  - label: SLO
    slug: slo
  - label: Database Connection Pool
    slug: database-connection-pool
  - label: Thread Pool Starvation
    slug: threadpool-starvation
  - label: Rate Limiter
    slug: rate-limiter
  - label: USE Method
    slug: use-method
references:
  - title: Load and stress testing ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/test/load-tests?view=aspnetcore-10.0
  - title: dotnet-counters
    url: https://learn.microsoft.com/en-us/dotnet/core/diagnostics/dotnet-counters
  - title: NBomber documentation
    url: https://nbomber.com/docs/getting-started/overview/
---

## When to use

- Before a launch, a traffic event, or a capacity decision, and after any change to the data layer, the pool sizes, or the runtime configuration.
- To find which resource saturates first, so that scaling and tuning target the real bottleneck instead of the one that is easiest to add.

## Cautions

- Report the sustainable throughput at the objective, not the peak. The peak is the point where you were already failing, and quoting it commits you to a number the service cannot hold.
- Separate warm-up from measurement. The JIT, the caches, and the connection pools all start cold, and the first minute measures the start-up rather than the system.
- Test with production-like data cardinality, payload sizes, keep-alive, and HTTP version. One hot key turns every request into a cache hit and every number into a claim about a system nobody runs.
- Prefer an open model with a fixed arrival rate for user-facing services. A closed model with think time sends less load as the server slows, so it hides the slowdown it was meant to find.
- Watch the dependencies while the test runs: pool waits, thread pool queue length, GC pause, queue depth, and downstream rate limits. The service can look healthy while the database is the thing that gave way.
- Run soak tests long enough for leaks, pool drift, and fragmentation to show. An hour of clean numbers says nothing about the eighth hour.
- Drive the load from outside the network path you are measuring, and check the generator itself is not the bottleneck.

## In .NET

```csharp
// An open-model scenario: a fixed arrival rate, realistic ids, production-like client.
var http = new HttpClient(new SocketsHttpHandler { PooledConnectionLifetime = TimeSpan.FromMinutes(2) })
{
    BaseAddress = new Uri("https://shop.internal"),
    DefaultRequestVersion = HttpVersion.Version20,
};
var ids = await File.ReadAllLinesAsync("order-ids.txt");   // 10k real ids, not one hot key

var scenario = Scenario.Create("get_order", async ctx =>
    {
        var id = ids[Random.Shared.Next(ids.Length)];
        using var response = await http.GetAsync($"/orders/{id}", ctx.ScenarioCancellationToken);
        return response.IsSuccessStatusCode ? Response.Ok() : Response.Fail();
    })
    .WithWarmUpDuration(TimeSpan.FromSeconds(30))
    .WithLoadSimulations(
        Simulation.RampingInject(rate: 900, interval: TimeSpan.FromSeconds(1), during: TimeSpan.FromMinutes(2)),
        Simulation.Inject(rate: 900, interval: TimeSpan.FromSeconds(1), during: TimeSpan.FromHours(2)));   // soak

NBomberRunner.RegisterScenarios(scenario).Run();
```

```text
# While it runs, watch the server, not only the client:
dotnet-counters monitor --process-id <pid> \
  --counters System.Runtime,Microsoft.AspNetCore.Hosting,Microsoft.Data.SqlClient.EventSource
```

`Simulation.Inject` is the open model: it injects a fixed rate whatever the service does with it, so a slowdown shows up as a growing queue and rising latency rather than as a quietly smaller test. The three rules the scenario above encodes hold whichever tool you use, k6 included: keep the arrival rate open, spread the load over realistic ids rather than one hot key, and drive it with a production-like client. The rule most often skipped is a fourth one, and it is outside the client altogether: client-side numbers alone cannot tell you which server-side resource saturated, so collect counters from the service and its dependencies for the whole run.
