---
title: "Correlation ID"
summary: "A correlation id is one value stamped on everything a single business flow touches — every log line, every message, every hop — so that one search returns the whole story in order. Tracing may be sampled away; the id in the logs is what always remains."
category: "Observability and operations"
scene: correlation-id
steps:
  - title: "Three services, one story, no thread"
    text: "Each request touches the web tier, the order service and the payment service, and each writes its own lines into the same stream, interleaved with everyone else's. Somewhere in there a payment failed. Whose?"
  - title: "Born at the edge, stamped on every line"
    text: "The first thing the system does is invent one id for the flow. From then on it is not prose — it is a named property on every structured log line, and two flows that interleave stop looking alike."
  - title: "The id rides the wire"
    text: "Between services it travels as a header; across the queue it travels as a message property, straight through the async gap where a request's context would end. The failing payment line arrives already carrying the thread."
  - title: "One filter, the whole story"
    text: "Search the id and every line it stamped reads top to bottom in order, failure in context. Tracing is sampled, so on a busy day this flow's trace may never have existed. The id in the logs is the floor that always holds."
related:
  - label: Distributed Tracing
    slug: distributed-tracing
  - label: Structured Logging
    slug: structured-logging
  - label: Sampling
    slug: sampling
  - label: Trace ID
    slug: trace-id
  - label: Trace
    slug: trace
  - label: Span
    slug: span
  - label: Context Propagation
    slug: context-propagation
  - label: Baggage
    slug: baggage
  - label: Message ID
    slug: message-id
  - label: Saga
    slug: saga
references:
  - title: "Logging in .NET"
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/logging/overview
  - title: "Logging in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/logging/
  - title: ".NET distributed tracing concepts"
    url: https://learn.microsoft.com/en-us/dotnet/core/diagnostics/distributed-tracing-concepts
  - title: "W3C Trace Context"
    url: https://www.w3.org/TR/trace-context/
---

## When to use

- Any flow that crosses more than one process. The moment two services write to two log streams, the only thing that can put their lines back in one order is a value they both carry.
- Any flow that crosses an async boundary. A queue, a background job, a scheduled retry: the request that started the work is long gone by the time the work runs, and the id is what survives the gap.
- On-call work. The id should be the first thing the person holding the pager types into the log search, which means it has to be in the alert, in the error response, and in the support ticket.
- Customer-facing failures. Handing a user a short id they can quote back turns "it broke this morning" into one query.
- Any flow you might want to reconstruct after the fact. Traces expire and are sampled; logs are usually kept longer and kept whole, so the id in the logs outlives the trace of the same request.

## Cautions

- Assign the id at the edge, in one place, before anything else runs. In ASP.NET Core that means registering the middleware ahead of authentication, so that a request which fails to authenticate still writes its lines under an id. An id minted halfway through covers half the story, and two components that each mint their own produce two half-stories that never meet.
- Accept an inbound id only from a caller you trust, and decide that by where the call came from rather than by who is making it. Behind your own gateway or a mesh sidecar with mTLS the header is worth taking; at a public edge nothing inbound is, because an authenticated customer is still an outsider, and because the middleware runs before `context.User` is populated anyway. A public endpoint that echoes whatever arrives in the header lets anyone poison your log search, or collide with somebody else's flow on purpose.
- A correlation id is not a trace id. The trace id belongs to one trace and dies with it; the correlation id belongs to the business flow and can outlive many traces, several retries and a night in a queue. Record both, and record the relationship between them rather than pretending one is the other.
- Log it as a structured property, never as prose inside the message. `"order {OrderId} failed for {CorrelationId}"` interpolated into a string is a value your log store cannot index, and searching for it becomes a substring scan over everything.
- Carry it explicitly into background work. `ILogger` scopes and `Activity` follow the async flow of one request, but a message handed to a queue starts a new one, so the id has to be written onto the message and read back off it.
- Keep the value opaque and printable, and keep the format compact rather than the value narrow. It is quoted in tickets, read down a phone line and pasted into search boxes, so thirty-two hex characters with no braces or hyphens beats a GUID in its `{...}` form — but truncating to eight of them is thirty-two bits, and a service handling a few hundred requests a second will collide inside one log-retention window.
- Never put anything meaningful inside it. An id that encodes a customer number is a personal identifier in every log line, every message header and every third party you call.

## In .NET

Two mechanisms do the work: middleware that decides what the id is, and a logging scope that makes every line inside the request carry it without any call site mentioning it.

```csharp
public sealed class CorrelationIdMiddleware(
    RequestDelegate next,
    ILogger<CorrelationIdMiddleware> logger,
    bool trustInboundHeader)          // true behind your own gateway, false at a public edge
{
    private const string Header = "X-Correlation-ID";

    public async Task InvokeAsync(HttpContext context)
    {
        var inbound = context.Request.Headers[Header].ToString();
        var accept = trustInboundHeader && !string.IsNullOrEmpty(inbound);

        // Full width: eight hex characters is 32 bits and collides within a retention window.
        var id = accept
            ? inbound
            : Activity.Current?.TraceId.ToString() ?? Guid.NewGuid().ToString("n");

        // What an untrusted caller sent is evidence, never the id.
        if (!accept && !string.IsNullOrEmpty(inbound))
        {
            Activity.Current?.SetTag("inbound.correlation.id", inbound);
        }

        context.Response.Headers[Header] = id;
        Baggage.SetBaggage("correlation.id", id);

        using (logger.BeginScope(new Dictionary<string, object> { ["CorrelationId"] = id }))
        {
            await next(context);
        }
    }
}
```

`BeginScope` with a dictionary is the part that matters. Every provider that understands structured logging attaches the scope's key-values to each line written inside it, so `CorrelationId` becomes a real column that a query can filter on, and no `ILogger` call anywhere in the request has to mention it. Passing a formatted string to `BeginScope` instead gives you a scope nothing can index, which is the commonest way to end up with an id you can see but not search.

The relationship with tracing is worth being deliberate about. `Activity.Current.TraceId` is a perfectly good source for the value, and deriving from it means a line in the logs and a span in the tracing backend can be lined up. It is still not the same identifier: the trace ends when the request ends, and the flow may run for another two hours across three retries. Log both `TraceId` and `CorrelationId` and the two views stay joinable without one having to stand in for the other. Putting the id in baggage so that downstream services can read it goes through OpenTelemetry's `Baggage.SetBaggage` rather than `Activity.AddBaggage`, because only the former is what the OpenTelemetry propagator writes onto the wire.

Across a queue, the id has to be written onto the message, because `Activity.Current` does not survive the hop. Azure Service Bus has a first-class place for it in `ServiceBusMessage.CorrelationId`, and `ApplicationProperties` takes anything else you want to carry; RabbitMQ has `IBasicProperties.CorrelationId` and a headers table. On the consumer side, read it back and open the same kind of scope before the handler runs, so the lines a worker writes at three in the morning land in the same search as the request that queued them.

```csharp
var message = new ServiceBusMessage(body) { CorrelationId = id };
message.ApplicationProperties["correlation.id"] = id;
```

Serilog, NLog and the OpenTelemetry logging exporter all read `ILogger` scopes, so the middleware above is provider-agnostic. What differs is enrichment: Serilog's `LogContext` can push the same property without an explicit scope, and `builder.Logging.AddOpenTelemetry(o => o.IncludeScopes = true)` — the logging builder, not the similarly named `builder.Services.AddOpenTelemetry()` — is what makes scope values reach an OTLP collector rather than being dropped on the way out.
