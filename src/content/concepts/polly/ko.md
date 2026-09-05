---
title: "Polly"
summary: "Polly는 .NET의 복원력 라이브러리이고, v8부터 단위는 ResiliencePipeline입니다. 실행할 호출을 여러 전략이 겹겹이 감싸는 형태이며, 추가한 순서가 곧 감싸는 순서라서 재시도와 타임아웃은 어느 쪽이 바깥에 있느냐에 따라 뜻이 달라집니다."
category: "복원력과 장애 대응"
scene: circuit-breaker
sceneStep: 1
related:
  - label: Circuit Breaker
    slug: circuit-breaker
  - label: Retry
    slug: retry
  - label: Request Timeout
    slug: request-timeout
  - label: Fallback
    slug: fallback
  - label: Bulkhead
    slug: bulkhead
references:
  - title: "Meet Polly: The .NET resilience library"
    url: https://www.pollydocs.org/
  - title: "Build resilient HTTP apps with .NET"
    url: https://learn.microsoft.com/en-us/dotnet/core/resilience/http-resilience
---

장면의 1단계는 Circuit Breaker가 닫힌 상태로 표본 구간 안에서 결과를 세는 모습을 보여 줍니다. .NET 애플리케이션이 그 기계를 직접 만들지 않고 얻는 자리가 Polly입니다. v8부터 단위는 `ResiliencePipeline`입니다. `ExecuteAsync`에 넘기는 콜백을 여러 전략이 겹겹이 감싼 사슬이고, `ResiliencePipelineBuilder`로 한 번 조립합니다. 파이프라인은 상태를 가지는데, 사람들이 가장 먼저 놓치는 부분이 이 점입니다. 실패 횟수, 열린 회로의 시계, 속도 제한의 퍼밋 수가 모두 파이프라인 객체 안에 살기 때문에, 필드나 의존성 주입에 싱글턴으로 두어야 합니다. 요청마다 새로 만든 파이프라인은 요청마다 실패를 한 번도 본 적 없는 Circuit Breaker를 주고, 그런 Circuit Breaker는 영영 열리지 않습니다. 전략은 추가한 순서대로 바깥부터 안으로 겹치며, 그 순서가 각 전략의 뜻을 바꿉니다.

```csharp
ResiliencePipeline pipeline = new ResiliencePipelineBuilder()
    .AddTimeout(TimeSpan.FromSeconds(30))  // 재시도까지 포함한 호출 전체
    .AddRetry(new RetryStrategyOptions { MaxRetryAttempts = 3 })
    .AddCircuitBreaker(new CircuitBreakerStrategyOptions { FailureRatio = 0.1 })
    .AddTimeout(TimeSpan.FromSeconds(10))  // 시도 한 번
    .Build();
```

바깥쪽 타임아웃은 재시도까지 포함한 작업 전체를 묶으므로, 호출하는 쪽이 들고 있는 기한이 놓일 자리가 생깁니다. 안쪽 타임아웃은 시도 하나를 묶는데, 이것이 멈춰 버린 의존 대상을 그냥 멈춤이 아니라 셀 수 있는 실패로 바꿔 줍니다. Circuit Breaker는 재시도 안쪽에 자리 잡아 작업이 아니라 시도를 세고, 재시도가 진행되는 도중에도 열릴 수 있습니다. 재시도의 폭주가 쓰러져 가는 의존 대상을 계속 눌러 두는 일을 막는 것이 바로 이 배치입니다.

대부분의 .NET 애플리케이션은 이 조립을 직접 하지 않습니다. `Microsoft.Extensions.Http.Resilience`가 이미 담아 두었기 때문입니다. `IHttpClientBuilder`에 `AddStandardResilienceHandler()`를 부르면 방금의 배치가 그대로 delegating handler로 붙습니다. 기본값은 짐작하기보다 한 번 읽어 둘 만합니다. 가장 바깥에 속도 제한, 전체 30초 타임아웃, 지수 백오프와 지터를 쓰는 재시도 3회, 30초 표본 구간에서 최소 호출 100건을 채운 뒤 실패율 10%에 열리는 Circuit Breaker, 그리고 시도당 10초 타임아웃입니다. HTTP 500 이상과 408, 429를 이미 실패로 취급한다는 점도 다릅니다. 직접 만든 파이프라인은 그렇지 않습니다. 일반 파이프라인에서는 반환된 결과가 `ShouldHandle`이 그렇다고 말할 때만 실패이고, 기본으로는 던져진 예외만 셉니다. 핸들러 하나는 그 클라이언트를 위한 Circuit Breaker 하나를 뜻하므로, 여러 호스트와 이야기하는 클라이언트라면 호스트 하나가 전체를 열어 버리는 대신 authority별로 파이프라인을 고르게 하는 편이 낫습니다.

Polly가 대신 해 줄 수 없는 것은 판단입니다. 어떤 작업을 반복해도 결과가 달라지지 않는지 Polly는 모르고, 그렇지 않은 호출 앞에 재시도를 붙이는 것은 고객에게 두 번 청구하는 방법입니다. 호출하는 쪽의 기한도 모르므로, 바깥쪽 타임아웃 값은 지어내는 것이 아니라 받아 와야 하는 숫자입니다. 그리고 Polly의 전략들은 옆 페이지들을 실행 가능한 형태로 옮겨 놓은 것입니다. 재시도, Circuit Breaker, 타임아웃, fallback, hedging, 속도 제한이 모두 빌더 메서드라서, 각각이 무엇을 지키는지 정하지 않은 채 네 개를 한꺼번에 붙이기가 쉽습니다. 파이프라인이 내보내는 텔레메트리를 켜 둔 채 하나씩 붙입니다. 그래야 Circuit Breaker가 열리는 순간이 사용자가 알려 주는 오류가 아니라 눈에 보이는 사건이 됩니다.
