---
title: "Repository"
summary: "A repository gives the domain a collection-like door to persistence: the domain asks for entities by identity and never sees SQL, entities are equal by id, value objects are equal by content, and storage becomes a detail that lives at the edge."
category: ".NET data access"
tags: ["database"]
scene: repository
steps:
  - title: "Persistence leaking into the domain is a slow flood"
    text: "The ghost shows SQL fragments lodging inside the service — each query copied, each copy drifting, and nothing testable without a database. The repository is a door: the domain speaks in Find and Add, and everything about storage lives behind it."
  - title: "A repository looks like a collection and hides an engine"
    text: "The domain calls Find and Add as if talking to an in-memory set; the implementation translates to SQL behind the door. Swap that implementation for a fake and the domain never notices — which is exactly the test seam, and exactly the point."
  - title: "An entity is equal by identity, not by looks"
    text: "Two cards both say id 7 — different fields, same thing at two moments of its life. Two cards with identical fields but different ids are strangers. Identity is what the repository finds by, tracks by, and updates by; the attributes are just today's state."
  - title: "A value object is equal by content, and that is all it is"
    text: "Two 10 USD chips are the same money — no id, no history, no repository. You never modify one; you replace it with a new chip, and if the content is the same, it is the same money. Safe to share, trivial to test."
related:
  - label: Domain-Driven Design
    slug: domain-driven-design
  - label: Entity
    slug: entity
  - label: Value Object
    slug: value-object
  - label: Aggregate Root
    slug: aggregate-root
  - label: Aggregate
    slug: aggregate
  - label: Bounded Context
    slug: bounded-context
  - label: Unit of Work
    slug: unit-of-work
  - label: CQRS
    slug: command-query-responsibility-segregation
  - label: Hexagonal Architecture
    slug: hexagonal-architecture
  - label: N+1 Query
    slug: n-plus-1-query
  - label: Database Index
    slug: database-index
references:
  - title: "Design the infrastructure persistence layer"
    url: https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/infrastructure-persistence-layer-design
  - title: "Implement the infrastructure persistence layer with EF Core"
    url: https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/infrastructure-persistence-layer-implementation-entity-framework-core
  - title: "Testing EF Core applications"
    url: https://learn.microsoft.com/en-us/ef/core/testing/
---

## When to use

- When the domain has behaviour worth isolating from persistence. An aggregate that has to be loaded whole, checked against an invariant and saved whole is exactly the shape a repository is for: one method that hands you the object, one that accepts a new one, and nothing in the domain that knows where either came from. The interesting code then reads as sentences about the business rather than as sentences about a database.
- When the tests have to run without a database. This is the return that pays for the abstraction on its own. An interface the domain depends on can be satisfied by a dictionary in a test project, so the rule "an order cannot ship before payment clears" gets a test that runs in a millisecond and fails for exactly one reason. The alternative is a test suite that needs a server, a schema and a cleanup step to assert something that has nothing to do with any of the three.
- When the storage technology may change, or is already more than one thing. Reads served from a cache, writes going to SQL, a search index kept alongside: callers that hold the door handle do not care which of the three answered, and the day one of them is replaced the change stops at the implementation. A domain that talks to `DbContext` directly has that decision spread across every call site.
- When several call sites need the same load. `FindActiveByCustomer` written once behind the door is one query with one set of includes; the same load spelled out in six services is six queries that drift, and the sixth is the one that forgets an include and turns into an N+1.
- **Not** for every table, and not for CRUD screens. `DbSet<T>` already is a repository and `DbContext` already is a unit of work; wrapping them in `IProductRepository` that forwards six methods to six `DbSet` calls buys nothing but a file. When the screen is a form over a table and there is no invariant to protect, query the context, project to a DTO, and move on.

## Cautions

- EF Core's `DbSet` **is** the repository pattern and `DbContext` **is** the unit of work, so a repository on top of them has to justify itself with a domain reason: an aggregate boundary you want enforced, a seam you want tests to plug into, a query vocabulary you want written once. "The book said to" is not a reason, and the wrapper that only forwards is the most common way this pattern gets a bad name.
- Return aggregates, not `IQueryable`. An `IQueryable<Order>` handed back through the interface gives the caller the key to the door: they can compose any filter, any join and any projection, so the repository no longer controls what is loaded, when it is executed, or whether the connection is still open. If callers genuinely need arbitrary queries, that is a signal for a separate read path, not for a leakier interface.
- One repository per aggregate root, not per table. There is no `IOrderLineRepository`, because a line has no life outside the order that owns it — and if you write one, the invariant the root exists to protect can now be broken by somebody who never touched the root. The number of repositories in a system should be small and should match the number of things that are consistent as a unit.
- Screen queries do not belong here. The moment a repository grows `GetOrderSummariesForDashboard`, it has stopped being a domain collection and started being a view layer. Read models are allowed to skip the domain entirely: a Dapper query or a no-tracking projection straight to a DTO is faster, simpler, and does not drag an aggregate into a report.
- Async all the way, and take a `CancellationToken`. A repository is an I/O boundary, so every method on it is asynchronous by nature; a synchronous `Find` on top of an async provider is the shortest path to a thread-pool starvation incident that will be blamed on the database.
- The in-memory fake has to honour the same identity semantics, or the tests lie. If the real implementation returns the tracked instance for a second `Find` of the same id and the fake returns a fresh copy, a test that passes proves nothing about production. Keep one dictionary keyed by id inside the fake and return what is in it.
- Do not put `SaveChanges` inside every method. A repository that commits on each `Add` has quietly taken the transaction boundary away from the caller, and two writes that had to succeed together no longer can. Adding to the collection and committing the unit of work are two different decisions, and the second one belongs to whoever knows what the operation was.

