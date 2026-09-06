---
title: "DbContext Pool"
summary: "AddDbContextPool applies borrow-and-return to DbContext instances instead of connections. It is a second pool sitting above the connection pool and saving a different cost, the per-instance setup of a context, and its price is that a pooled context must carry no state of its own."
category: "Pools and resources"
tags: ["ef-core", "database"]
level: 4
scene: database-connection-pool
sceneStep: 2
related:
  - label: Database Connection Pool
    slug: database-connection-pool
  - label: Entity Framework Core
    slug: entity-framework-core
  - label: ADO.NET Connection Pooling
    slug: ado-net-connection-pooling
  - label: Compiled Query
    slug: compiled-query
  - label: Object Pool
    slug: object-pool
references:
  - title: Advanced Performance Topics
    url: https://learn.microsoft.com/en-us/ef/core/performance/advanced-performance-topics
---

Borrow something expensive to make, use it, hand it back: that discipline is the whole of the scene's second step, and the thing being borrowed there is an open connection. `AddDbContextPool` applies the same discipline to a different object: the `DbContext` instance itself. It is a second pool, standing above the connection pool rather than replacing it, and the first thing to be clear about is that the two save different costs. The connection pool saves the handshake, the TLS negotiation and the login, which is the whole of the scene. The context pool saves the construction of a context object, and it does that whether or not any connection is involved, because a context borrows a connection from the pool underneath only while it is actually executing something. Enabling one does not change the other, and a service that expected fewer logins from turning context pooling on has confused the two layers.

```csharp
builder.Services.AddDbContextPool<OrdersContext>(
    options => options.UseSqlServer(connectionString),
    poolSize: 128);   // contexts held, not connections
```

What the saving actually consists of is modest and worth measuring rather than assuming. Creating a `DbContext` means resolving its options, wiring up its internal service provider, and allocating the change tracker and the state that goes with it. The model, which is the genuinely expensive artefact, is already cached across every context in the application and is not built per instance, so what pooling avoids is the per-instance remainder. That remainder is small in absolute terms and shows up as a real percentage only where the work around it is also small: EF's own benchmark for a single-row lookup against a local server moves from about 700 µs to about 350 µs, so on high-throughput endpoints running one short query it is worth roughly a factor of two, which is the kind of path where a compiled query is worth having for the same reason. On a request that does anything substantial the setup is noise, and the pool earns nothing while still imposing its constraints.

Those constraints are the substance of the feature. When a pooled context is disposed it is not destroyed; EF Core resets it, clearing the change tracker and returning it to a state fit for the next caller, and then puts it back. What the reset covers is EF's own state, and what it does not cover is anything you added, which is why the rule is that a pooled context must have nothing of its own to carry. A pooled context type is required to have a constructor taking only `DbContextOptions`, and that restriction is the feature telling you the truth rather than an implementation limit: there is no per-request anything to inject, because the instance will outlive the request. EF clears its own events and change tracker on the way back, but a tenant id captured in a field, a user identity read at construction, a mutable property set by one request, or anything you did to the underlying `DbConnection` is yours to reset, and the resulting bug is a silent cross-request leak rather than an error. Where per-request state is genuinely needed, the documented pattern keeps the pooling: register `AddPooledDbContextFactory`, then a scoped factory of your own that rents a context from it and sets the tenant on the way out. `IDbContextFactory` or plain `AddDbContext` is what is left when even that will not do.

Two practical notes finish it. The pool has a size, and exceeding it is not a failure: beyond `poolSize` instances the provider simply creates contexts normally and discards them on dispose, so the setting is a cap on how much is held rather than a limit on concurrency, and the symptom of an undersized pool is that the benefit quietly stops rather than that anything breaks. And the general shape of this is nothing EF-specific, being the same rent-and-return an object pool applies to any object whose construction costs more than its reset; it is worth adopting for the same reason and with the same caution, which is that a pooled object must be clean when it comes back.
