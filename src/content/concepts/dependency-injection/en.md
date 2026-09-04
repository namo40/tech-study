---
title: "Dependency Injection"
summary: "Dependency injection separates asking from making: classes declare what they need, one container knows how to build everything, and each request gets a graph assembled to order — with every instance's lifetime (singleton, scoped, transient) decided by registration, not by whoever called new first."
category: ".NET runtime and hosting"
tags: ["ef-core"]
scene: dependency-injection
steps:
  - title: "new wires your design by hand"
    text: "The ghost shows each class building its own dependencies — and those building theirs, wiring choices deep into the graph. Swap one implementation and the lit-up spots are every place you must touch; try to test one class and its whole tree comes along. The fix is one separation: classes declare needs; one place does the making."
  - title: "The container assembles the graph to order"
    text: "Registrations map contracts to implementations; when a request arrives, the container walks the constructor chain and builds what each piece declares it needs. No class knows what the others are made of. Swapping an implementation is now one registration line — the graph reassembles itself, and tests hand in fakes the same way."
  - title: "Lifetime is decided at registration"
    text: "Run two requests and count the boxes: the singleton serves both from one instance, scoped makes one per request, transient makes one per injection. Same classes, three growth curves — chosen where the type is registered, not where it is used. Most lifetime bugs are just a mismatch between those two places."
  - title: "The container has a life of its own"
    text: "It is built once — in a real host before the first request; here the lamp lights late so you can watch the registrations close. Every scope closes taking its instances with it, disposing in reverse order of creation, and so does shutdown."
related:
  - label: Hexagonal Architecture
    slug: hexagonal-architecture
  - label: Adapter
    slug: adapter
  - label: Clean Architecture
    slug: clean-architecture
  - label: Middleware Pipeline
    slug: middleware-pipeline
  - label: IHostedService
    slug: ihostedservice
  - label: Background Service
    slug: background-service
  - label: DbContext
    slug: dbcontext
  - label: Unit of Work
    slug: unit-of-work
  - label: Application Lifetime
    slug: application-lifetime
  - label: Graceful Shutdown
    slug: graceful-shutdown
references:
  - title: Dependency injection in .NET
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/dependency-injection/overview
  - title: Dependency injection guidelines
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/dependency-injection/guidelines
  - title: Dependency injection in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/dependency-injection
---

## When to use

- It is the default in ASP.NET Core, so the useful question is not whether to use it but what you get from it. The framework already builds your controllers, minimal API handlers, filters and hosted services out of the container, which means constructor injection costs you nothing extra and anything else is swimming against the framework. Declare what a class needs in its constructor and stop thinking about where it comes from.
- Reach for a registration whenever the same contract has more than one honest implementation. A real mail sender in production and a recording fake in tests, a live clock and a fixed one, a cloud blob store locally replaced by a folder: the class under test is unchanged and the difference is one line in the composition root. This is the everyday payoff, and it is why testability and swappability are the same property seen from two angles.
- Use it to compose cross-cutting behaviour rather than inheriting it. A decorator that wraps a handler in retries, a typed `HttpClient` with its handler chain, a pipeline of validators resolved as `IEnumerable<IValidator<T>>`: all of these are registration-time arrangements, and none of them require the class being decorated to know it has been.
- Let configuration arrive the same way through the options pattern. `IOptions<T>` and its snapshot and monitor variants are configuration expressed as an injected dependency, which keeps a class from reading the configuration system directly and makes its settings as easy to substitute in a test as anything else it depends on.
- The container is worth its keep the moment a graph is more than two levels deep. For a small console tool with three classes, wiring them by hand in `Main` is a legitimate composition root and nobody needs a container to do it. What a container buys you is that the third level does not change when the fourth appears.

## Cautions

