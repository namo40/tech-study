---
title: "Idempotency-Key"
summary: "Idempotency-Key는 무언가를 바꾸는 요청을 두 번 바꾸지 않고 다시 보낼 수 있게 해 주는 헤더입니다. 서버는 키를 기억해 두고 작업은 한 번만 하며, 같은 키로 다시 오는 요청에는 저장해 둔 응답을 그대로 돌려줍니다."
category: "API와 실시간 통신"
scene: idempotency-key
steps:
  - title: "키 없는 재시도"
    text: "결제는 됐지만 응답이 유실되어 클라이언트가 다시 보냅니다. 서버는 재시도와 새 주문을 구분할 수 없습니다. 두 번 결제됩니다."
  - title: "키를 기억합니다"
    text: "클라이언트는 재시도마다 같은 키를 보냅니다. 서버는 처음에 키와 결과를 저장해 두고, 재시도에는 결제를 건드리지 않고 그 응답을 그대로 돌려줍니다."
  - title: "동시에 둘"
    text: "더블 클릭이 같은 키를 두 번 보냅니다. 먼저 온 쪽이 키를 차지하고, 둘째는 결과를 기다리거나 409를 받고 다시 묻습니다. 어느 쪽이든 결제는 한 번입니다."
  - title: "범위와 수명"
    text: "키는 클라이언트 하나와 요청 본문 하나에 속합니다. 같은 키에 다른 본문은 거부됩니다. 키는 만료되므로 저장소는 작게 유지되고, 오래된 키는 새 요청으로 다시 쓸 수 있습니다."
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

## 언제 쓰나

- 무언가를 만들거나 돈을 옮기는 POST마다. 결제, 주문, 메시지 발송, 자원 생성이 모두 해당합니다.
- 타임아웃이나 유실된 응답에 재시도하는 클라이언트마다. 그러니까 사실상 모든 클라이언트입니다.
- 버튼을 두 번 누르거나, 멈춘 것처럼 보이는 화면을 새로고침해서 같은 의도를 두 번 보낼 수 있는 곳이라면 어디든.

## 주의점

- 키의 범위를 인증된 클라이언트 단위로 좁힙니다. 키 공간이 전역이면 한 클라이언트가 키를 찍어 맞혀 다른 클라이언트의 요청을 다시 재생시킬 수 있습니다.
- 요청의 지문을 키와 함께 저장하고, 같은 키에 다른 본문이 오면 거부합니다. 이것이 없으면 키는 엉뚱한 응답을 돌려받는 통로가 됩니다.
- 작업을 시작하기 전에 키를 원자적으로 선점합니다. 고유 제약이나 조건부 INSERT를 쓰지 않으면, 동시에 도착한 두 요청이 검사를 나란히 통과해 둘 다 진행됩니다.
- 키의 수명은 현실적인 재시도를 덮을 만큼, 몇 시간에서 하루 정도로 잡고 문서에 적어 둡니다. 너무 짧으면 늦게 온 재시도가 다시 결제하고, 무한이면 저장소가 계속 커집니다.
- 애초에 반복해도 결과가 같은 성질(idempotency)을 갖는 설계를 우선합니다. 클라이언트가 정한 id로 보내는 `PUT`이나, 장바구니 하나에 주문 하나 같은 업무 규칙상의 고유 제약이 그렇습니다. 키는 그 자체로는 반복이 안전해지지 않는 작업에 쓰는 수단입니다.

## .NET에서는

헤더 검사는 그것이 필요한 엔드포인트 앞 한 곳에서만 하고, 키는 작업이 끝난 뒤가 아니라 시작하기 전에 선점합니다.

```csharp
public sealed class IdempotencyFilter(IIdempotencyStore store) : IEndpointFilter
{
    public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        var http = context.HttpContext;
        if (!http.Request.Headers.TryGetValue("Idempotency-Key", out var key))
            return Results.BadRequest(new { error = "Idempotency-Key header is required" });

        var client = http.User.FindFirstValue("sub") ?? "anonymous";
        var fingerprint = await RequestFingerprint.ComputeAsync(http.Request);

        // Claim the key atomically: unique (client, key) row. Returns the existing row on conflict.
        var claim = await store.TryClaimAsync(client, key!, fingerprint, TimeSpan.FromHours(24), http.RequestAborted);
        switch (claim.State)
        {
            case ClaimState.Done:       return Results.Json(claim.Response, statusCode: claim.StatusCode); // replay
            case ClaimState.InProgress: return Results.StatusCode(StatusCodes.Status409Conflict);
            case ClaimState.Mismatch:   return Results.UnprocessableEntity(new { error = "Key reused with a different request" });
        }

        var result = await next(context);                       // first time: do the work
        await store.CompleteAsync(client, key!, result, http.RequestAborted);
        return result;
    }
}

app.MapPost("/payments", CreatePayment).AddEndpointFilter<IdempotencyFilter>();
```

보장이 실제로 만들어지는 곳은 `TryClaimAsync`이므로, 이것은 반드시 한 번의 원자적 연산이어야 합니다. `(client, key)`에 고유 제약이 걸린 테이블에 `INSERT`하고 충돌하면 기존 행을 돌려주거나, Redis `SET NX`에 만료를 같은 호출로 함께 지정하는 식입니다. 저장할 때는 응답 본문과 상태 코드를 키와 함께 넣습니다. 다시 재생한 응답이 처음 응답과 구별되지 않아야 하기 때문입니다. 지문도 함께 넣습니다. 같은 키에 다른 본문이 오는 것은 재시도가 아니라 호출하는 쪽의 버그이기 때문입니다.
