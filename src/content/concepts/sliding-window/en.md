---
title: "Sliding Window"
summary: "A sliding window counts the last N seconds from now rather than from the top of the clock: a fixed window leaks a double burst across its boundary, the sliding window closes that seam, and a leaky bucket goes one step further and smooths what passes into a steady drip."
category: "Resilience"
tags: ["overload", "latency"]
level: 4
scene: sliding-window
steps:
  - title: "A fixed window's limit doubles at the seam"
    text: "Four requests slip in at the end of one window, four more at the start of the next: all eight in two seconds, where the limit is four. The window resets on the clock's schedule, not the traffic's; the ninth, a fifth in its window, it refuses."
  - title: "A sliding window counts backward from now"
    text: "Same burst, same limit — but the window moves with the clock hand instead of jumping. The second burst arrives to find the first still inside the last N seconds, so the excess drops, and passage resumes only as the old requests slide out. At every instant, the last N seconds hold at most four. The seam is gone because there is no seam."
  - title: "Exactness has a price, and approximation trims it"
    text: "A true sliding window remembers every arrival's timestamp — per key, at scale that is a ledger. The common trade keeps two fixed buckets and weighs the previous one by its overlap: a close estimate that over-admits a little at the edge."
  - title: "A window measures a count; a bucket makes a rate"
    text: "So far the rule only said how many may pass; what passed stayed bursty. The leaky bucket holds arrivals, releases them at one fixed drip so downstream sees a steady stream however lumpy the input, and drops what overflows. Its sibling the token bucket spends saved credit in bursts; this one smooths."
related:
  - label: Rate Limiter
    slug: rate-limiter
  - label: Fixed Window
    slug: fixed-window
  - label: Leaky Bucket
    slug: leaky-bucket
  - label: Token Bucket
    slug: token-bucket
  - label: Throttling
    slug: throttling
  - label: Load Shedding
    slug: load-shedding
  - label: Backpressure
    slug: backpressure
  - label: Bounded Concurrency
    slug: bounded-concurrency
  - label: Retry
    slug: retry
references:
  - title: Rate limiting middleware in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/performance/rate-limit
  - title: Rate Limiting pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/rate-limiting-pattern
  - title: System.Threading.RateLimiting
    url: https://learn.microsoft.com/en-us/dotnet/api/system.threading.ratelimiting
---

## When to use

- Use a sliding window when the limit is a promise you have to keep. Billing tiers, per-key API quotas and abuse control all say a number out loud, and a fixed window quietly allows twice it across every boundary. The arithmetic is not subtle: a limit of 100 per minute admits 100 in the last second of one minute and 100 in the first second of the next, which is 200 requests in about two seconds, entirely within the rules. If somebody is going to schedule traffic against your limit on purpose, they will schedule it there.
- Stay with a fixed window when approximate fairness is enough and memory is precious. One counter per key, reset on a clock the whole fleet already agrees on, is the cheapest limiter there is, and for a rough guard on a cheap endpoint the seam may genuinely not matter. Own it knowingly: write down that the effective peak is twice the configured limit, size the dependency behind it for that peak, and do not put the number in a contract.
- Reach for a leaky bucket when what is downstream needs a shaped rate rather than a count. A fragile legacy system that falls over above thirty writes a second, a per-connection write cap, a device that must be polled evenly: none of those care how many requests arrived in the last minute, they care that no two arrive too close together. A window can only say yes or no; a bucket decides when.
- Prefer the segmented approximation when you are limiting for abuse control at scale. It costs two counters per key instead of one timestamp per request, it removes the free reset at the boundary, and its error on real traffic is small. It is what most production limiters actually run, and choosing it deliberately is different from ending up with a fixed window by accident.
- Combine rather than choose when the two questions are both real. A sliding window on the public quota answers "has this customer had their share this hour", and a leaky bucket in front of the fragile dependency answers "is anything going downstream faster than it can take". They are different limits at different places, and neither substitutes for the other.

## Cautions

- The seam is not theoretical, and it is worse when clients are synchronized. Every client that retries on a round minute, every cron that fires at the top of the hour, and every mobile app that wakes on a shared schedule pushes its traffic into the same boundary, so the doubled burst arrives all at once rather than spread across your key space. If you keep fixed windows, at least jitter the window origin per key so the seams do not line up.
- An exact sliding window costs a timestamp log per key. Every arrival is stored, every decision scans the entries newer than `now - N`, and every scan trims the ones older than that. Redis sorted sets are the canonical implementation — `ZREMRANGEBYSCORE` to trim, `ZCARD` to count, `ZADD` to record, all in one pipeline or script — and the memory is proportional to the limit times the number of active keys. That is affordable for a limit of 100 and a few thousand keys, and it is not affordable for a limit of 10,000 and a few million.
- The two-segment approximation can over-admit and under-admit slightly at the edges of a pattern. It assumes the previous segment's arrivals were spread evenly across it, so a burst crowded into the end of that segment is weighed as though it were spread over the whole of it. On an adversarial burst that is worth a fraction more than the limit inside one window — nowhere near the doubling a fixed window gives away, but not zero. That is fine for abuse control and it is not fine for anything you are going to invoice from, so use the exact log where the number is money.
- A leaky bucket adds queueing delay, and that is not a defect, it is the mechanism. The bucket is a queue, so a request that arrives while it is half full waits for the drips ahead of it. Bound the wait — cap the capacity, or set a deadline per item and drop rather than deliver something nobody is waiting for any more — and make sure the caller is told which it was. A silent forty-second queue is far worse than a fast rejection.
- A full bucket needs a drop policy, chosen rather than inherited. Head drop, tail drop, priority drop and reject-with-retry-signal are all defensible, and they behave very differently under sustained overload. Tail drop is the usual default and it punishes the newest request, which is often the one whose caller is still waiting.
- Distributed limiters need shared state or honest division. A per-node limit of 100 across ten nodes is a limit of 1,000, and load balancing will not save you from that; it only decides how unfairly the real limit is spread. Either keep the counters in one shared store and pay the round trip, or divide the limit by the node count and accept that a client pinned to one node gets a tenth of the quota. Both are fine; pretending the per-node number is the real number is not.
- Always return a retry signal. A rejection with no `Retry-After` teaches every client to hammer, and a well-behaved caller cannot behave well without being told when to come back. Return 429, put the wait in the header, and make the number honest — the earliest instant the window will actually have room, which a sliding window can compute exactly.
- Clock skew decides the boundary wherever the window is aligned to wall-clock time — a Redis key named for the current minute is the usual form — because nodes whose clocks disagree then disagree about which window a request is in. Keep the nodes on NTP, or derive the window from a single authority such as the shared store's own clock.

