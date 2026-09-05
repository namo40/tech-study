---
title: "Request Timeout"
summary: "request timeout은 호출자가 원격 호출에 두는 상한입니다. 상한이 없으면 멈춘 의존 대상이 호출자를 영원히 붙잡고, 상한이 있으면 호출자는 빠르게 실패하고 남은 예산을 아래로 넘기며 더는 필요 없는 작업을 취소합니다."
category: "복원력과 장애 대응"
scene: request-timeout
steps:
  - title: "타임아웃이 없으면"
    text: "의존 대상이 멈추면 호출도 멈추고, 그 뒤의 스레드와 연결도 함께 멈춥니다. 사용자는 5초 뒤에 포기하지만 서버는 여전히 기다리고 있습니다."
  - title: "상한은 여러 개입니다"
    text: "연결, 한 번의 시도, 요청 전체는 서로 다른 세 가지 제한입니다. 여기서는 연결과 시도 상한이 발동하고, 전체 상한은 요청 전체를 덮습니다. 느린 응답이 빠른 오류가 되고 스레드는 다시 일하러 돌아갑니다."
  - title: "남은 예산을 아래로 넘깁니다"
    text: "요청 하나에 800ms입니다. 데이터베이스가 300을 썼으니 다음 호출은 자기만의 새 타임아웃이 아니라 남은 500을 받습니다. 같은 두 호출을 두 번째 호출에 새 500ms 상한을 주고 돌리면 deadline을 300ms 넘깁니다."
  - title: "더는 기다리지 않는 일은 취소합니다"
    text: "취소 없는 타임아웃은 의존 대상에 아무도 받지 않을 ghost work를 남깁니다. CancellationToken을 끝까지 흘려보내야 끊음이 실제가 됩니다."
related:
  - label: Timeout
    slug: timeout
  - label: Deadline
    slug: deadline
  - label: Cancellation Token
    slug: cancellation-token
  - label: Connection Timeout
    slug: connection-timeout
  - label: Idle Timeout
    slug: idle-timeout
  - label: Retry
    slug: retry
  - label: Circuit Breaker
    slug: circuit-breaker
  - label: Hedging
    slug: hedging
  - label: Thread Pool Starvation
    slug: threadpool-starvation
  - label: Database Connection Pool
    slug: database-connection-pool
references:
  - title: Request timeouts middleware in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/performance/timeouts?view=aspnetcore-10.0
  - title: Build resilient HTTP apps with .NET
    url: https://learn.microsoft.com/en-us/dotnet/core/resilience/http-resilience
  - title: Cancellation in managed threads
    url: https://learn.microsoft.com/en-us/dotnet/standard/threading/cancellation-in-managed-threads
---

## 언제 쓰나

- 예외 없이 모든 원격 호출에. HTTP, gRPC, 데이터베이스, 캐시, 메시지 브로커 모두 해당합니다.
- 여러 의존 대상으로 갈라지는 요청마다. 요청 하나에 deadline 하나를 주고, 각 호출의 타임아웃은 남은 예산에서 끌어냅니다.
- 호출자가 기다리는 동안 귀한 것을 붙잡고 있는 곳이라면 어디든. 스레드, 풀에서 빌린 연결, 소켓이 모두 그렇습니다.

## 주의점

- 연결 타임아웃, 시도별 타임아웃, 요청 전체 타임아웃, 유휴 타임아웃은 서로 다른 네 가지 설정입니다. 하나가 나머지를 덮어 준다고 넘겨짚지 말고 호출마다 필요한 것을 정해 둡니다.
- 타임아웃은 재시도 정책이 아닙니다. 그 호출을 재시도해도 되는지, 재시도한다면 어느 예산 안에서 할지는 따로 결정합니다.
- 모든 비동기 호출에 `CancellationToken`을 넘깁니다. 취소하지 않는 타임아웃은 낭비를 호출자에서 의존 대상으로 옮길 뿐입니다.
- 너무 짧은 타임아웃은 평범한 변동만으로도 건강한 호출을 실패시킵니다. 정상 상태 의존 대상의 p99에서 시작해 여유를 더합니다.
- "타임아웃 없음"도 숫자를 정하는 것만큼이나 하나의 결정입니다. 대부분의 클라이언트에는 기본값이 있으니, 기대기 전에 그 값이 실제로 얼마인지 확인합니다.
- 요청 타임아웃 미들웨어는 Kestrel 자체의 타임아웃과 마찬가지로 디버거가 붙어 있는 동안에는 발동하지 않습니다. 디버거 없이 테스트해야 합니다. 그러지 않으면 "우리 타임아웃이 안 된다"는 결론은 디버거에 대한 이야기가 됩니다.

## .NET에서는

요청 전체에 deadline을 하나 두고, 그 아래의 모든 호출은 자기만의 새 상한이 아니라 남은 예산으로 묶습니다.

```csharp
// 요청 전체에 기한 하나(ASP.NET Core 요청 타임아웃 미들웨어).
builder.Services.AddRequestTimeouts(options =>
    options.DefaultPolicy = new RequestTimeoutPolicy { Timeout = TimeSpan.FromMilliseconds(800) });
app.UseRequestTimeouts();

app.MapGet("/checkout/{id:int}", async (int id, ShopDbContext db, HttpClient pricing, HttpContext http) =>
{
    var ct = http.RequestAborted;                        // 타임아웃이나 클라이언트 연결 끊김에 취소됩니다
    var started = Stopwatch.GetTimestamp();

    var order = await db.Orders.FindAsync([id], ct);     // 토큰이 데이터베이스 호출까지 흘러 들어갑니다

    var left = TimeSpan.FromMilliseconds(800) - Stopwatch.GetElapsedTime(started);
    using var pricingCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
    pricingCts.CancelAfter(left);                        // 새로 800이 아니라 남은 만큼

    var price = await pricing.GetFromJsonAsync<Price>($"/prices/{order!.Sku}", pricingCts.Token);
    return Results.Ok(new { order.Id, price });
});
```

`HttpClient` 쪽 상한은 또 따로입니다. `AddStandardResilienceHandler()`는 파이프라인에 요청 전체 타임아웃과 시도별 타임아웃을 함께 걸어 주고, 연결을 여는 상한은 둘 중 어느 쪽도 아닌 `SocketsHttpHandler.ConnectTimeout`이 맡습니다. 셋을 모두 정해 두어야 "호출이 너무 오래 걸렸다"가 막연한 말이 아니라 어느 단계에서 그랬는지에 대한 이야기가 됩니다.
