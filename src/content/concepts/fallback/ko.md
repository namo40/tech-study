---
title: "Fallback"
summary: "Fallback은 제대로 된 답을 낼 수 없을 때 대신 내놓는 답입니다. 캐시된 사본, 기본값, 더 작은 페이지처럼 일부러 낮춘 답을 돌려주어, 실패가 사용자에게까지 가지 않고 서비스 안에 머물게 합니다."
category: "복원력과 장애 대응"
scene: fallback
steps:
  - title: "모든 것이 살아 있을 때의 온전한 응답"
    text: "요청 하나가 핵심 데이터와 추천 서비스로 갈라져 나가고, 페이지는 완전한 모습으로 돌아옵니다. 좋은 날에는 아무도 이음새를 생각하지 않습니다. 이음새를 그려 둘 때가 바로 그때입니다."
  - title: "의존이 죽어도 답은 나갑니다"
    text: "추천 호출이 실패합니다. 서비스는 페이지를 실패시키는 대신 어제의 캐시된 목록을 내보내고 fallback이라고 표시해 둡니다. 사용자는 여전히 답을 받습니다. 오류는 안에 머뭅니다."
  - title: "가라앉기 전에 덜어 냅니다"
    text: "용량보다 많은 요청이 오면 속도를 줄이고, 초과분은 값싼 거절로 일찍 덜어 냅니다. 빠른 503은 클라이언트 하나에게 재시도 한 번을 치르게 하지만, 느린 타임아웃은 모두에게 값을 물립니다. 가장자리가 먼저 물러났기 때문에 핵심이 빠르게 남습니다."
  - title: "저하는 설계하는 모드입니다"
    text: "부가 기능은 끄고 핵심은 켠 채, 서비스는 의존이 돌아올 때까지 계획된 작은 모습으로 돌아갑니다. 그런 다음 기능을 하나씩 되살립니다. 부분적으로 살아 있는 법을 아는 시스템은 완전히 죽는 일이 드뭅니다."
related:
  - label: Circuit Breaker
    slug: circuit-breaker
  - label: Retry
    slug: retry
  - label: Request Timeout
    slug: request-timeout
  - label: Bulkhead
    slug: bulkhead
  - label: Rate Limiter
    slug: rate-limiter
  - label: Tail Latency
    slug: tail-latency
  - label: Load Shedding
    slug: load-shedding
  - label: Throttling
    slug: throttling
  - label: Graceful Degradation
    slug: graceful-degradation
  - label: Cache-Aside
    slug: cache-aside
references:
  - title: "Fallback resilience strategy (Polly)"
    url: https://www.pollydocs.org/strategies/fallback.html
  - title: "Throttling pattern"
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/throttling
  - title: "Rate limiting middleware in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/performance/rate-limit
---

## 언제 쓰나

- 실패했을 때 오류보다 값싼 답이 있는 호출입니다. 캐시된 사본이나 조금 지난 사본, 기본값, 더 작은 페이지, "접수했고 나중에 마치겠습니다"라는 대기 응답이 그런 답입니다. 500 대신 무엇을 돌려주고 싶은지 말할 수 있다면 이미 fallback이 있는 셈이고, 남은 문제는 그것을 어디에 두느냐입니다.
- 필수보다 부가 기능이 먼저입니다. 추천, 연관 상품, 개인화, 프로필 이미지, 리뷰 개수, 배송 예정일처럼 그것 때문에 무언가를 사지는 않는 부분이 그렇습니다. 이런 호출은 페이지를 쓰러뜨릴 수 있어서는 안 되는데, 대개 가장 새롭고 가장 손이 덜 간 부분이라 느려질 가능성도 가장 큽니다.
- Circuit Breaker 대신이 아니라 함께 씁니다. 차단기는 실패하는 대상을 *언제* 그만 부를지 정하고, fallback은 그동안 *무엇이라고 답할지* 정합니다. fallback 없는 차단기는 여전히 오류를 돌려주며 다만 더 빠를 뿐입니다. 차단기 없는 fallback은 실패할 것을 이미 아는 호출에 계속 값을 치릅니다.
- 부하가 몰릴 때는 누가 손해를 볼지 고르는 방법이 됩니다. 속도를 줄이는 throttling과 초과분을 즉시 거절하는 shedding은 호출 하나가 아니라 서비스 전체에 대한 fallback입니다. "지금은 모두를 받을 수 없습니다"에 대한 답은 모두에게 느린 타임아웃을 주는 것이 아니라 일부에게 빠르고 솔직한 거절을 주는 것입니다.
- 낮춘 답을 미리 적어 둘 수 있을 때 씁니다. 장애가 나기 전에 추천 없는 페이지가 어떤 모습인지 말할 수 없다면, 장애 중에 누군가가 그것을 즉석에서 만들어 냅니다. 그렇게 만들어진 것은 오류 페이지입니다.