- The captive dependency is the mistake this page exists to warn you about. Inject a scoped service into a singleton and the singleton captures the first instance it was handed and keeps it for the life of the process. `DbContext` is the classic victim: it is registered scoped for a reason, it is not thread safe, and a singleton holding one turns a per-request unit of work into a shared object with an ever-growing change tracker, stale entities and cross-request corruption. The rule is that a dependency may never outlive the thing that holds it.
- Scope validation catches that for you, but only when it is on. The built-in container validates scopes in the Development environment by default and not in Production, so a captive dependency introduced by a code path you never exercised locally will ship. Turn `ValidateScopes` and `ValidateOnBuild` on explicitly for the environment your tests run in, and the failure moves from a subtle production bug to a startup exception in CI.
- When a singleton genuinely needs a scoped service, inject `IServiceScopeFactory` and open a scope per unit of work. This is the shipped practice for background code and it is exactly what a hosted service does per iteration, which is the picture the Background Service page draws from the applied side. Create the scope, resolve inside it, do the work, dispose the scope. Never hold the resolved instance beyond it.
- Injecting `IServiceProvider` and calling `GetService` inside a class puts the wiring back where you took it from. The dependency is now invisible in the constructor, the compiler cannot tell you it is missing, and the test has to build a container instead of passing an object. Use the provider only where the framework hands it to you and you genuinely cannot know the type until run time; everywhere else, ask for the thing itself.
- Registering an interface for every class because a pattern says so is ceremony. An interface with exactly one implementation, no second implementation in sight and no test that fakes it is a file you maintain for nothing. Register the concrete type; introducing the interface later is a small, mechanical change, and doing it early costs you a layer of indirection in every stack trace.
- Disposal follows ownership, and it runs in reverse order of creation. The container disposes what it created, the scope disposes what the scope created, and anything you built yourself with `new` and handed to a registration is yours to dispose. A transient `IDisposable` resolved from the root provider is captured by the root and released only at shutdown, which looks exactly like a leak because it is one.
- Async disposal needs an async scope. A service implementing `IAsyncDisposable` resolved inside a scope you disposed synchronously will either throw or fall back to a blocking dispose, so use `await using` on the scope and `DisposeAsync` on the provider. This is easy to get wrong in a background loop, where the scope is created by hand rather than by the framework.
- The lifetime table is short enough to memorise, and most bugs are one row of it. A transient inside a singleton is legal but frozen: you get one instance for the life of the process regardless of what the registration says. A scoped inside a singleton is a bug. A singleton inside anything is fine. A scoped inside a scoped is fine, because they share a scope. Anything else is a question about which scope you are actually in.

## In .NET

Registration is three methods and the difference between them is only how long the thing they make lives:

```csharp
// One instance for the whole application. It must be thread safe, and it must
// not hold anything shorter lived than itself.
builder.Services.AddSingleton<IClock, SystemClock>();

// One instance per scope, which for a web application means per request.
builder.Services.AddScoped<IOrderRepository, OrderRepository>();
builder.Services.AddDbContext<ShopContext>(options => options.UseSqlServer(cs));

// A new instance every time it is injected. Cheap, stateless, never shared.
builder.Services.AddTransient<IPriceCalculator, PriceCalculator>();
```

Nothing asks for these by name. A class declares its needs in its constructor and the container fills them in:

```csharp
public sealed class CheckoutService(
    IOrderRepository orders,
    IPriceCalculator prices,
    IClock clock)
{
    public async Task<Receipt> PlaceAsync(Cart cart, CancellationToken token) =>
        await orders.SaveAsync(prices.Total(cart), clock.UtcNow, token);
}
```

Turn the validation on, in every environment where a build failure is cheaper than a production one:

```csharp
builder.Host.UseDefaultServiceProvider((context, options) =>
{
    // Catches a scoped service captured by a singleton, and catches it at
    // startup rather than on the first request that happens to hit it.
    options.ValidateScopes = true;
    options.ValidateOnBuild = true;
});
```

When a singleton needs something scoped, it opens a scope of its own rather than holding one:

```csharp
public sealed class OutboxPump(IServiceScopeFactory scopeFactory)
{
    public async Task PumpAsync(CancellationToken token)
    {
        // One scope per iteration. The DbContext lives and dies inside it,
        // exactly as it would inside a request.
        await using var scope = scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<ShopContext>();
        await db.DispatchPendingAsync(token);
    }
}
```

The rest is the host. `IHostApplicationLifetime` gives you the started, stopping and stopped events; `builder.Services.Configure<T>` and `IOptions<T>` make configuration an injected dependency like any other; and `IHost.StopAsync` stops the hosted services, after which disposing the host — which `Run` does for you — disposes the container and everything it is still holding, in reverse order of creation. The application's lifetime is the container's lifetime, and everything else lives inside one of its scopes.
