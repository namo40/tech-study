---
title: "Domain-Driven Design"
summary: "Domain-driven design draws borders where the language changes: inside a bounded context one word means one thing, the aggregate root guards the invariants at the door, and contexts talk through translation instead of sharing a model."
category: "Application architecture"
tags: ["consistency"]
scene: domain-driven-design
steps:
  - title: "A model everyone shares is a model no one owns"
    text: "The ghost shows one Order object grown field by field until it serves sales and shipping at once, every change a negotiation. DDD starts with a confession: the business does not have one model. Draw borders where the language changes."
  - title: "Inside a bounded context, one word means one thing"
    text: "Sales' Order knows prices and totals; Shipping's Order knows addresses and item counts. Same word, two models, both small and both right, because each is defined by the questions its own context asks. The border is a promise about meaning."
  - title: "The aggregate root is the border's gatekeeper for consistency"
    text: "Order lines change only through the Order — the root checks the invariant (the total must match) on every change, so no writer can sneak past and break it. Outside references hold the root's id, never a line. One door, one guard, one always-true rule."
  - title: "Contexts talk by translation, not by sharing"
    text: "Sales publishes an event in its own words; Shipping hears it and builds its own Order from it. Neither imports the other's classes, so each model stays free to change. The map of contexts and translations IS the architecture — the code just agrees with it."
related:
  - label: Bounded Context
    slug: bounded-context
  - label: Aggregate Root
    slug: aggregate-root
  - label: Aggregate
    slug: aggregate
  - label: Anti-Corruption Layer
    slug: anti-corruption-layer
  - label: Event Sourcing
    slug: event-sourcing
  - label: CQRS
    slug: command-query-responsibility-segregation
  - label: Repository
    slug: repository
  - label: Entity
    slug: entity
  - label: Value Object
    slug: value-object
  - label: Hexagonal Architecture
    slug: hexagonal-architecture
  - label: Unit of Work
    slug: unit-of-work
  - label: Saga
    slug: saga
  - label: Transactional Outbox
    slug: transactional-outbox
references:
  - title: "Domain-Driven Design Reference"
    url: https://www.domainlanguage.com/ddd/reference/
  - title: "Design a DDD-oriented microservice"
    url: https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/ddd-oriented-microservice
  - title: "Using domain analysis to model microservices"
    url: https://learn.microsoft.com/en-us/azure/architecture/microservices/model/domain-analysis
  - title: "Designing a microservice domain model"
    url: https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/microservice-domain-model
---

## When to use

- When the domain has real business complexity and the language is contested. Commerce, logistics, billing, insurance, healthcare: places where "order", "customer" and "account" mean measurably different things to different departments, and where getting the difference wrong costs money rather than style points. If two people in a meeting can argue for ten minutes about what a word means, that word is a border waiting to be drawn.
- When several teams have to evolve the system independently. Context borders become team borders and, eventually, service borders — and they work in that order, not the other way round. A team that owns a context owns its model, its schema and its release cadence, and it can change all three without a cross-team migration, because nobody outside is holding its classes.
- When "just add a field to the shared model" has become the default move. That sentence is the sound of a model that belongs to nobody. Every field added for one department is a field the other four have to ignore, mis-set or defend against, and the object grows until no single person can say what it is for. The first step of the scene is that object.
- When the rules are interesting and worth protecting. If the interesting sentences in the domain sound like "the total must match the sum of the lines" or "a shipment cannot leave before the payment clears", you have invariants, and invariants want an owner. That owner is an aggregate root, and giving it a door is the cheapest correctness you will ever buy.
- **Not** for CRUD over tables. A form generator, an admin screen, a reference data editor: these have no contested language and no invariants worth naming. DDD's cost is real — the modelling conversations, the translation layers, the discipline about references — and a system with nothing to protect gets all of the cost and none of the return.

## Cautions

- Bounded contexts are about language, not deployment. A modular monolith with two contexts that never touch each other's tables honours the borders; a fleet of microservices sharing one `Entities.dll` violates them while looking modern. The question is never "how many services", it is "how many models, and who owns each one". Deployment topology can follow the map afterwards, and often it should not.
- The shared canonical model is the anti-pattern DDD exists to kill. It is proposed with the best intentions — one truth, no duplication, one place to change — and it delivers the opposite: a schema every team must agree to and nobody may simplify, with a change queue in front of it. Two models with a translation between them are cheaper than one model with five owners, and the duplication people fear is the price of independence, not a defect.
- Aggregates are consistency boundaries, not object graphs. Draw the boundary around exactly the data one rule needs to read in order to say yes or no, and no further. An `Order` that owns its lines is right when the rule is about the order's total; an `Order` that also owns the customer, their address book and their loyalty points takes a lock on the customer every time anybody buys anything. Reference other aggregates by id, and accept that consistency between them arrives a moment later.
- No invariant, no aggregate. If nothing has to be true across a group of entities at the end of every transaction, that group is not an aggregate and the root is ceremony. The invariant list is what defines the boundary; when you cannot write the list down, you have not found a boundary, you have found a folder.
- Put a translation layer at every border where another team's model comes in. An anti-corruption layer is a small, boring, deeply unfashionable class that turns their shape into yours, and it is the only thing standing between your model and somebody else's release schedule. Skipping it is how a foreign model quietly becomes your model.
- Ubiquitous language dies without maintenance. The glossary is not documentation, it is code review material: when the domain expert says "consignment" and the class says `Shipment`, one of the two is wrong and the cheap moment to find out is now. A language nobody corrects drifts back into four private dialects within a year, and the borders drawn from it stop matching anything.

