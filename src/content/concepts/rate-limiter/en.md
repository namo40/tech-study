---
title: "Rate Limiter"
summary: "A rate limiter caps how many requests a caller may make in a window of time. A token bucket is the usual way to do it: tokens drip in at a steady rate, each request spends one, and an empty bucket means the request is rejected."
category: "Resilience"
tags: ["overload"]
level: 3
scene: rate-limiter
steps:
  - title: "Token bucket"
    text: "Tokens drip in at a steady rate. Each request takes one token and goes through, so the bucket stays nearly full."
  - title: "Bursts"
    text: "A full bucket absorbs a burst up to its size. Once it is empty, further requests are rejected with 429 instead of slowing everyone down."
  - title: "Retry-After"
    text: "A 429 carries a hint of when to come back. A client that honours it comes back after the refill — and gets through."
  - title: "Partitioned"
    text: "Limits are keyed by client, tenant, or endpoint, so one noisy caller empties only its own bucket while everyone else keeps their tokens."
related:
  - label: Token Bucket
    slug: token-bucket
  - label: Leaky Bucket
    slug: leaky-bucket
  - label: Fixed Window
    slug: fixed-window
  - label: Sliding Window
    slug: sliding-window
  - label: Concurrency Limiter
    slug: concurrency-limiter
  - label: Throttling
    slug: throttling
  - label: Quota
    slug: quota
  - label: Load Shedding
    slug: load-shedding
  - label: Retry
    slug: retry
  - label: Circuit Breaker
    slug: circuit-breaker
references:
  - title: Rate limiting middleware in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/performance/rate-limit?view=aspnetcore-10.0
  - title: Rate Limiting pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/rate-limiting-pattern
  - title: System.Threading.RateLimiting
    url: https://learn.microsoft.com/en-us/dotnet/api/system.threading.ratelimiting
---

## When to use

- A public or shared API where one caller can crowd out the others.
- You need a hard ceiling per client, tenant, or endpoint, not just overall capacity.
- Bursts are normal and should be allowed up to a known size.

## Cautions

- Per-instance limits multiply with the instance count. For a global limit the bucket has to live in a shared store such as Redis.
- Always send `Retry-After` on a 429. Without it, rejected clients retry immediately and make things worse.
- A rate limit and a concurrency limit are different. One caps requests per time window, the other caps requests in flight, and most services need both.
- Choose the key deliberately. Limiting by IP punishes everyone behind a NAT, while limiting by API key or user is usually fairer.

## In .NET

Use the ASP.NET Core rate limiting middleware.

```csharp
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.OnRejected = (context, _) =>
    {
        if (context.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retryAfter))
            context.HttpContext.Response.Headers.RetryAfter =
                ((int)retryAfter.TotalSeconds).ToString();
        return ValueTask.CompletedTask;
    };
    options.AddPolicy("per-client", httpContext =>
        RateLimitPartition.GetTokenBucketLimiter(
            partitionKey: httpContext.User.Identity?.Name ?? "anonymous",
            factory: _ => new TokenBucketRateLimiterOptions
            {
                TokenLimit = 20,
                TokensPerPeriod = 10,
                ReplenishmentPeriod = TimeSpan.FromSeconds(1),
                QueueLimit = 0,
                AutoReplenishment = true,
            }));
});

var app = builder.Build();
app.UseAuthentication();   // without this, User is empty and every caller shares one bucket
app.UseRateLimiter();
app.MapGet("/orders", () => Results.Ok())
   .RequireRateLimiting("per-client");
```

A key drawn from `User` only exists once authentication has run, so `UseRateLimiter` goes after `UseAuthentication` — and after `UseRouting` in apps that call it explicitly, because the policy is attached per endpoint. Callers who are still anonymous at that point all share the `"anonymous"` bucket, so partition them by something they do have, such as the client IP or an API key.

`System.Threading.RateLimiting` provides fixed window, sliding window, token bucket, and concurrency limiters. Across several instances the limit belongs in front of them or in shared state, so reach for an API gateway or a Redis-based limiter rather than a per-process one.
