---
title: "Idempotency Key"
summary: "An Idempotency-Key lets a client retry a request that changes something without changing it twice: the server remembers the key, does the work once, and replays the same response for every repeat."
category: "APIs and real-time communication"
tags: ["duplicates"]
scene: idempotency-key
steps:
  - title: "A retry without a key"
    text: "The payment went through, but the response was lost, so the client tries again. The server cannot tell a retry from a new order. Charged twice."
  - title: "Remember the key"
    text: "The client sends the same key on every retry. The server stores the key with the outcome the first time, and on the retry replays that response without touching the payment again."
  - title: "Two at once"
    text: "A double click sends the same key twice. The first claims the key; the second either waits for the result or gets 409 and can ask again. Either way, one charge per key."
  - title: "Scope and lifetime"
    text: "A key belongs to one client and one request body; the same key with a different body is rejected. Keys expire, so the store stays small and an old key can be reused as a new request."
related:
  - label: Idempotency
    slug: idempotency
  - label: Deduplication
    slug: deduplication
  - label: Unique Constraint
    slug: unique-constraint
  - label: Retry
    slug: retry
  - label: Message ID
    slug: message-id
  - label: Idempotent Consumer
    slug: idempotent-consumer
  - label: REST
    slug: rest
  - label: Optimistic Concurrency
    slug: optimistic-concurrency
references:
  - title: The Idempotency-Key HTTP Header Field (IETF draft)
    url: https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/
  - title: RESTful web API design
    url: https://learn.microsoft.com/en-us/azure/architecture/best-practices/api-design
  - title: Stripe idempotent requests
    url: https://docs.stripe.com/api/idempotent_requests
---

## When to use

- Any POST that creates something or moves money: payments, orders, messages, provisioning.
- Any client that retries on a timeout or a lost response, which is every client.
- Anywhere a person can send the same intent twice by double clicking a button or reloading a page after it seemed to hang.

## Cautions

- Scope the key to the authenticated client. A global key space lets one client replay another's request by guessing a key.
- Store a fingerprint of the request with the key and reject a different body under the same key. Without it, a key is a way to have the wrong response replayed to you.
- Claim the key atomically before doing the work — a unique constraint or a conditional insert — or two concurrent requests both pass the check and both proceed.
- Give keys a time to live long enough to cover realistic retries, hours to a day, and document it. Too short and a late retry charges again; forever and the store never stops growing.
- Decide what a failed first attempt leaves behind. If the work throws after the key is claimed, release the claim or store the failure, or every retry gets a 409 until the key expires.
- Prefer designs that are naturally safe to repeat: `PUT` with an id the client chose, or a unique business constraint such as one order per cart. A key is what you reach for when the operation cannot be made safe on its own.

## In .NET

The header is checked in one place, in front of the endpoints that need it, and the key is claimed before the work starts rather than after it finishes.

```csharp
public sealed class IdempotencyFilter(IIdempotencyStore store) : IEndpointFilter
{
    public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        var http = context.HttpContext;
        if (!http.Request.Headers.TryGetValue("Idempotency-Key", out var key))
            return Results.BadRequest(new { error = "Idempotency-Key header is required" });

        var client = http.User.FindFirstValue("sub") ?? "anonymous";

        // The fingerprint has to read the body, and the endpoint still has to bind it.
        http.Request.EnableBuffering();
        var fingerprint = await RequestFingerprint.ComputeAsync(http.Request);
        http.Request.Body.Position = 0;

        // Claim the key atomically: unique (client, key) row. Returns the existing row on conflict.
        var claim = await store.TryClaimAsync(client, key!, fingerprint, TimeSpan.FromHours(24), http.RequestAborted);
        switch (claim.State)
        {
            case ClaimState.Done:       return Results.Json(claim.Response, statusCode: claim.StatusCode); // replay
            case ClaimState.InProgress: return Results.StatusCode(StatusCodes.Status409Conflict);
            case ClaimState.Mismatch:   return Results.UnprocessableEntity(new { error = "Key reused with a different request" });
        }

        try
        {
            var result = await next(context);                   // first time: do the work
            // CompleteAsync runs the result to capture its body and status code, and stores both.
            await store.CompleteAsync(client, key!, result, http.RequestAborted);
            return result;
        }
        catch
        {
            // Nothing was recorded, so let go of the key instead of leaving it InProgress.
            await store.ReleaseAsync(client, key!, http.RequestAborted);
            throw;
        }
    }
}

app.MapPost("/payments", CreatePayment).AddEndpointFilter<IdempotencyFilter>();
```

`TryClaimAsync` is where the guarantee lives, so it has to be one atomic operation: an `INSERT` into a table with a unique constraint on `(client, key)` that returns the existing row on conflict, or a Redis `SET NX` with the expiry set in the same call. It stores the fingerprint with the key, because the same key with a different body is a bug in the caller rather than a retry, and computing that fingerprint means reading the request body — so buffering has to be enabled and the stream rewound, or the endpoint has nothing left to bind. `CompleteAsync` is the other half: an `IResult` on its own is neither a body nor a status code, so it has to execute the result and store the bytes and the code that were actually sent, because a replay has to be indistinguishable from the original answer.
