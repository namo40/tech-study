---
title: "Hexagonal Architecture"
summary: "Hexagonal architecture points every dependency inward: the domain sits in the middle knowing no outside name, ports are the contracts it speaks, adapters translate the world into those contracts — and because the contract is the boundary, the web, the database and the test harness become swappable details."
category: "Application architecture"
tags: ["ef-core"]
scene: hexagonal-architecture
steps:
  - title: "Without direction, the outside cracks the inside"
    text: "The ghost shows the domain wired straight to the database: a renamed column cracks the domain, and the crack runs on into the web layer. Nothing chose this — it is just what dependencies do when nobody points them. The whole architecture is one rule: every dependency points inward."
  - title: "The inside speaks only contracts"
    text: "A port is an interface the domain owns: requests come in through one, the domain's needs will go out through another — both in the domain's words, \"save this order\", never \"INSERT INTO\". No web, no SQL, no vendor name. That is the design."
  - title: "An adapter translates the world into the contract"
    text: "On one side it speaks HTTP or SQL; on the other, only the port. Swap the database adapter for an in-memory one and the domain never notices — which is why the test in this scene runs the real domain at full speed with no database at all. If you can swap it, it was a detail. The adapters are where all the details went."
  - title: "Same rule, different drawings"
    text: "The three names on the cards are three drawings of one rule: hexagonal, clean, onion — dependencies point inward, and the middle knows no outside name. Pick the drawing your team likes; keep the rule; spend the argument elsewhere."
related:
  - label: Domain-Driven Design
    slug: domain-driven-design
  - label: Repository
    slug: repository
  - label: Anti-Corruption Layer
    slug: anti-corruption-layer
  - label: Adapter
    slug: adapter
  - label: Clean Architecture
    slug: clean-architecture
  - label: Onion Architecture
    slug: onion-architecture
  - label: Dependency Injection
    slug: dependency-injection
  - label: Facade
    slug: facade
  - label: Entity
    slug: entity
  - label: Value Object
    slug: value-object
references:
  - title: "Hexagonal architecture"
    url: https://alistair.cockburn.us/hexagonal-architecture/
  - title: "Common web application architectures"
    url: https://learn.microsoft.com/en-us/dotnet/architecture/modern-web-apps-azure/common-web-application-architectures
  - title: "Architectural principles"
    url: https://learn.microsoft.com/en-us/dotnet/architecture/modern-web-apps-azure/architectural-principles
---

## When to use

- When the domain logic is worth protecting from infrastructure churn. Pricing rules, eligibility rules, settlement rules: sentences that were true before the current web framework existed and will be true after it is replaced. If the interesting part of the system would still be interesting written down on paper, it deserves to live somewhere that no ORM release note can reach.
- When you want to test the core without booting anything. A port plus a fake adapter is a test that exercises the real rules at the speed of a method call, with no database, no HTTP host and no container. The third step of the scene is exactly that trade: the same domain, a different thing plugged into the same socket, and an answer that arrives in a fraction of the time.
- When the same application faces several outsides at once. An HTTP endpoint, a queue consumer and a nightly scheduler that all have to do the same thing are three adapters over one port, not three copies of the logic with three different bugs in it. The moment a second way in appears, the shape pays for itself.
- When a detail swap is already on the roadmap. A database migration, a payment provider change, a move from a file share to blob storage: each of these is survivable if the vendor's name appears in exactly one class, and each is a rewrite if it appears in four hundred. Draw the port before the migration is scheduled, not during it.
- **Not** for CRUD-thin services. If the request is "write these fields to that table" and the domain has no rule to enforce, a port and an adapter add a hop, an interface and a mapping for no protection at all. A pass-through domain gains ceremony. Use the framework directly and spend the effort where there is something to defend.

## Cautions

- The rule is only as good as the port's language. An interface that returns `IQueryable<T>`, takes a `DbContext`, or hands back the vendor's exception type is wiring wearing an interface's clothes: the outside is still inside, it just has to be discovered by reading the type parameters. A port should be legible to somebody who has never heard of the storage engine.
- Keep the port owned by the inside. The interface is declared in the domain project and implemented in the infrastructure one, so the arrow points the way you want it. If the domain project references the infrastructure project in order to see the interface, the direction has quietly flipped and nothing in the build will complain.
- Adapters stay thin. Every decision that creeps into an adapter is a decision your fast tests no longer cover, because the fast tests run against the fake. Translation, mapping, retry policy and connection handling belong there; a business rule does not, and the tell is that you find yourself wanting to unit test the adapter.
- Do not multiply layers for their own sake. The value is in the direction of the dependencies, not the count of the rings. Four projects with one clear rule beat nine projects with a rule nobody can restate, and a layer that only forwards calls is a layer that will be skipped the first time somebody is in a hurry.
- Mapping at every boundary is the visible cost. Request model to command, command to domain object, domain object to persistence model, persistence model back again: that is real code, written by hand, that a direct-to-database design does not have. Pay it where the protection is real and refuse it where it is not. This is the honest reason CRUD services should not adopt the shape.
- The composition root is where all the arrows finally meet, and it is the one place allowed to know everything. Keep it small, keep it in the outermost project, and resist the temptation to reach for a service locator from inside the core: an inside that can ask a container for things has an outside dependency again, just an invisible one.

