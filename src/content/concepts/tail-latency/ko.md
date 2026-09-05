---
title: "Tail Latency"
summary: "Tail Latency는 가장 느린 몇 퍼센트의 요청이 겪는 지연입니다. 평균은 이 지연을 감추고 p99는 드러내며, 팬아웃은 이를 대부분의 사용자가 실제로 느끼는 지연으로 만듭니다."
category: "요구사항과 품질 속성"
scene: tail-latency
steps:
  - title: "백 번에 한 번 느린 요청"
    text: "평균은 62ms, p50은 44ms라고 말합니다. p99는 400ms라고 말합니다. 느린 요청은 꼬리에 살기 때문입니다."
  - title: "팬아웃"
    text: "호출 10개를 보내는 페이지는 가장 느린 하나를 기다립니다. 꼬리가 1%면 계산상 페이지 열 개 중 하나가 걸리지만, 이 서비스의 꼬리로는 이 세 페이지 중 둘이 걸렸습니다."
  - title: "Hedge"
    text: "p95만큼 기다린 뒤 다른 레플리카에 같은 요청을 한 번 더 보내고 먼저 오는 답을 씁니다. hedge는 트래픽의 몇 퍼센트로 제한합니다. 여기서 세 번째 페이지는 예산을 넘겨 꼬리를 통째로 기다립니다. 제한이 없으면 느린 서비스의 부하를 두 배로 만듭니다."
  - title: "목표는 p99에 둡니다"
    text: "fallback이 있는 timeout은 꼬리에 천장을 만들고, p99 선은 그 천장이 목표 아래인지 알려 줍니다. 여기서는 아직 아니며, 그것이 다음에 고칠 일입니다."
related:
  - label: Latency
    slug: latency
  - label: p50
    slug: p50
  - label: p95
    slug: p95
  - label: p99
    slug: p99
  - label: Hedging
    slug: hedging
  - label: Timeout
    slug: timeout
  - label: Fallback
    slug: fallback
  - label: SLO
    slug: slo
  - label: Histogram
    slug: histogram
  - label: Aggregator
    slug: aggregator
references:
  - title: Build resilient HTTP apps with .NET
    url: https://learn.microsoft.com/en-us/dotnet/core/resilience/http-resilience
  - title: Creating metrics in .NET
    url: https://learn.microsoft.com/en-us/dotnet/core/diagnostics/metrics-instrumentation
  - title: The Tail at Scale
    url: https://research.google/pubs/the-tail-at-scale/
---

## 언제 쓰나

- 지연 목표가 있는 서비스라면 언제나 씁니다. 엔드포인트마다 p50, p95, p99를 재고 평균만 보지 않습니다. 백 번에 한 번 느린 요청은 p99를 움직이면서 평균은 거의 그대로 두기 때문입니다.
- 여러 백엔드로 갈라지는 요청이라면 언제나 씁니다. 페이지는 자기 호출 중 가장 느린 하나를 기다리므로, 페이지의 비용을 정하는 것은 백엔드의 꼬리이고 중앙값은 거의 영향을 주지 않습니다.

## 주의점

- hedge와 재시도는 부하를 증폭합니다. 트래픽의 몇 퍼센트라는 예산을 두고, 반복해도 결과가 같은 호출에만 두 번째 사본을 보냅니다.
- fallback 없는 timeout은 느린 응답을 오류로 바꿀 뿐입니다. timeout을 걸기 전에 호출자가 대신 무엇을 받을지 정합니다.
- 가능하면 팬아웃을 줄입니다. 꼬리가 있는 상황에서는 작은 호출 여러 개보다 크고 적은 호출이 낫습니다.
- 지표는 평균이 아니라 히스토그램으로 남깁니다. 평균은 백분위로 되돌릴 수 없고, 평균의 평균은 평균조차 아닙니다.

## .NET에서는

```csharp
// 느린 호출은 hedge: 80ms(대략 p95)를 기다린 뒤 하나를 더 보내고 먼저 오는 답을 쓴다.
builder.Services
    .AddHttpClient("catalog", client => client.BaseAddress = new Uri("https://catalog.internal"))
    .AddResilienceHandler("catalog-tail", pipeline =>
    {
        pipeline.AddHedging(new HttpHedgingStrategyOptions
        {
            MaxHedgedAttempts = 1,
            Delay = TimeSpan.FromMilliseconds(80),
        });
        pipeline.AddTimeout(TimeSpan.FromMilliseconds(250));
    });

// 꼬리 재기: 히스토그램으로 남기고, 지표 백엔드에서 p50 / p95 / p99로 읽는다.
var meter = new Meter("Shop.Checkout");
var checkoutDuration = meter.CreateHistogram<double>("checkout.duration", unit: "ms");
checkoutDuration.Record(stopwatch.Elapsed.TotalMilliseconds);
```

이 파이프라인은 같은 `BaseAddress`로 다시 보냅니다. 같은 주소가 아니라 다른 레플리카로 hedge하려면 대신 `AddStandardHedgingHandler`를 쓰고 라우팅 전략을 붙입니다. 두 번째 엔드포인트를 고르는 것이 그 전략입니다.

ASP.NET Core와 `HttpClient`는 이미 `http.server.request.duration`과 `http.client.request.duration`을 히스토그램으로 내보냅니다. 따라서 이 둘을 OpenTelemetry로 수집하면 계측 코드를 직접 쓰지 않아도 엔드포인트별 p99를 바로 볼 수 있습니다.
