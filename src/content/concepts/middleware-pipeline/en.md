---
title: "Middleware Pipeline"
summary: "The middleware pipeline is a chain of components that each see the request on the way in and the response on the way out, in reverse order. Any of them can stop the chain, and their order is the design of the application's edge."
category: ".NET runtime and hosting"
scene: middleware-pipeline
steps:
  - title: "In, then out"
    text: "A request passes down through every middleware, reaches the endpoint, and the response climbs back through the same ones in reverse. Each middleware wraps everything below it."
  - title: "Short-circuit"
    text: "A middleware can answer without calling the next one: 401 from authentication, or a file straight from static files. Everything below it never runs."
  - title: "Exceptions climb"
    text: "An exception thrown at the endpoint travels back up through every middleware. Only the outermost one can turn it into a proper 500, so the exception handler goes first."
  - title: "Order is the design"
    text: "The same middleware in a different order is a different application. Exception handler first, cheap protections before expensive work, authentication before authorization, endpoint last."
related:
  - label: Endpoint Routing
    slug: endpoint-routing
  - label: Minimal APIs
    slug: minimal-apis
  - label: Controllers
    slug: controllers
  - label: Kestrel
    slug: kestrel
  - label: Rate Limiter
    slug: rate-limiter
  - label: Authentication
    slug: authentication
  - label: Authorization
    slug: authorization
  - label: CORS
    slug: cors
  - label: Application Lifetime
    slug: application-lifetime
references:
  - title: ASP.NET Core middleware
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/middleware/?view=aspnetcore-10.0
  - title: Write custom ASP.NET Core middleware
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/middleware/write?view=aspnetcore-10.0
  - title: ASP.NET Core APIs overview
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/apis?view=aspnetcore-10.0
---

## When to use

- Anything that has to see every request or every response: error handling, HTTPS redirection, static files, routing, CORS, authentication, authorization, rate limiting, compression, logging.
- Cross-cutting concerns that should not be repeated inside every endpoint.

## Cautions

- Order is not cosmetic. `UseExceptionHandler` first, `UseStaticFiles` before `UseRouting`, `UseRouting` before anything that needs to know which endpoint was chosen, `UseAuthentication` before `UseAuthorization`, and endpoints last.
- A middleware that forgets to call `next` short-circuits silently. Make that decision deliberate.
- Do not write to the response body before calling `next` and then expect later middleware to change headers. By then the headers are already on the wire.
- Keep per-request work in middleware cheap. It runs for every request, including the ones a middleware further down will reject anyway.

## In .NET

```csharp
var app = builder.Build();

app.UseExceptionHandler();
app.UseHttpsRedirection();
app.UseStaticFiles();
app.UseRouting();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

// A middleware sees the request on the way in and the response on the way out.
app.Use(async (context, next) =>
{
    var started = Stopwatch.GetTimestamp();
    await next(context);                       // everything below runs here
    var elapsed = Stopwatch.GetElapsedTime(started);
    context.Response.Headers["X-Elapsed-Ms"] = elapsed.TotalMilliseconds.ToString("F0");
});

app.MapGet("/orders/{id:int}", (int id) => Results.Ok(new { id }))
   .RequireAuthorization()
   .RequireRateLimiting("per-client");

app.Run();
```

`Map` branches the pipeline by path, `Run` is a terminal middleware that always ends the chain, and endpoint filters registered with `AddEndpointFilter` are a lighter alternative that runs after routing has already chosen the endpoint.