## In .NET

The shape is enforced by the project references before it is enforced by anything else. Three projects, and one rule: arrows point inward, and the domain has no project references at all.

```
Shop.Domain           <- no references. Entities, value objects, and the ports.
Shop.Infrastructure   -> Shop.Domain          (EF Core, HTTP clients, adapters)
Shop.Web              -> Shop.Domain, Shop.Infrastructure   (composition root)
```

The port lives in the domain and is written in the domain's words. It says what the domain needs, not how anybody provides it.

```csharp
namespace Shop.Domain;

// A port. It names an Order, not a table, and it throws nothing the caller
// would have to know a storage engine to catch.
public interface IOrderStore
{
    Task<Order?> FindAsync(OrderId id, CancellationToken ct);
    Task SaveAsync(Order order, CancellationToken ct);
}

public sealed class PlaceOrder(IOrderStore orders, IClock clock)
{
    public async Task<OrderId> HandleAsync(PlaceOrderCommand command, CancellationToken ct)
    {
        var order = Order.Place(command.CustomerId, command.Lines, clock.UtcNow);
        await orders.SaveAsync(order, ct);
        return order.Id;
    }
}
```

`IClock` is a port too, and one .NET already provides: `TimeProvider` is the built-in version of it, registered as `TimeProvider.System` and faked in tests with `FakeTimeProvider` from `Microsoft.Extensions.TimeProvider.Testing`. Hand-write the interface when the domain wants its own vocabulary for time, and take the built-in one when it does not.

The EF Core adapter is the same interface with a storage engine behind it. It is the only file in the solution that knows the table exists.

```csharp
namespace Shop.Infrastructure;

internal sealed class EfOrderStore(ShopDbContext db) : IOrderStore
{
    public async Task<Order?> FindAsync(OrderId id, CancellationToken ct) =>
        await db.Orders.Include(o => o.Lines).FirstOrDefaultAsync(o => o.Id == id, ct);

    public async Task SaveAsync(Order order, CancellationToken ct)
    {
        if (db.Entry(order).State == EntityState.Detached) db.Orders.Add(order);
        await db.SaveChangesAsync(ct);       // the only place SQL is ever spoken
    }
}

// The infrastructure project registers its own adapters, which is what lets the
// adapter stay internal: no other project has to be able to see its name.
public static class InfrastructureRegistration
{
    public static IServiceCollection AddInfrastructure(
        this IServiceCollection services, string connectionString)
    {
        services.AddDbContext<ShopDbContext>(o => o.UseNpgsql(connectionString));
        services.AddScoped<IOrderStore, EfOrderStore>();
        return services;
    }
}
```

The in-memory adapter is the same interface with a dictionary behind it, and it is what makes the core testable without infrastructure. This is the swap the third step of the scene performs.

```csharp
public sealed class InMemoryOrderStore : IOrderStore
{
    private readonly Dictionary<OrderId, Order> _saved = new();

    public Task<Order?> FindAsync(OrderId id, CancellationToken ct) =>
        Task.FromResult(_saved.GetValueOrDefault(id));

    public Task SaveAsync(Order order, CancellationToken ct)
    {
        _saved[order.Id] = order;
        return Task.CompletedTask;
    }
}
```

The composition root is the only place that names both sides — though what it names on the outside is the infrastructure project rather than the adapter class, which is how `EfOrderStore` gets to stay `internal`. Everything above it was written against an interface; this is where the interface is finally given a body.

```csharp
// Program.cs, in Shop.Web
builder.Services.AddInfrastructure(connectionString);      // the driven adapters
builder.Services.AddSingleton<IClock, SystemClock>();
builder.Services.AddScoped<PlaceOrder>();

// The driving adapter: HTTP in, port call out, and nothing else.
app.MapPost("/orders", async (PlaceOrderRequest body, PlaceOrder handler, CancellationToken ct) =>
{
    var id = await handler.HandleAsync(body.ToCommand(), ct);
    return Results.Created($"/orders/{id.Value}", new { id = id.Value });
});
```

Tests then come in two sizes, and the cheap size is the one you write hundreds of. A core test drives the real handler through the port with the fake adapter behind it, and touches nothing else.

```csharp
[Fact]
public async Task placing_an_order_stores_it()
{
    var store = new InMemoryOrderStore();
    var clock = new FixedClock(DateTimeOffset.Parse("2026-03-03T09:00:00Z"));
    var id = await new PlaceOrder(store, clock).HandleAsync(command, default);

    Assert.NotNull(await store.FindAsync(id, default));
}
```

The other size boots the real host through `WebApplicationFactory` and replaces only the adapters you do not want in a test, which works because replacing an adapter is a one-line registration change rather than a change to anything the domain can see.

```csharp
public sealed class Harness : WebApplicationFactory<Program>
{
    protected override void ConfigureWebHost(IWebHostBuilder builder) =>
        builder.ConfigureServices(services =>
        {
            services.RemoveAll<IOrderStore>();
            services.AddSingleton<IOrderStore, InMemoryOrderStore>();
        });
}
```

If that last swap is a one-liner, the direction is right. If it turns into a morning of untangling, something inside is holding a name it should never have known.
