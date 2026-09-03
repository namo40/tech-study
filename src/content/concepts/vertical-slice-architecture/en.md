---
title: "Vertical Slice Architecture"
summary: "Vertical slice architecture groups code by feature rather than by technical layer: everything one request needs lives in one folder. It changes the axis the code is organized on, so coupling is trapped inside a feature instead of running along a layer that every feature shares."
category: "Application architecture"
related:
  - label: CQRS
    slug: command-query-responsibility-segregation
  - label: Hexagonal Architecture
    slug: hexagonal-architecture
  - label: Clean Architecture
    slug: clean-architecture
  - label: Onion Architecture
    slug: onion-architecture
  - label: Minimal APIs
    slug: minimal-apis
  - label: Middleware Pipeline
    slug: middleware-pipeline
references:
  - title: "Vertical Slice Architecture"
    url: https://www.jimmybogard.com/vertical-slice-architecture/
  - title: "Common web application architectures"
    url: https://learn.microsoft.com/en-us/dotnet/architecture/modern-web-apps-azure/common-web-application-architectures
---

## When to use

- When adding one small feature means editing four files in four projects. A controller, a service interface, an implementation, a repository method and a DTO, all for a field that appears in one screen, is a sign that the organizing axis is working against the change you keep making. Slices put those pieces next to each other, so the diff for a feature is one folder and the review question becomes "does this feature make sense" instead of "which of these five files changed why".
- When your handlers already look like requests and responses. A CQRS-shaped codebase, where each command and query is its own type with its own handler, is most of the way to slices already: give each of those handlers its own folder with the request, the validation, the persistence it uses and the endpoint that exposes it, and the slice is the unit that ships. The pairing is natural because both patterns start from the same observation, that reads and writes want different shapes.
- When features deserve different amounts of structure. A lookup that projects three columns onto a response can be a query written straight against the context, while the slice that prices an order can carry a domain model, ports and adapters, and every abstraction it needs — inside that slice only. Applying the structure where the complexity is, rather than uniformly, is the practical benefit that pays for the change of axis.

## Cautions

- Duplication between slices is the default, and reaching for a shared abstraction early is the more expensive mistake. Two slices that map a customer to slightly different responses are not a missing helper; they are two features that happen to look alike this week and will diverge under the next requirement. A common rule of thumb is to wait for the third repetition and to promote what is genuinely a domain rule rather than what merely looks similar, because the coupling a premature helper creates is exactly the coupling slices exist to avoid.
- Cross-cutting concerns belong in the pipeline, not copied into each slice. Validation, authorization, logging, transactions and idempotency are the same job for every request, and a middleware or a handler decorator applies them once for all slices. Leaving them inside each handler is how you get thirty slices that each forgot a different one.
- When several slices write the same table in their own way, the domain rules have scattered. That is the signal that a real domain model is owed — not for the whole application, but for that data — and that the slices should go through it. Watch for the rule that has to hold no matter which endpoint was called; if you can only enforce it by remembering to repeat it, it does not live in the right place yet.
- This is a change of organizing axis, not a verdict on layered architecture. Layers are still there inside a slice wherever the slice needs them, and the boundaries that clean and onion architectures draw are still worth drawing around a complex feature. What changes is that the layering is scoped to the feature that needs it, so a simple feature does not pay for the structure a complicated one required.

## In .NET

- A slice is a folder, and everything the request touches goes in it. Minimal APIs make the endpoint part of that folder rather than a separate controller, so the route, the request type, the handler and the response live together and a feature can be deleted by deleting a directory.

```text
Features/
  Orders/
    PlaceOrder/          PlaceOrder.cs        request, handler, endpoint
                         PlaceOrderTests.cs
    GetOrderSummary/     GetOrderSummary.cs   query written straight against the context
  Billing/
    IssueRefund/         IssueRefund.cs
                         RefundPolicy.cs      domain rules this slice actually needs
Shared/
  Persistence/           the DbContext, migrations
  Pipeline/              validation, authorization, transaction behaviours
```

- Group the routes rather than scattering them. A route group per area gives the slices a shared prefix, shared authorization and shared filters, and each slice contributes its own endpoint to that group through a small registration method the host calls, which keeps the host free of one line per feature forever.
- Cross-cutting work goes in the middleware pipeline or, if you dispatch requests through a mediator, in a behaviour that wraps every handler. Validation that runs before the handler, a transaction that opens around it and an audit record written after it are all written once and apply to slices that have not been written yet.
- Test at the slice boundary. A test that posts the request and asserts on the response and the stored state exercises the feature the way it is used, and it stays valid when the inside of the slice is rewritten, which is exactly the freedom the organization was meant to buy.
