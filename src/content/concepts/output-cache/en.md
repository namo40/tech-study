---
title: "Output Cache"
summary: "Output caching stores whole responses in the server and replays them from middleware, so a hit never reaches the endpoint at all. It caches bytes rather than data, which makes its key space the request's varying axes and its default audience anonymous callers."
category: "Caching"
tags: ["memory"]
related:
  - label: Cache-Aside
    slug: cache-aside
  - label: Cache Tag
    slug: cache-tag
  - label: HybridCache
    slug: hybridcache
  - label: Cache Key
    slug: cache-key
  - label: TTL
    slug: ttl
  - label: Cache Invalidation
    slug: cache-invalidation
  - label: REST
    slug: rest
references:
  - title: Output caching middleware in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/performance/caching/output?view=aspnetcore-10.0
  - title: Caching overview in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/performance/caching/overview?view=aspnetcore-10.0
---

## When to use

- The endpoint's whole answer is the same for many callers. A public catalogue listing, a marketing page, a published article, an availability feed: the work is identical every time and the audience is anonymous, so the response is the natural unit to keep rather than the rows behind it.
- You want to skip everything, not just the query. This is the axis that separates it from cache-aside, which caches the data and still runs the routing, model binding, authorization, handler and serialization on every hit. Output caching answers from the middleware, so a hit costs a key lookup and a write to the socket, and the saving includes the serialization that is often larger than the query.
- The variants are countable. A response cache is only useful if the same key comes back, so the endpoint has to vary on a small, closed set of things: a page number, a sort order, a locale, a tenant. When the varying axes are known and few, the hit rate is high and the memory is bounded.
- Invalidation needs to be coarse and timely. A publish action that must retire everything it affected has no way to name the keys, and tagging the endpoint's responses gives it a single lever that reaches every variant produced. Cache Tag is the page for what a tag is and how wide to make one.

## Cautions

- Personalised responses are the failure that matters, and the defaults are protecting you. The middleware does not cache a request that carries authentication, and it does not cache a response that sets a cookie, precisely because one user's rendered page served to another is not a stale-data bug but a data leak. Overriding those conditions is possible and should be a decision with a name on it, backed by a vary key that actually contains the identity.
- Every vary axis multiplies the key space. Varying by two query parameters, a locale header and a route value is four dimensions whose product is the number of entries you may store, and an axis with unbounded values, an arbitrary query string, a client-supplied identifier, produces a cache that grows without ever hitting. Name the axes explicitly rather than varying by the whole query string.
- The default store lives in the process's memory. Ten instances behind a load balancer hold ten independent caches, so the first request to each instance misses, a deploy empties all of them at once, and an eviction on one is invisible to the other nine. That is often acceptable for short expirations and unacceptable for expensive responses, which is what the shared store exists for.
- It is not HTTP caching, and confusing the two produces surprises in both directions. Output caching is controlled by the server and ignores what the client asks for, while response caching middleware is the header-driven one that honours `Cache-Control` and can be defeated by any client that sends `no-cache`. If the goal is to keep a CDN and a browser from re-fetching, that is a headers conversation; if the goal is to stop your own server from doing the work twice, this is the one.

## In .NET

- Output caching is built into ASP.NET Core: `AddOutputCache` registers it, `UseOutputCache` puts it in the pipeline after `UseCors` and routing and before the endpoints, and an endpoint opts in with `CacheOutput()` or the `[OutputCache]` attribute. Nothing is cached until something opts in.

```csharp
builder.Services.AddOutputCache(options =>
{
    // Applies to every endpoint that opts in without naming a policy.
    options.AddBasePolicy(policy => policy.Expire(TimeSpan.FromSeconds(30)));

    // A named policy declares its own lifetime, its key space and its tag.
    options.AddPolicy("catalog", policy => policy
        .Expire(TimeSpan.FromMinutes(5))
        // The key varies on these and nothing else, so the space stays countable.
        .SetVaryByQuery("page", "sort")
        .Tag("catalog"));
});

var app = builder.Build();
app.UseOutputCache();

// Anonymous GETs only: authenticated requests are skipped by default.
app.MapGet("/catalog", (int page, string sort) => catalogue.Query(page, sort))
   .CacheOutput("catalog");
```

- Retiring a section is `IOutputCacheStore.EvictByTagAsync("catalog", ct)` from the admin action or the message handler that knows the content changed. Cache Tag covers what belongs in a tag and how much a single removal should be allowed to destroy; the only thing specific to this page is that the tag is declared on the policy rather than on the entry, because the entry is a response the middleware produced rather than an object you wrote.
- Registering a distributed store makes the cache shared. `AddStackExchangeRedisOutputCache` moves the entries out of process, so instances hit each other's fills and a deploy does not start cold, at the cost of a network hop and serialization on every hit.
- Expiration here is a plain TTL with no revalidation. There is no conditional request, no background refresh and no stampede protection, so a popular entry expiring under load sends every concurrent caller through the endpoint at once; keep the lifetime long enough that this is rare, and reach for HybridCache at the data layer when the expensive part deserves collapsing.
