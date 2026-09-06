---
title: "REST"
summary: "REST is a set of constraints for using HTTP as the contract itself: resources have addresses, the standard methods carry the meaning of what you are doing to them, and status codes, cache headers and content negotiation are part of the API rather than plumbing under it."
category: "APIs and real-time communication"
level: 3
related:
  - label: gRPC
    slug: grpc
  - label: Idempotency Key
    slug: idempotency-key
  - label: Idempotency
    slug: idempotency
  - label: Pagination
    slug: pagination
  - label: CORS
    slug: cors
  - label: API Gateway
    slug: api-gateway
  - label: Minimal APIs
    slug: minimal-apis
  - label: Controllers
    slug: controllers
references:
  - title: "RFC 9110: HTTP Semantics"
    url: https://www.rfc-editor.org/rfc/rfc9110.html
  - title: RESTful web API design
    url: https://learn.microsoft.com/en-us/azure/architecture/best-practices/api-design
---

## When to use

- Make it the default for any API that crosses a team or organisational boundary. Every consumer already has an HTTP client, every proxy, gateway and browser already understands the methods and the status codes, and the caching and conditional-request machinery is there whether or not you use it. Choosing something else is a decision that needs a reason; choosing REST does not.
- Use it when the domain really is a set of things you can name. Orders, invoices, users and their sub-collections have obvious addresses, and once `/orders/4417` is a URL, "fetch it", "replace it", "delete it" and "list the ones like it" are already specified by the protocol rather than by your documentation.
- Take it when browsers and third parties will call you directly. A REST endpoint is reachable from `fetch`, from `curl`, from a spreadsheet and from a partner's integration platform with nothing generated and nothing installed, which is a real property of the interface and not merely a convenience during development.
- Lean on the intermediaries when reads dominate. A cacheable `GET` with `ETag` and `Cache-Control` lets a CDN, a reverse proxy and the client's own cache answer on your behalf, and a `304 Not Modified` costs a header exchange rather than a rendered response. That leverage exists only if the API actually uses the semantics.

## Cautions

- Method semantics are the contract, and getting them wrong misleads every layer between you and the caller. `GET` is safe: it must not change anything, because browsers, crawlers and prefetchers will call it on their own. `PUT` and `DELETE` must be written so that sending the same request again leaves the resource in the same state as sending it once, which is what makes a client's retry after a timeout harmless. `POST` carries neither promise, and that is exactly why the retry story for it needs an Idempotency-Key.
- REST is not "JSON over HTTP", and an API that only sends JSON bodies over `POST` gets none of the benefits. The value is in the parts teams skip: meaningful status codes so a client can tell a validation failure from an outage, conditional requests so concurrent writers do not overwrite each other, cache headers so the intermediaries can help, and content negotiation so a second representation is not a second endpoint.
- Decide the versioning strategy before the first external consumer, not after. A URL segment, a media type parameter or a header are all defensible, and the expensive mistake is having no answer when a field has to change shape. Pair it with a rule about what is additive and therefore safe, and the expand-then-contract sequence used for schema changes applies to an API surface just as directly.
- Do not force an action into a resource just to keep the style pure. Some operations are genuinely verbs: recalculate, reconcile, send, retry. Modelling those as a bag of nouns produces endpoints nobody can name and a contract nobody can guess. A `POST` to an action-shaped path is a fine answer, and if the whole surface looks like that, the honest conclusion is that this interface wanted gRPC or a message instead.

## In .NET

- Minimal APIs express resource routing compactly, and the results helpers keep the status codes explicit rather than incidental.

```csharp
var orders = app.MapGroup("/orders");

// The route is the resource, the method is the verb, and the return type is
// the full set of answers this endpoint can give.
orders.MapGet("/{id:guid}", async (Guid id, IOrderStore store) =>
    await store.FindAsync(id) is { } order
        ? Results.Ok(order)
        : Results.NotFound());

// PUT replaces at a client-chosen address: sending it twice leaves the same
// resource behind, so a client that timed out can simply send it again.
orders.MapPut("/{id:guid}", async (Guid id, OrderInput input, IOrderStore store) =>
{
    if (input.Total < 0)
    {
        // A machine-readable failure, not a string. Content type is
        // application/problem+json, which clients can branch on.
        return Results.Problem(
            title: "Total must not be negative",
            statusCode: StatusCodes.Status400BadRequest);
    }

    var created = await store.UpsertAsync(id, input);
    return created ? Results.Created($"/orders/{id}", input) : Results.NoContent();
});
```

- `AddProblemDetails` plus `UseExceptionHandler()` and `UseStatusCodePages()` make the error shape uniform. The registration supplies the service; the two middleware are what turn unhandled exceptions and status-code-only responses into `application/problem+json` with the same fields, so clients get one failure format instead of three that grew separately. Leave them out and an unhandled exception leaves production as an empty 500.
- OpenAPI generation belongs in the project from the first endpoint. `AddOpenApi` and `MapOpenApi` publish the document from the routes and types you already declared, which turns the contract into something consumers can generate clients from rather than a wiki page that drifts.
- Two neighbours shape a public REST surface more than the framework does. The gateway in front of it owns authentication, rate limiting and versioned routing, and CORS decides which browser origins may call it at all: a REST API that browsers cannot reach is usually a missing policy rather than a missing endpoint.