## In .NET

The interface belongs to the domain project, which is what makes the dependency point the right way: the domain declares what it needs, and the edge supplies it.

```csharp
// Domain project. No EF Core reference anywhere in this assembly.
public interface IOrderRepository
{
    Task<Order?> FindAsync(OrderId id, CancellationToken ct);
    void Add(Order order);
    // No Update and no Save: the unit of work commits whatever the aggregate did.
}
```

The EF Core implementation lives at the edge, takes the `DbContext` by injection, and is the only place in the system that knows the word "SQL".

```csharp
public sealed class OrderRepository(ShopDbContext db) : IOrderRepository
{
    public Task<Order?> FindAsync(OrderId id, CancellationToken ct) =>
        db.Orders
          .Include(o => o.Lines)          // the aggregate is loaded whole
          .SingleOrDefaultAsync(o => o.Id == id, ct);

    public void Add(Order order) => db.Orders.Add(order);
}
```

`FindAsync` on the `DbSet` is worth knowing about: it checks the change tracker before it goes to the database, so asking twice for the same id inside one unit of work gives you the same instance rather than two objects that disagree. That behaviour is identity in action, and it is why the fake has to do the same thing.

Entities are equal by identity, so say so once on a base class and never write another `Equals`.

```csharp
public abstract class Entity<TId> where TId : notnull
{
    public TId Id { get; protected set; } = default!;

    public override bool Equals(object? other) =>
        other is Entity<TId> e && e.GetType() == GetType() && Id.Equals(e.Id);

    public override int GetHashCode() => Id.GetHashCode();
}
```

Value objects are equal by content and are never modified in place. A `record` gives you both for free: structural equality, and `with` that returns a new instance instead of mutating the one you are holding.

```csharp
public readonly record struct Money(decimal Amount, string Currency)
{
    public Money Add(Money other) =>
        other.Currency == Currency
            ? this with { Amount = Amount + other.Amount }   // a new value, not a change
            : throw new InvalidOperationException("mixed currencies");
}
```

EF Core stores a value object as columns on the owner's table with `ComplexProperty`, which is the modelling equivalent of "it has no identity and no repository of its own": there is no `Money` table and no way to load one on its own. `OwnsOne` looks like the same tool and is not — an owned type is still an entity, with its own key and its own tracked identity, and only a reference type can be one.

```csharp
protected override void OnModelCreating(ModelBuilder model)
{
    model.Entity<Order>(order =>
    {
        order.HasKey(o => o.Id);
        order.ComplexProperty(o => o.Total);   // Total_Amount, Total_Currency on Orders
        order.OwnsMany(o => o.Lines);          // lines have no life of their own
    });
}
```

The unit of work is the `DbContext`, so committing is a separate decision from adding, and the whole operation lands in one transaction.

```csharp
public async Task<OrderId> PlaceAsync(Cart cart, CancellationToken ct)
{
    var order = Order.From(cart);         // the domain decides, with no database in sight
    orders.Add(order);
    await db.SaveChangesAsync(ct);        // one transaction, one commit
    return order.Id;
}
```

The fake that makes the domain tests fast is a dictionary, and it earns its keep by returning the same instance for the same id.

```csharp
public sealed class InMemoryOrderRepository : IOrderRepository
{
    private readonly Dictionary<OrderId, Order> _orders = new();

    public Task<Order?> FindAsync(OrderId id, CancellationToken ct) =>
        Task.FromResult(_orders.GetValueOrDefault(id));

    public void Add(Order order) => _orders[order.Id] = order;
}
```

For the read side, skip all of it. A dashboard does not need an aggregate, so query the context directly and project straight into the shape the screen wants — no tracking, no includes, no domain objects created only to be flattened again.

```csharp
var summaries = await db.Orders
    .AsNoTracking()
    .Where(o => o.CustomerId == customerId)
    .Select(o => new OrderSummary(o.Id, o.PlacedAt, o.Total.Amount))
    .ToListAsync(ct);
```

That split is the whole design in one page: a small, boring interface for the writes that have rules, and a direct query for the reads that do not.
