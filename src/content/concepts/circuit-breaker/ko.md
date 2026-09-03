---
title: Circuit Breaker
summary: "Circuit Breaker는 계속 실패하는 의존 서비스로 가는 호출을 끊습니다. 호출하는 쪽은 빠르게 실패하고, 의존 서비스는 회복할 시간을 얻습니다."
category: 복원력과 장애 대응
scene: circuit-breaker
steps:
  - title: "Closed (닫힘)"
    text: "요청이 Service까지 그대로 전달됩니다. Circuit Breaker는 모든 호출을 통과시키면서 결과를 기록합니다. Service가 실패하기 시작하면 표본 구간(sampling window, 실패율을 재는 기간) 안에서 실패 횟수를 셉니다."
  - title: "Open (열림)"
    text: "실패율이 임계치를 넘으면 Circuit Breaker가 열립니다. 호출은 Circuit Breaker에서 즉시 실패하고 Service까지 가지 않습니다. 호출하는 쪽은 Timeout을 기다리지 않고 곧바로 오류를 받고, Service는 회복할 시간을 얻습니다."
  - title: "Half-Open (반쯤 열림)"
    text: "차단 시간(break duration)이 지나면 시험 호출 하나만 통과시킵니다. 다른 호출은 여전히 거부됩니다. 이 시험 호출은 의존 서비스가 다시 정상인지만 확인합니다."
  - title: "다시 Closed"
    text: "시험 호출이 성공했으므로 트래픽이 정상으로 흐릅니다. 시험 호출이 실패했다면 Circuit Breaker는 차단 시간만큼 다시 Open 상태가 됩니다."
related:
  - label: Retry
    slug: retry
  - label: Timeout
    slug: timeout
  - label: Bulkhead
    slug: bulkhead
  - label: Fallback
    slug: fallback
  - label: Closed State
    slug: closed-state
  - label: Open State
    slug: open-state
  - label: Half-Open State
    slug: half-open-state
  - label: Polly
    slug: polly
references:
  - title: Circuit Breaker pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/circuit-breaker
  - title: Introduction to resilient app development
    url: https://learn.microsoft.com/en-us/dotnet/core/resilience/
  - title: Build resilient HTTP apps with .NET
    url: https://learn.microsoft.com/en-us/dotnet/core/resilience/http-resilience
---

## 언제 쓰나

- 의존 서비스의 장애가 잠깐 스치는 수준이 아니라 일정 시간 이어질 때
- 의존 서비스가 멈춰 있는 동안에도 호출하는 쪽은 계속 응답해야 할 때
- 무엇을 실패로 볼지 정의할 수 있을 때. 예외, Timeout, 특정 상태 코드가 기준이 됩니다.

## 주의점

- 차단 범위를 알맞게 잡습니다. 보통은 의존 서비스의 엔드포인트마다 Circuit Breaker를 하나씩 두는 편이 맞습니다. 서로 관련 없는 엔드포인트가 Circuit Breaker 하나를 공유하면 한 곳이 실패할 때 멀쩡한 트래픽까지 막힙니다.
- Timeout과 함께 씁니다. Timeout이 없으면 느린 호출은 끝내 실패로 기록되지 않습니다.
- Retry와의 순서를 정합니다. Retry는 그 실패가 일시적인지 확인하는 장치이고, Circuit Breaker는 회복 가능성이 낮은 동안 그 확인 자체를 멈추게 합니다.
- 상태 변화를 지표와 로그로 남깁니다. Open 상태는 단순한 코드 분기가 아니라 운영 신호입니다.

## .NET에서는

`Microsoft.Extensions.Http.Resilience`를 사용합니다. 이전에 쓰던 `Microsoft.Extensions.Http.Polly` 패키지는 deprecated 상태이므로 새 코드에는 쓰지 않습니다.

```csharp
builder.Services
    .AddHttpClient("inventory", client =>
        client.BaseAddress = new Uri("https://inventory.internal"))
    .AddResilienceHandler("inventory-pipeline", pipeline =>
    {
        pipeline.AddTimeout(TimeSpan.FromSeconds(2));
        pipeline.AddCircuitBreaker(new HttpCircuitBreakerStrategyOptions
        {
            FailureRatio = 0.5,
            MinimumThroughput = 20,
            SamplingDuration = TimeSpan.FromSeconds(30),
            BreakDuration = TimeSpan.FromSeconds(15),
        });
    });
```

`AddStandardResilienceHandler()`는 rate limiter, 전체 요청 Timeout, Retry, Circuit Breaker, 시도별 Timeout을 기본값으로 묶어 제공합니다. 그래서 기본값이 맞지 않을 때만 파이프라인을 직접 구성하면 됩니다.
