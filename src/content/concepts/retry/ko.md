---
title: "Retry"
summary: "Retry는 실패한 호출을 잠깐 기다렸다가 다시 보냅니다. 그 실패가 일시적이었다는 데 거는 방식이며, 대기 시간이 길어지고 무작위 편차가 있고 한계가 정해져 있을 때만 도움이 됩니다."
category: "복원력과 장애 대응"
scene: retry
steps:
  - title: "Retry"
    text: "호출이 한 번 실패합니다. 재시도가 잠깐 기다렸다가 다시 보내고, 이번에는 성공합니다. 그 실패가 일시적이었다는 데 거는 셈입니다."
  - title: "지수 백오프와 지터"
    text: "기다리는 시간이 매번 길어지고, 지터를 더해 재시도가 같은 순간에 몰리지 않게 합니다. 시간을 두 배씩 늘려 의존 대상에 회복할 틈을 줍니다."
  - title: "Retry Storm"
    text: "같은 박자로 재시도하는 호출 셋이 회복 중인 Service를 파도처럼 때려 다시 쓰러뜨립니다. 지터가 그 파도를 흩어 놓습니다."
  - title: "한계가 있습니다"
    text: "세 번 시도하고 나면 예산이 바닥납니다. 호출은 영원히 시도하는 대신 빠르게 실패합니다."
related:
  - label: Exponential Backoff
    slug: exponential-backoff
  - label: Jitter
    slug: jitter
  - label: Retry Storm
    slug: retry-storm
  - label: Retry Budget
    slug: retry-budget
  - label: Circuit Breaker
    slug: circuit-breaker
  - label: Timeout
    slug: timeout
  - label: Idempotency
    slug: idempotency
  - label: Hedging
    slug: hedging
references:
  - title: Build resilient HTTP apps with .NET
    url: https://learn.microsoft.com/en-us/dotnet/core/resilience/http-resilience
  - title: Retry pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/retry
  - title: Transient fault handling
    url: https://learn.microsoft.com/en-us/azure/architecture/best-practices/transient-faults
---

## 언제 쓰나

- 장애가 일시적일 때. 연결 끊김, DNS 오류, 408, 429, 503, 잠금 대기 초과가 여기에 해당합니다.
- 호출을 반복해도 결과가 같을 때(idempotent). 그렇지 않다면 두 번 적용되지 않도록 idempotency key를 함께 보냅니다.
- Deadline과 Retry Budget에 아직 여유가 남아 있을 때

## 주의점

- POST처럼 반복하면 결과가 달라지는 호출은 무턱대고 재시도하지 않습니다.
- 재시도는 한 계층만 담당하게 합니다. 클라이언트, 게이트웨이, 서비스가 각각 3회씩 시도하면 실패 하나가 호출 27번이 됩니다.
- `Retry-After`를 지킵니다. 서버가 언제 다시 오라고 알려 주는 값입니다.
- 시도 횟수와 최종 결과를 지표로 남깁니다. 재시도 비율이 오르는 것은 이른 경고입니다.

## .NET에서는

`Microsoft.Extensions.Http.Resilience`를 사용합니다.

```csharp
builder.Services
    .AddHttpClient("catalog", client =>
        client.BaseAddress = new Uri("https://catalog.internal"))
    .AddResilienceHandler("catalog-pipeline", pipeline =>
    {
        var retry = new HttpRetryStrategyOptions
        {
            MaxRetryAttempts = 3,
            Delay = TimeSpan.FromMilliseconds(500),
            BackoffType = DelayBackoffType.Exponential,
            UseJitter = true,
            ShouldRetryAfterHeader = true,
        };
        retry.DisableForUnsafeHttpMethods();   // POST, PATCH, PUT, DELETE, CONNECT
        pipeline.AddRetry(retry);
        pipeline.AddTimeout(TimeSpan.FromSeconds(2));
    });
```

그대로 두면 이 옵션은 모든 HTTP 메서드를 재시도하므로, `DisableForUnsafeHttpMethods()` 한 줄이 코드를 위의 주의점과 맞춰 줍니다. `DisableFor(HttpMethod.Post, …)`는 메서드를 하나씩 지목하는 방식입니다.

기본 `ShouldHandle`은 5xx 응답, 408, 429, `HttpRequestException`, 시도별 타임아웃을 일시 오류로 봅니다. `AddStandardResilienceHandler()`는 같은 재시도 전략을 rate limiter, 타임아웃, Circuit Breaker와 함께 묶어 제공하므로, 기본값이 맞지 않을 때만 파이프라인을 직접 구성하면 됩니다.