## 주의점

- fallback은 대체하려는 경로보다 싸고 튼튼해야 합니다. 그렇지 않으면 함께 무너집니다. 방금 타임아웃이 난 그 데이터베이스로 되돌아가는 것은 fallback이 아니라 단계만 늘어난 재시도입니다. 로컬 캐시, 정적 기본값, 이미 메모리에 있는 값을 먼저 생각하세요. fallback이 자기 몫의 네트워크 호출을 필요로 한다면, 그 호출마저 느릴 때 어떻게 되는지 물어야 합니다.
- 낮춘 응답에는 표시를 남기고 비율을 재야 합니다. fallback으로 만든 응답은 헤더든 페이로드의 플래그든 추적 스팬의 속성이든 어딘가에 그렇다고 적어야 합니다. 그것이 없으면 fallback은 경보선을 끊어 둔 장애가 됩니다. 추천이 엿새째 낡은 값인데 대시보드는 온통 초록색이고, 처음 알아차리는 사람은 고객입니다. fallback 비율은 오류율과 같은 화면에 두는 것이 맞습니다. 답을 멈춘 부분에 대해서는 그것이 곧 오류율이기 때문입니다.
- 지어내면 안 되는 답이 있습니다. 잔액, 결제 상태, 권한, 곧 차감될 재고처럼 사용자가 그 값을 보고 행동하는 경우입니다. 그럴듯한 틀린 숫자는 오류보다 나쁩니다. 이런 호출은 정직하게 실패하고 그렇다고 말해야 합니다. 기준은 간단합니다. 읽는 사람이 그 값으로 결정을 내리는지 보고, 그렇다면 낡은 값을 내보내지 마세요.
- shedding에는 우선순위 규칙이 필요합니다. 없으면 추천과 함께 결제가 버려집니다. 토큰이 비었을 때 도착한 것을 무조건 거절하면 결제 확인과 썸네일 요청을 같은 무게로 다루는 셈입니다. 한도를 엔드포인트나 비용 단위로 나누고, 값싸고 부가적인 트래픽이 먼저 거절되게 만들어야 합니다.
- 한 번도 돌아 본 적 없는 fallback은 가설일 뿐입니다. 테스트에서 강제로 태워 보세요. 의존 대상을 응답 없는 주소로 돌려놓고 요청을 보내 페이지를 직접 읽어 봅니다. 깨지는 곳은 대개 fallback 자체가 아니라, 빈 목록을 처리하지 못하는 직렬화기, 항목이 최소 하나는 있다고 가정한 화면, 요청마다 찍혀서 로그 저장소를 채우는 한 줄입니다.
- fallback이 사실상의 본 경로가 되고 있지는 않은지 살펴야 합니다. 캐시된 사본으로 몇 달을 버틸 수 있다면 그 의존 대상에 대해 알게 된 것이 있는 셈입니다. 정직한 대응은 그 호출을 지우는 것이지, 가끔 장애를 일으키는 장식으로 남겨 두는 것이 아닙니다.

## .NET에서는

Polly v8은 fallback을 파이프라인의 전략으로 둡니다. 대체 답이 호출 지점의 `catch` 블록이 아니라 타임아웃, 재시도와 같은 자리에서 만들어진다는 뜻입니다.