## In .NET

An aggregate is a plain class. No base class, no framework, no attributes — private setters so nothing outside can assign, a private collection so nothing outside can add, and behaviour methods that are the only way in.

```csharp
public class Order
{
    private const int MaxLines = 500;
    private readonly List<OrderLine> _lines = new();

    public Guid Id { get; private set; } = Guid.NewGuid();
    public Guid CustomerId { get; private set; }          // an id, not a Customer
    public OrderStatus Status { get; private set; } = OrderStatus.Draft;
    public decimal Total { get; private set; }
    public Address ShipTo { get; private set; } = null!;  // a value object, set on creation
    public IReadOnlyCollection<OrderLine> Lines => _lines;

    // The one door. Everything the invariant depends on is inside this class,
    // so the check cannot be skipped by writing to a line directly.
    public void AddLine(string sku, int quantity, decimal price)
    {
        if (quantity <= 0) throw new DomainException("a line needs a quantity");
        _lines.Add(new OrderLine(sku, quantity, price));
        Total = _lines.Sum(l => l.Quantity * l.Price);
        CheckInvariants();
    }

    // The rules that have to hold at the end of every change, in one place.
    private void CheckInvariants()
    {
        if (Status != OrderStatus.Draft)
            throw new DomainException("a placed order cannot change its lines");
        if (_lines.Count > MaxLines)
            throw new DomainException($"an order may not have more than {MaxLines} lines");
    }
}
```

`order.AddLine(...)` rather than `order.Lines.Add(...)` is the whole design in one line: the second spelling is a write that went around the guard, and the type system refuses it because `Lines` is an `IReadOnlyCollection` over a private list.

EF Core persists that shape without leaking it. It discovers the private `_lines` field by convention and reads and writes it directly rather than going through the property, so the collection stays private with no configuration at all, and owned types let a value object be columns on the parent table rather than a table of its own.

```csharp
protected override void OnModelCreating(ModelBuilder model)
{
    model.Entity<Order>(order =>
    {
        order.OwnsMany(o => o.Lines);              // lines have no life of their own
        order.OwnsOne(o => o.ShipTo);              // a value object, not an entity
        order.Property(o => o.Total).HasPrecision(18, 2);
    });
}
```

The repository is per aggregate, never per table, and it returns the root. There is no `IOrderLineRepository`, because a line is not reachable except through the order that owns it.

```csharp
public interface IOrderRepository
{
    Task<Order?> FindAsync(Guid id, CancellationToken ct);
    void Add(Order order);
    // No Update: the unit of work commits whatever the aggregate did.
}
```

Domain events carry the translation across a border. The aggregate records them; nothing is published until the transaction commits, so a subscriber never hears about a change that was rolled back.

```csharp
public class Order
{
    private readonly List<IDomainEvent> _events = new();
    public IReadOnlyCollection<IDomainEvent> Events => _events;

    public void Place()
    {
        Status = OrderStatus.Placed;
        _events.Add(new OrderPlaced(Id, CustomerId, _lines.Count));
    }

    public void ClearEvents() => _events.Clear();
}

// One DbContext per context, and the events go out with the commit. `mediator`
// is injected into this context's constructor.
public override async Task<int> SaveChangesAsync(CancellationToken ct = default)
{
    var roots = ChangeTracker.Entries<Order>().Select(e => e.Entity).ToList();
    var events = roots.SelectMany(r => r.Events).ToList();
    var saved = await base.SaveChangesAsync(ct);
    foreach (var e in events) await mediator.Publish(e, ct);   // after the commit
    roots.ForEach(r => r.ClearEvents());                       // or the next save publishes them again
    return saved;
}
```

Publishing in process after the commit is at-most-once: if the process dies between the commit and the publish, the event is simply gone. That is acceptable for a subscriber inside the same deployable, which can be rebuilt from the data; anything that has to cross a service boundary goes through a transactional outbox written in the same transaction as the change.

Shipping subscribes to `OrderPlaced` and builds its own `Shipment` from the fields it cares about. It does not reference the Sales assembly and it does not deserialize a Sales class: the event is a contract of names and primitives, and the handler is the translation.

```csharp
public class OrderPlacedHandler : INotificationHandler<OrderPlaced>
{
    public Task Handle(OrderPlaced e, CancellationToken ct)
    {
        var shipment = Shipment.For(e.OrderId, e.LineCount);   // our word, our model
        return repository.AddAsync(shipment, ct);
    }
}
```

`INotificationHandler<T>` and `mediator.Publish` above are MediatR, and it is worth naming because the licence changed: version 13.0 and later are commercial, with a free community tier for small organisations, while earlier versions stay under their original open-source licence. Check which side of that line you are on before taking the dependency, or dispatch to your own `IDomainEventHandler<T>` from a handful of lines in the composition root and keep the concept without the package.

One `DbContext` per bounded context, one assembly per bounded context, and never a shared `Entities` project. When the two contexts eventually become two services, the only thing that changes is how the event gets from one to the other — which is the point of having drawn the border first.