## In .NET

`System.Threading.RateLimiting` ships the three algorithms this scene draws, and the names line up with them exactly. `FixedWindowRateLimiter` is the partitioned window with the seam; `SlidingWindowRateLimiter` is the segmented approximation, where `SegmentsPerWindow` is how many pieces the window is cut into; `TokenBucketRateLimiter` is the sibling that saves allowance up:

```csharp
// A window of one minute cut into six ten-second segments. The oldest segment
// expires every ten seconds instead of the whole count resetting at once, so
// there is no instant at which the limit is handed back in full.
var limiter = new SlidingWindowRateLimiter(new SlidingWindowRateLimiterOptions
{
    Window = TimeSpan.FromMinutes(1),
    SegmentsPerWindow = 6,
    PermitLimit = 100,
    QueueLimit = 0,                                   // reject rather than wait
    QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
});

using var lease = await limiter.AcquireAsync(permitCount: 1);
if (!lease.IsAcquired) return Results.StatusCode(429);
```

More segments means a closer approximation and more counters; six is a reasonable starting point. Note that this is a different approximation from the weighted pair of buckets above: .NET keeps `SegmentsPerWindow` counters and every `Window`/`SegmentsPerWindow` the oldest segment's permits come back whole, with no weighting. Its residual error is not an assumption about how arrivals were spread but the segment granularity itself — an arrival late in a segment is forgotten up to one segment early, which shrinks as `SegmentsPerWindow` grows.

In ASP.NET Core the same limiters are wired through the rate-limiting middleware, keyed per client rather than globally. `PartitionedRateLimiter` is what turns one limit into one limit per key:

```csharp
builder.Services.AddRateLimiter(options =>
{
    options.AddPolicy("per-key", httpContext =>
        RateLimitPartition.GetSlidingWindowLimiter(
            partitionKey: httpContext.User.Identity?.Name ?? "anonymous",
            factory: _ => new SlidingWindowRateLimiterOptions
            {
                Window = TimeSpan.FromMinutes(1),
                SegmentsPerWindow = 6,
                PermitLimit = 100,
            }));

    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.OnRejected = async (context, token) =>
    {
        // Never reject without saying when to come back.
        if (context.Lease.TryGetMetadata(MetadataName.RetryAfter, out var after))
            context.HttpContext.Response.Headers.RetryAfter =
                ((int)after.TotalSeconds).ToString(CultureInfo.InvariantCulture);
        await context.HttpContext.Response.WriteAsync("rate limited", token);
    };
});

app.UseAuthentication();   // the key comes from User, so this has to run first
app.UseRateLimiter();
app.MapGet("/report", GetReport).RequireRateLimiting("per-key");
```

A key drawn from `User` needs `UseAuthentication` ahead of the limiter, and callers who are still anonymous there all share one bucket, so partition those by client IP or API key instead.

These limiters live in one process, so on several instances the configured number is a per-node number. For a limit that has to hold across the fleet, put the window in a shared store and evaluate it there. The exact form is a sorted set per key, scored by timestamp, trimmed and counted in one atomic script:

```lua
-- KEYS[1] the key, ARGV[1] now in ms, ARGV[2] window in ms, ARGV[3] the limit,
-- ARGV[4] a unique id for this request, so two arrivals in the same
-- millisecond are distinct members rather than one overwriting the other
redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, ARGV[1] - ARGV[2])
local used = redis.call('ZCARD', KEYS[1])
if used >= tonumber(ARGV[3]) then
  -- The oldest entry is what has to age out, so its expiry is the honest wait.
  local oldest = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
  return { 0, oldest[2] + ARGV[2] - ARGV[1] }
end
redis.call('ZADD', KEYS[1], ARGV[1], ARGV[1] .. ':' .. ARGV[4])
redis.call('PEXPIRE', KEYS[1], ARGV[2])
return { 1, 0 }
```

For shaping rather than counting, `TokenBucketRateLimiter` with a `QueueLimit` above zero behaves as a leaky bucket from the caller's side once the bucket is empty: requests wait for a permit instead of being refused, and the permits arrive at a fixed rate. Before that it is still a token bucket — a bucket that has been idle has saved up to `TokenLimit` tokens and spends them all at once — so to shape from the first request, keep `TokenLimit` no larger than `TokensPerPeriod` and there is no burst to spend. `System.Threading.Channels` with a bounded channel and a single reader that pulls on a `PeriodicTimer` is the same shape written by hand, and it is the one to reach for when the thing being smoothed is your own outbound traffic rather than somebody else's inbound.