```csharp
// The recommendations call: short timeout, and a cached list when it fails.
var recommendations = new ResiliencePipelineBuilder<IReadOnlyList<Item>>()
    .AddFallback(new FallbackStrategyOptions<IReadOnlyList<Item>>
    {
        ShouldHandle = new PredicateBuilder<IReadOnlyList<Item>>()
            .Handle<HttpRequestException>()
            .Handle<TimeoutRejectedException>()
            .Handle<BrokenCircuitException>(),
        FallbackAction = async args =>
        {
            var cached = await store.LastKnownGoodAsync(args.Context.CancellationToken);
            return Outcome.FromResult<IReadOnlyList<Item>>(cached ?? Array.Empty<Item>());
        },
        // The response has to admit what it is, or the outage is invisible.
        OnFallback = args =>
        {
            degraded.Value = true;
            metrics.Add(1, new KeyValuePair<string, object?>("reason", "recommendations"));
            return default;
        },
    })
    .AddCircuitBreaker(new CircuitBreakerStrategyOptions<IReadOnlyList<Item>>())
    .AddTimeout(TimeSpan.FromMilliseconds(300))
    .Build();
```

전략은 추가한 순서대로 바깥쪽부터 실행되므로 여기서는 fallback이 차단기를 감싸고, 차단기가 타임아웃을 감쌉니다. 300 ms를 넘긴 호출은 취소되고, 차단기가 그것을 세고, 어느 쪽 실패가 도착하든 fallback이 목록으로 바꿔 놓습니다. 파이프라인에 *없는* 것도 눈여겨볼 만합니다. 핵심 데이터 호출은 여기에 없습니다. 정직한 대체물이 없기 때문이고, 그것을 읽지 못하는 요청은 실패해야 하기 때문입니다.

throttling과 shedding은 정책이 아니라 미들웨어입니다. 값비싼 지점에 요청이 닿기 전에 일어나야 하기 때문입니다.

```csharp
builder.Services.AddRateLimiter(options =>
{
    // A refusal, not a queue: 503 now beats a timeout in thirty seconds.
    options.RejectionStatusCode = StatusCodes.Status503ServiceUnavailable;
    options.OnRejected = async (context, token) =>
    {
        context.HttpContext.Response.Headers.RetryAfter = "2";
        await context.HttpContext.Response.WriteAsync("busy", token);
    };

    options.AddTokenBucketLimiter("browse", limiter =>
    {
        limiter.TokenLimit = 40;
        limiter.TokensPerPeriod = 20;
        limiter.ReplenishmentPeriod = TimeSpan.FromSeconds(1);
        limiter.QueueLimit = 0;
    });
});

app.MapGet("/products/{id}", GetProduct).RequireRateLimiting("browse");
app.MapPost("/checkout", Checkout); // never shed
```

`QueueLimit = 0` 한 줄이 논지 전부입니다. 용량을 넘은 요청은 끝내 오지 않을 토큰을 기다리는 대신 즉시 거절됩니다. 한도가 걸린 곳이 조회 엔드포인트뿐이라는 점도 봐 두면 좋습니다. 결제는 일부러 손대지 않았습니다. 우선순위 규칙 없는 shedding은 서버 값을 치러 주는 트래픽을 거절하기 때문입니다.

계획된 작은 모습은 기능 플래그이고, 필요해지기 전에 만들어 둘 가치가 있습니다. 추천, 연관 상품, 개인화 배너를 한 번에 끄는 `core only` 스위치가 있으면 새벽 세 시의 운영자가 무언가를 재시작하는 것 말고 할 일이 생기고, 타임아웃이 났을 페이지가 그럭저럭 뜨는 페이지로 바뀝니다. `Microsoft.FeatureManagement`면 충분합니다. 중요한 것은 라이브러리가 아니라 그 플래그가 존재하고, 문서에 적혀 있고, 훈련에서 한 번은 켜 봤다는 사실입니다. 그래야 장애 중에 화면이 아직도 추천 서비스를 직접 부르고 있다는 것을 뒤늦게 발견하는 일이 없습니다.
