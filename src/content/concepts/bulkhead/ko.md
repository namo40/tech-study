---
title: "Bulkhead"
summary: "Bulkhead는 의존 대상마다 슬롯 풀을 따로 줍니다. 느려지거나 실패하는 의존 대상은 자기 칸만 채울 수 있고, 서비스의 나머지는 계속 동작합니다."
category: "복원력과 장애 대응"
scene: bulkhead
steps:
  - title: "공유 풀 하나"
    text: "A로 가든 B로 가든 모든 호출이 같은 풀에서 슬롯을 가져갑니다. 두 의존 대상이 건강할 때는 문제가 없습니다."
  - title: "Bulkhead가 없으면"
    text: "B가 느려지자 B 호출이 모든 슬롯을 붙잡습니다. 건강한 A로 가는 호출도 실패합니다. A가 아파서가 아니라 둘 곳이 없기 때문입니다."
  - title: "Bulkhead"
    text: "격벽이 풀을 나눕니다. B는 여전히 자기 슬롯 셋을 채우고 그 이상은 빠르게 실패하지만, B의 장애는 B 쪽에 머뭅니다. A는 계속 흐릅니다."
  - title: "타임아웃이 슬롯을 되돌립니다"
    text: "멈춘 호출이 슬롯을 영원히 쥐고 있으면 안 됩니다. 그 칸에 타임아웃을 함께 두고 그 의존 대상의 예산에 맞게 크기를 정하면, B는 다른 누구도 모르게 회복합니다."
related:
  - label: Concurrency Limiter
    slug: concurrency-limiter
  - label: Bounded Concurrency
    slug: bounded-concurrency
  - label: Fault Isolation
    slug: fault-isolation
  - label: Timeout
    slug: timeout
  - label: Circuit Breaker
    slug: circuit-breaker
  - label: Rate Limiter
    slug: rate-limiter
  - label: Thread Pool Starvation
    slug: threadpool-starvation
  - label: Pool Exhaustion
    slug: pool-exhaustion
  - label: Noisy Neighbor
    slug: noisy-neighbor
references:
  - title: Bulkhead pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/bulkhead
  - title: Introduction to resilient app development
    url: https://learn.microsoft.com/en-us/dotnet/core/resilience/
  - title: Build resilient HTTP apps with .NET
    url: https://learn.microsoft.com/en-us/dotnet/core/resilience/http-resilience
---

## 언제 쓰나

- 서비스 하나가 여러 의존 대상을 호출하고, 그중 느린 하나가 나머지까지 끌어내리면 안 될 때
- 호출자나 테넌트에 따라 중요도가 달라 일정 용량을 미리 확보해 두어야 할 때
- 의존 대상이 빠르게 실패하기보다 느려지는 방식으로 나빠진다는 것을 알고 있을 때

## 주의점

- 타임아웃 없는 Bulkhead는 문제를 미루기만 합니다. 멈춘 호출은 타임아웃이 풀어 줄 때까지 슬롯을 쥐고 있습니다.
- 칸을 너무 작게 잡으면 평상시에 용량을 낭비합니다. 실제로 측정한 동시 실행 수에서 시작해 여유를 더합니다.
- 슬롯은 HTTP 호출만이 아닙니다. 스레드 풀, 데이터베이스 연결 풀, 큐에도 같은 분리가 필요합니다.
- 칸이 가득 차면 빠르게 실패시키고, 그 거부를 지표로 드러냅니다. 가득 찬 칸은 열린 Circuit Breaker처럼 이른 경고입니다.

## .NET에서는

의존 대상마다 `HttpClient`와 파이프라인을 따로 둡니다.

```csharp
builder.Services
    .AddHttpClient("search", client =>
        client.BaseAddress = new Uri("https://search.internal"))
    .AddResilienceHandler("search-bulkhead", pipeline =>
    {
        // 검색은 자기 칸을 갖습니다. 동시 20건,
        // 대기 10건, 그 너머는 전부 빠르게 실패합니다.
        pipeline.AddConcurrencyLimiter(permitLimit: 20, queueLimit: 10);
        pipeline.AddTimeout(TimeSpan.FromSeconds(2));
    });

builder.Services
    .AddHttpClient("payments", client =>
        client.BaseAddress = new Uri("https://payments.internal"))
    .AddResilienceHandler("payments-bulkhead", pipeline =>
    {
        pipeline.AddConcurrencyLimiter(permitLimit: 50, queueLimit: 0);
        pipeline.AddTimeout(TimeSpan.FromSeconds(1));
    });
```

`SemaphoreSlim`을 쓰면 나가는 호출뿐 아니라 임의의 코드 구간에도 같은 칸을 두를 수 있습니다. 더 강한 격리는 프로세스, 컨테이너, 데이터베이스 풀을 나누는 데서 나오며, 한 프로세스 안의 제한만으로는 거기까지 얻을 수 없습니다.
