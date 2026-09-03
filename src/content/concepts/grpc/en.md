---
title: "gRPC"
summary: "gRPC is an RPC framework where a protobuf file is the contract: it generates the client and the server from the same definition, serializes to a compact binary form, and runs over HTTP/2 so that unary calls and streams share one connection."
category: "APIs and real-time communication"
tags: ["latency"]
related:
  - label: REST
    slug: rest
  - label: HTTP/2
    slug: http-2
  - label: Multiplexing
    slug: multiplexing
  - label: Streaming
    slug: streaming
  - label: API Gateway
    slug: api-gateway
  - label: Load Balancer
    slug: load-balancer
  - label: Idempotency-Key
    slug: idempotency-key
references:
  - title: gRPC Documentation
    url: https://grpc.io/docs/
  - title: Overview for gRPC on .NET
    url: https://learn.microsoft.com/en-us/aspnet/core/grpc/
---

## When to use

- Reach for it on internal service-to-service calls where both ends are yours. The `.proto` file is the single artefact both sides build from, so the client stub and the server base class cannot drift from each other the way a hand-written HTTP client drifts from the handler it calls. The compiler catches a renamed field at build time rather than at three in the morning.
- Use it when the call shape is not one request and one response. gRPC has four: unary, server streaming, client streaming and bidirectional streaming, all of them ordinary methods with an `IAsyncEnumerable` or a stream reader on one side. A progress feed, a long upload and a chat-shaped exchange are method signatures here rather than a second protocol bolted alongside the first.
- Take it when several languages have to agree on one contract. A protobuf definition generates idiomatic code for C#, Go, Java, Python and the rest from the same file, which makes the contract a shared repository artefact instead of a document that each team re-implements slightly differently.
- Prefer it on internal hot paths where JSON over HTTP/1.1 costs more than it should. Binary encoding is smaller than the equivalent JSON and faster to parse, HTTP/2 removes the per-call connection setup, and a long-lived channel amortises TLS. On a chatty path measured in millions of calls a day, that difference is a capacity decision rather than a micro-optimisation.

## Cautions

- A browser cannot call a gRPC service directly. Browser JavaScript has no API that gives the frame-level control gRPC needs, so the public edge needs gRPC-Web with a translating proxy, or JSON transcoding that exposes the same service as a REST-shaped HTTP API. Plan which one before the first public client, because retrofitting the edge is more work than choosing it.
- Field numbers are the compatibility contract, not field names. The wire format carries the number, so renaming a field is safe and reusing a retired number is a silent data corruption: old peers will decode new bytes into the old meaning. Mark removed numbers `reserved`, never recycle them, and treat the `.proto` file with the same care as a database migration.
- Load balancing has to happen per call, not per connection. gRPC holds one long-lived HTTP/2 connection and sends every call over it, so a layer-4 balancer that distributes connections pins all of a client's traffic to whichever backend it first landed on, and a newly scaled-out replica receives nothing. The fix is balancing that understands calls: a layer-7 proxy, a service mesh sidecar, or client-side load balancing with a resolver that knows the backend set.
- The error model is its own, and it does not map cleanly onto HTTP status codes. A call fails with a `StatusCode` from gRPC's own enumeration, and the interesting distinctions are there rather than in the transport: `DEADLINE_EXCEEDED` and `UNAVAILABLE` are the retryable pair, `FAILED_PRECONDITION` and `ABORTED` differ in exactly whether a retry can help. Client code that switches on HTTP codes is reading the wrong layer.

## In .NET

- The service is an ASP.NET Core endpoint and the client comes from the factory. `Grpc.AspNetCore` generates the base class from the `.proto` file, and `AddGrpcClient` gives the channel the same lifetime management `IHttpClientFactory` gives an `HttpClient`.

```csharp
// Server: the generated base class is the contract, the override is the code.
public class OrdersService : Orders.OrdersBase
{
    public override async Task<OrderReply> Get(OrderRequest request, ServerCallContext context)
    {
        // The caller's deadline arrives as the cancellation token. Passing it on
        // is what makes an abandoned call stop costing work downstream.
        var order = await repository.GetAsync(request.Id, context.CancellationToken);
        return new OrderReply { Id = order.Id, Status = order.Status };
    }
}

// Client: one channel per address, reused, with a deadline on every call.
builder.Services.AddGrpcClient<Orders.OrdersClient>(o =>
    o.Address = new Uri("https://orders.internal"));

var reply = await client.GetAsync(
    new OrderRequest { Id = id },
    deadline: DateTime.UtcNow.AddSeconds(2));
```

- Set a deadline on every call and propagate the one you were given. gRPC deadlines are absolute times that travel with the call, so a service that passes `context.CancellationToken` into its own downstream calls lets a caller's timeout cancel the whole chain instead of leaving orphaned work running behind an answer nobody is waiting for.
- `GrpcChannel` is expensive and meant to be shared. It owns the HTTP/2 connection, every call on it is a stream, and creating one per call throws away the connection reuse that the transport chapter of this design was for.
- The server runs on Kestrel over HTTP/2, which is a deployment constraint worth stating out loud. TLS with ALPN handles it by default; a cleartext endpoint needs `HttpProtocols.Http2` set explicitly, and any proxy in the path must speak HTTP/2 end to end rather than downgrading a hop.
