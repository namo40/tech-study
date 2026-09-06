---
title: "Controllers"
summary: "Controllers are ASP.NET Core's class-based API model: actions grouped on a type, attribute routing on top of the same endpoint routing, and a filter pipeline where authentication, validation and error handling become layers rather than repeated code."
category: ".NET runtime and hosting"
level: 3
related:
  - label: Minimal APIs
    slug: minimal-apis
  - label: Endpoint Routing
    slug: endpoint-routing
  - label: Middleware Pipeline
    slug: middleware-pipeline
  - label: REST
    slug: rest
  - label: Dependency Injection
    slug: dependency-injection
references:
  - title: Create web APIs with ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/web-api/?view=aspnetcore-10.0
---

## When to use

- Take it when the surface is large enough that convention starts paying for itself. At dozens of actions across many resources, a class per resource with attribute routing gives every endpoint the same shape, and a new team member can guess where something lives from the URL alone. That guessability is the product convention sells, and it is worth more the more endpoints there are.
- Use it when authentication, validation, auditing and exception handling should be layers rather than lines repeated in each handler. Authorization filters, action filters, result filters and exception filters run in a defined order around the action, apply globally or per controller or per action, and are ordinary classes you can unit test.
- Rely on `[ApiController]` when you want the API conventions turned on as a set. Attribute routing becomes required, parameter binding infers its sources rather than needing attributes, and a request whose model fails validation is answered with `400` before your action body ever runs.
- Choose it when the team already thinks in MVC. Existing filters, model binders, conventions and a decade of familiarity are real assets, and a large surface written the way the team already reads is a better outcome than a novel style nobody navigates confidently.

## Cautions

- There is per-action machinery, and on a hot path it is measurable. Action selection, model binding, filter invocation and result execution all cost something per request, and for a very small service under heavy load minimal APIs avoid that layer entirely. For an ordinary API dominated by database and network time, the difference is noise.
- A controller with forty actions is just a large class with routing attributes. The usual remedies apply: split by resource rather than by verb, push logic into services the actions call, and treat the controller as a thin translation between HTTP and the domain. Growth is what makes controllers useful and what makes them unreadable, depending on whether anybody splits them.
- The automatic `400` is convenient and is not the whole error story. `[ApiController]` turns an invalid `ModelState` into a `ValidationProblemDetails` response before the action runs, which is a narrower promise than a uniform error format: making every failure, including unhandled exceptions and bare status codes, come back as `application/problem+json` takes `AddProblemDetails` and exception handling configured on top.
- The choice between the two models is about surface size and how much convention you want, not ideology. Both are built on the same endpoint routing, run through the same middleware pipeline, and are hosted by the same server, so an application can map minimal endpoints for a webhook and use controllers for the main API without any contradiction.

## In .NET

- `[ApiController]` plus attribute routing is the standard shape; the automatic validation response is the convention doing work the action would otherwise repeat.

```csharp
[ApiController]
[Route("api/[controller]")]                 // -> /api/orders
public class OrdersController(IOrderStore store) : ControllerBase
{
    // ActionResult<T> keeps both the payload type and the status codes visible,
    // which is also what OpenAPI generation reads. A CancellationToken
    // parameter binds to HttpContext.RequestAborted.
    [HttpGet("{id:guid}")]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<Order>> Get(Guid id, CancellationToken ct) =>
        await store.FindAsync(id, ct) is { } order ? Ok(order) : NotFound();

    // With [ApiController], an invalid model is answered 400 with
    // ValidationProblemDetails before this body runs. Checking ModelState
    // here would be dead code.
    [HttpPost]
    public async Task<ActionResult<Order>> Create(OrderInput input, CancellationToken ct)
    {
        var created = await store.CreateAsync(input, ct);
        return CreatedAtAction(nameof(Get), new { id = created.Id }, created);
    }
}
```

- Filters are registered where their scope is. `builder.Services.AddControllers(o => o.Filters.Add<AuditFilter>())` applies one to every action, an attribute on the class narrows it to a controller, and `[ServiceFilter]` resolves a filter from the container so it can take dependencies.
- `AddProblemDetails` is what unifies the rest of the failures. Registered once, status-code-only responses and unhandled exceptions come back in the same `application/problem+json` shape as the automatic validation response, so clients parse one error format instead of three.
- Controllers and minimal endpoints coexist in one application. `app.MapControllers()` and `app.MapGroup("/hooks")` add to the same routing table, and the middleware pipeline in front of them does not know or care which model produced an endpoint.
