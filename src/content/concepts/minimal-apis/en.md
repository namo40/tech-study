---
title: "Minimal APIs"
summary: "Minimal APIs are ASP.NET Core's low-ceremony endpoint model: a route and a handler are joined in one call, there is no controller class in between, and the endpoint you read is the code that runs."
category: ".NET runtime and hosting"
related:
  - label: Controllers
    slug: controllers
  - label: Kestrel
    slug: kestrel
  - label: Endpoint Routing
    slug: endpoint-routing
  - label: Middleware Pipeline
    slug: middleware-pipeline
  - label: REST
    slug: rest
  - label: Dependency Injection
    slug: dependency-injection
references:
  - title: ASP.NET Core APIs overview
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/apis?view=aspnetcore-10.0
  - title: Minimal APIs quick reference
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/minimal-apis?view=aspnetcore-10.0
---

## When to use

- Make it the default for a small service or a microservice, where the ceremony would outweigh the surface. A handful of endpoints written as `MapGet` and `MapPost` calls fit on one screen, and a reader following a route to its behaviour lands on the lambda that answers it rather than on a class name, an attribute and a base type they have to resolve first.
- Use `MapGroup` to give a resource one place to live. A group carries a route prefix and the metadata, authorisation policies and filters that apply to everything under it, so `/orders` and its sub-routes share a declaration instead of repeating an attribute on each action.
- Reach for endpoint filters when a cross-cutting concern belongs to some endpoints rather than to the whole application. Validation, tenant resolution and audit logging run inside the routed endpoint, after model binding, which is exactly where middleware cannot see the bound arguments and a global filter would run for routes that do not need it.
- Choose it for workloads where startup time and trimming matter. The model works with Native AOT and the request-delegate generator, which is what makes a container that starts in tens of milliseconds realistic; the reflection-heavy binding of a controller action is the part that stands in the way there.

## Cautions

- Nothing stops `Program.cs` from growing into a thousand-line file, and nothing in the framework will stop it for you. The discipline is ours: one extension method per resource, a `MapGroup` inside it, and a single `app.MapOrders()` in startup. Teams that skip that step usually rediscover controllers a year later, having paid for the lesson twice.
- Some conventions you may be used to are not there by default. The automatic `400` that `[ApiController]` produces from a failed model validation is a controller behaviour, so validation on a minimal endpoint is something you call, add through a filter, or take from the built-in validation support you opt into. Check which conventions your team relies on before assuming they carry over.
- Endpoint filters are their own mechanism, not MVC filters. `IEndpointFilter` runs inside the routed endpoint with the bound arguments in `EndpointFilterInvocationContext`, and action filters, resource filters and their ordering rules belong to the controller pipeline. Samples and packages written for one do not apply to the other.
- When the surface is large and convention-heavy, controllers is the honest choice. Both models sit on the same routing and the same host, so the decision is about how many endpoints there are and how much convention you want doing the work, not about which style is modern. Mixing both in one application is supported and is often the right answer for a service that grew.

## In .NET

- Groups plus filters keep the routing table readable: the group owns the prefix and the shared concerns, the extension method owns the resource, and `Program.cs` stays a list of what the application exposes.

```csharp
// OrderEndpoints.cs - one file per resource, one method to map it.
public static class OrderEndpoints
{
    public static RouteGroupBuilder MapOrders(this IEndpointRouteBuilder app)
    {
        // Everything on the group applies to every endpoint added below it.
        var group = app.MapGroup("/orders")
            .RequireAuthorization()
            .WithTags("Orders");

        group.MapGet("/{id:guid}", (Guid id, IOrderStore store, CancellationToken ct) =>
            store.FindAsync(id, ct));

        // Which is why the validation filter goes on the endpoint that has
        // something to validate: on the group it would also run for the GET,
        // where there is no OrderInput argument to find.
        group.MapPost("/", (OrderInput input, IOrderStore store, CancellationToken ct) =>
                store.CreateAsync(input, ct))
            .AddEndpointFilter<ValidationFilter<OrderInput>>();

        return group;
    }
}

public sealed class ValidationFilter<T> : IEndpointFilter where T : class
{
    public async ValueTask<object?> InvokeAsync(
        EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        // Filters see the bound arguments; middleware runs before binding and cannot.
        if (context.Arguments.OfType<T>().FirstOrDefault() is not { } model)
            return Results.BadRequest();

        return Validate(model) is { Count: > 0 } errors
            ? Results.ValidationProblem(errors)
            : await next(context);
    }
}

// Program.cs stays a table of contents.
app.MapOrders();
```

- Handler parameters are resolved the same way everywhere. Route values, the query string, the body and services from the container are bound by type and name, so a handler taking `Guid id` and `IOrderStore store` needs no attribute, and `[FromKeyedServices]` or an explicit `[FromBody]` is there for the cases where the convention guesses wrong.
- `AddOpenApi` and `MapOpenApi` build the document from what you already declared. Route patterns, parameter types and `TypedResults` return types feed the generated schema directly, and `WithTags`, `WithName` and `Produces` on a group are how you fill the gaps without writing the document by hand.
- The filter pipeline nests. Filters added to a group run around filters added to an individual endpoint, both run inside the routed endpoint, and all of them run after the middleware pipeline has already decided this request belongs here.
