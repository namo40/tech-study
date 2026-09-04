---
title: "CQRS"
summary: "CQRS separates the model that changes data from the model that answers questions about it: commands go through the rules, and queries read a shape built for the screen. Split the stores only when reads and writes need to scale apart, and accept the lag that comes with it."
category: "Application architecture"
tags: ["consistency"]
scene: command-query-responsibility-segregation
steps:
  - title: "One model for everything"
    text: "Writes that must obey rules and reads that need three joins share one code path and one database. The slow reads hold the tier for over a second each, so three requests — two of them commands — stand outside a full box and come back late."
  - title: "Split the code, not the data yet"
    text: "Commands run the rules and return an id, not a screenful of data. Queries return a row already shaped for the screen, read from a view. Still one database, but neither side waits on the other any more, and both meters stay low."
  - title: "Separate stores"
    text: "Writes land in one store, and a projection copies each change into a read store built for queries. Reads scale on their own now. A read that arrives before the projection does still sees the old row, and is marked stale rather than pretending to be right."
  - title: "The read model is disposable"
    text: "Change its shape, rebuild it from the write side, point the queries back at it. While it is empty the queries take the slow way round through the write store. CQRS does not require event sourcing; reach for the split only when reads and writes truly differ."
related:
  - label: Read Model
    slug: read-model
  - label: Projection
    slug: projection
  - label: Event Sourcing
    slug: event-sourcing
  - label: Domain-Driven Design
    slug: domain-driven-design
  - label: Aggregate
    slug: aggregate
  - label: Eventual Consistency
    slug: eventual-consistency
  - label: Materialized View
    slug: materialized-view
  - label: Transactional Outbox
    slug: transactional-outbox
  - label: Vertical Slice Architecture
    slug: vertical-slice-architecture
references:
  - title: CQRS pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/cqrs
  - title: Event Sourcing pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/event-sourcing
  - title: Apply simplified CQRS and DDD patterns in a microservice
    url: https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/apply-simplified-microservice-cqrs-ddd-patterns
---

## When to use

- Reads and writes have different shapes: rich domain rules on the write side, flat screen-shaped rows on the read side.
- Reads outnumber writes by a wide margin, or need indexes and denormalisation that the write model should not have to carry.
- You can tolerate a read that lags a write by however long the projection takes.

## Cautions

- Start with split handlers over one database. That alone buys most of the clarity, and it costs nothing in consistency. Split the stores only when measurement says the reads need to scale on their own.
- Separate stores mean eventual consistency, so design the screen for it: show the command's own result, poll for the new one, or subscribe to it. A command that returns the id and version of what it just wrote is not a violation of the pattern — what CQRS rules out is a command handing back data shaped for a screen. What you must not do is read the query side straight after a write and treat the answer as authoritative.
- Projections need monitoring and a rebuild path. Lag is the metric that says whether the read side is keeping up, and a read model you cannot throw away and build again is a liability rather than an asset.
- A projection handler will see the same change more than once. Key it on the row it is updating and make it safe to apply twice, so a replay is a no-op rather than a double count.
- CQRS and event sourcing are independent. Either one works without the other, and adopting the second because you adopted the first is how a small refactor turns into a rewrite.

## In .NET

```csharp
public interface ICommandHandler<in TCommand, TResult> { Task<TResult> HandleAsync(TCommand command, CancellationToken ct); }
public interface IQueryHandler<in TQuery, TResult> { Task<TResult> HandleAsync(TQuery query, CancellationToken ct); }

// Write side: rules, then persist. It hands back the id of what it wrote, and
// nothing the screen would render.
public sealed class PlaceOrderHandler(ShopDbContext db) : ICommandHandler<PlaceOrder, Guid>
{
    public async Task<Guid> HandleAsync(PlaceOrder command, CancellationToken ct)
    {
        var order = Order.Place(command.CustomerId, command.Lines);   // domain rules live here
        db.Orders.Add(order);
        await db.SaveChangesAsync(ct);
        return order.Id;
    }
}

// Read side: a flat row from a view or read table, no tracking, no domain objects.
public sealed class OrderSummaryHandler(ShopDbContext db) : IQueryHandler<GetOrderSummary, OrderSummary?>
{
    public Task<OrderSummary?> HandleAsync(GetOrderSummary query, CancellationToken ct) =>
        db.OrderSummaries.AsNoTracking()
          .Where(s => s.OrderId == query.OrderId)
          .Select(s => new OrderSummary(s.OrderId, s.CustomerName, s.Total, s.Status))
          .SingleOrDefaultAsync(ct);
}
```

Two handler interfaces and one query that projects straight into a DTO with `Select` are the whole of the first step. The write side keeps change tracking, aggregates and validation; the read side never loads a domain object at all, because a projection into a DTO leaves no entity to track. The `AsNoTracking()` above costs nothing and is worth the habit, but it is the switch that matters only for read queries that do return entity types.

Once the stores are separate, a `BackgroundService` projector reads the outbox or the event stream and writes the read store. Have it publish the age of the change it just applied as a metric, so lag is a number you can alert on rather than a guess, and give it a command that replays from the beginning, so changing the shape of a read model is a deployment rather than a migration.
