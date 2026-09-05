---
title: "Sliding Window"
summary: "Sliding Window는 시계의 정각이 아니라 지금부터 뒤로 N초를 셉니다. Fixed Window는 경계에서 버스트를 두 배로 흘려보내지만 Sliding Window는 그 이음새를 닫고, Leaky Bucket은 한 걸음 더 나아가 통과하는 것을 고른 방울로 펴 줍니다."
category: "복원력과 장애 대응"
scene: sliding-window
steps:
  - title: "Fixed Window의 한도는 이음새에서 두 배가 됩니다"
    text: "한 창의 끝자락에 넷이 들어오고, 다음 창의 첫머리에 또 넷이 들어옵니다. 한도가 4인데 2초 안에 여덟입니다. 창은 트래픽의 사정이 아니라 시계의 일정대로 초기화됩니다. 아홉 번째, 곧 자기 창에서 다섯 번째인 요청은 거절됩니다."
  - title: "Sliding Window는 지금부터 뒤로 셉니다"
    text: "같은 버스트, 같은 한도. 그러나 창이 점프하는 대신 시곗바늘과 함께 움직입니다. 두 번째 버스트가 도착하면 첫 번째가 아직 최근 N초 안에 있으므로 초과분은 떨어지고, 옛 요청들이 창 밖으로 미끄러져 나가야 통과가 재개됩니다. 어느 순간을 잘라도 최근 N초 안은 많아야 넷. 이음새가 사라진 것은 이음새가 없기 때문입니다."
  - title: "정확함에는 대가가 있고, 근사가 그 대가를 깎습니다"
    text: "진짜 Sliding Window는 도착 하나하나의 시각을 기억합니다. 키마다 그렇게 하면 규모가 커질수록 장부가 됩니다. 흔한 거래는 고정 버킷 둘을 두고 이전 것을 겹친 만큼 가중하는 것입니다. 가장자리에서 조금 더 들여보내는 가까운 추정입니다."
  - title: "창은 수를 재고, 버킷은 속도를 만듭니다"
    text: "지금까지는 몇 개가 지나가도 되는지만 정했고, 지나간 것은 여전히 뭉쳐 있었습니다. Leaky Bucket은 도착을 담아 두고 정해진 한 방울씩 내보내므로, 입력이 아무리 뭉쳐도 하류는 고른 흐름을 보고 넘친 것은 버립니다. 형제인 Token Bucket은 모아 둔 허용량을 버스트로 씁니다. 이쪽은 고르게 폅니다."
related:
  - label: Rate Limiter
    slug: rate-limiter
  - label: Fixed Window
    slug: fixed-window
  - label: Leaky Bucket
    slug: leaky-bucket
  - label: Token Bucket
    slug: token-bucket
  - label: Throttling
    slug: throttling
  - label: Load Shedding
    slug: load-shedding
  - label: Backpressure
    slug: backpressure
  - label: Bounded Concurrency
    slug: bounded-concurrency
  - label: Retry
    slug: retry
references:
  - title: Rate limiting middleware in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/performance/rate-limit
  - title: Rate Limiting pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/rate-limiting-pattern
  - title: System.Threading.RateLimiting
    url: https://learn.microsoft.com/en-us/dotnet/api/system.threading.ratelimiting
---

## 언제 쓰나

- 한도가 지켜야 할 약속일 때 Sliding Window를 씁니다. 요금제 등급, 키별 API 쿼터, 남용 차단은 모두 숫자를 소리 내어 말하는데, Fixed Window는 경계마다 그 두 배를 조용히 허용합니다. 계산은 어렵지 않습니다. 분당 100이라는 한도는 어느 분의 마지막 1초에 100을, 다음 분의 첫 1초에 다시 100을 받아들이므로 약 2초 안에 200이 되고, 그것도 규칙 안입니다. 누군가 한도를 노리고 트래픽을 배치한다면 바로 그 자리에 배치합니다.
- 대략의 공평함으로 충분하고 메모리가 아까울 때는 Fixed Window에 머무릅니다. 키마다 카운터 하나, 모든 인스턴스가 이미 합의한 시계로 초기화하는 방식은 가장 싼 리미터이고, 값싼 엔드포인트를 대충 지키는 용도라면 이음새가 정말로 문제되지 않을 수도 있습니다. 다만 알고 써야 합니다. 실효 최대치는 설정한 한도의 두 배라고 적어 두고, 뒤에 있는 의존 대상을 그 최대치에 맞춰 잡고, 그 숫자를 계약서에 넣지 않습니다.
- 하류가 개수가 아니라 정형된 속도를 필요로 하면 Leaky Bucket을 꺼냅니다. 초당 서른 번 쓰기를 넘기면 쓰러지는 낡은 시스템, 연결마다 걸어 두는 쓰기 상한, 고르게 폴링해야 하는 장비. 이들 중 무엇도 지난 1분에 몇 개가 왔는지에는 관심이 없고, 둘이 너무 가깝게 오지 않기만을 바랍니다. 창은 예와 아니오만 말할 수 있지만 버킷은 언제인지를 정합니다.
- 규모 있는 남용 차단이 목적이라면 세그먼트 근사가 좋은 선택입니다. 요청마다 시각 하나 대신 키마다 카운터 둘이면 되고, 경계에서 공짜로 되돌려 주던 몫이 사라지며, 실제 트래픽에서의 오차는 작습니다. 운영 리미터 대부분이 실제로 돌리는 방식이고, 이것을 골라서 쓰는 것과 얼결에 Fixed Window에 머무는 것은 전혀 다릅니다.
- 두 질문이 모두 진짜라면 고르지 말고 겹쳐 씁니다. 공개 쿼터에 걸린 Sliding Window는 "이 고객이 이번 시간에 자기 몫을 다 썼는가"에 답하고, 취약한 의존 대상 앞의 Leaky Bucket은 "감당할 수 있는 속도보다 빠르게 아래로 내려가는 것이 있는가"에 답합니다. 자리가 다른 서로 다른 한도이고, 어느 쪽도 다른 쪽을 대신하지 못합니다.

## 주의점

- 이음새는 이론이 아니고, 클라이언트가 동기화되어 있으면 더 나빠집니다. 정각에 재시도하는 클라이언트, 매시 정각에 뜨는 크론, 공유 일정에 맞춰 깨어나는 모바일 앱이 저마다 같은 경계로 트래픽을 밀어 넣으므로, 두 배가 된 버스트는 키 공간에 퍼지지 않고 한꺼번에 도착합니다. Fixed Window를 유지한다면 최소한 키마다 창의 기준점을 흩뜨려 이음새가 겹치지 않게 합니다.
- 정확한 Sliding Window는 키마다 시각 장부를 요구합니다. 도착마다 시각을 저장하고, 판정마다 `now - N`보다 새 항목을 훑고, 훑을 때마다 그보다 오래된 것을 잘라 냅니다. Redis 정렬 집합이 표준적인 구현이고, 자르기는 `ZREMRANGEBYSCORE`, 세기는 `ZCARD`, 기록은 `ZADD`로 한 파이프라인이나 스크립트 안에서 처리합니다. 메모리는 한도 곱하기 활성 키 수에 비례합니다. 한도 100에 키 몇천 개라면 감당할 만하고, 한도 10,000에 키 몇백만 개라면 감당하지 못합니다.
- 두 세그먼트 근사는 패턴의 가장자리에서 조금 더 받거나 조금 덜 받을 수 있습니다. 이전 세그먼트의 도착이 그 구간에 고르게 퍼져 있었다고 가정하므로, 세그먼트 끝에 몰린 버스트를 구간 전체에 퍼진 것처럼 가중합니다. 노린 버스트에서는 창 하나 안에 한도보다 얼마쯤 더 들어옵니다. Fixed Window가 내주는 두 배와는 거리가 멀지만 0도 아닙니다. 남용 차단에는 괜찮고 청구서를 뽑는 용도에는 괜찮지 않으니, 숫자가 곧 돈인 자리에는 정확한 장부를 씁니다.
- Leaky Bucket은 큐잉 지연을 더하는데, 이는 결함이 아니라 원리 그 자체입니다. 버킷이 곧 큐이므로 반쯤 찼을 때 도착한 요청은 앞의 방울들을 기다립니다. 기다림에는 한계가 있어야 합니다. 용량을 제한하거나, 항목마다 기한을 두고 아무도 기다리지 않는 응답을 배달하는 대신 버립니다. 그리고 호출자에게 어느 쪽이었는지 반드시 알립니다. 조용한 40초 대기는 빠른 거절보다 훨씬 나쁩니다.
- 가득 찬 버킷에는 물려받은 것이 아니라 골라 둔 폐기 정책이 필요합니다. 앞을 버리기, 뒤를 버리기, 우선순위로 버리기, 재시도 신호와 함께 거절하기는 모두 나름의 근거가 있고, 지속되는 과부하에서 아주 다르게 움직입니다. 뒤를 버리기가 흔한 기본값인데, 이는 가장 새로운 요청을 벌하며 그 요청의 호출자는 대개 아직 기다리고 있습니다.
- 분산 리미터에는 공유 상태나 정직한 나눗셈이 필요합니다. 노드마다 100인 한도는 노드가 열이면 1,000짜리 한도이고, 로드 밸런싱은 그것을 막아 주지 않습니다. 진짜 한도가 얼마나 불공평하게 퍼지는지만 정할 뿐입니다. 카운터를 한 공유 저장소에 두고 왕복 비용을 내거나, 한도를 노드 수로 나누고 한 노드에 붙은 클라이언트가 10분의 1만 쓴다는 사실을 받아들입니다. 둘 다 괜찮습니다. 괜찮지 않은 것은 노드별 숫자를 진짜 숫자인 척하는 것입니다.
- 재시도 신호는 항상 돌려줍니다. `Retry-After` 없는 거절은 모든 클라이언트에게 두드리는 법을 가르치고, 예의 바른 호출자도 언제 돌아오라는 말을 듣지 못하면 예의를 지킬 수 없습니다. 429를 돌려주고 헤더에 대기 시간을 담되, 그 숫자를 정직하게 만듭니다. 창에 실제로 자리가 생기는 가장 이른 시각이고, Sliding Window는 그것을 정확히 계산할 수 있습니다.
- 창이 벽시계 시각에 맞춰져 있는 곳에서는 시계 오차가 경계를 정합니다. 현재 분을 이름에 넣은 Redis 키가 흔한 형태인데, 시계가 어긋난 노드들은 어떤 요청이 어느 창에 속하는지를 두고도 어긋납니다. 노드를 NTP에 묶어 두거나, 공유 저장소의 시계처럼 하나의 권위에서 창을 끌어옵니다.

## .NET에서는

`System.Threading.RateLimiting`은 이 장면이 그리는 세 알고리즘을 그대로 제공하고, 이름도 정확히 맞아떨어집니다. `FixedWindowRateLimiter`는 키마다 나뉘는, 이음새를 가진 창이고, `SlidingWindowRateLimiter`는 세그먼트 근사이며 `SegmentsPerWindow`가 창을 몇 조각으로 자를지를 정합니다. `TokenBucketRateLimiter`는 허용량을 모아 두는 형제입니다.

```csharp
// 1분 창을 10초짜리 여섯 조각으로 자릅니다. 전체 카운트가 한꺼번에 초기화되는
// 대신 가장 오래된 조각이 10초마다 만료되므로, 한도를 통째로 되돌려 주는 순간이
// 존재하지 않습니다.
var limiter = new SlidingWindowRateLimiter(new SlidingWindowRateLimiterOptions
{
    Window = TimeSpan.FromMinutes(1),
    SegmentsPerWindow = 6,
    PermitLimit = 100,
    QueueLimit = 0,                                   // 기다리게 하지 않고 거절합니다
    QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
});

using var lease = await limiter.AcquireAsync(permitCount: 1);
if (!lease.IsAcquired) return Results.StatusCode(429);
```

조각이 많을수록 근사가 촘촘해지고 카운터도 늘어납니다. 여섯은 무난한 출발점입니다. 다만 이것은 위에서 말한 가중 버킷 쌍과는 다른 근사입니다. .NET은 `SegmentsPerWindow`개의 카운터를 두고, `Window`/`SegmentsPerWindow`마다 가장 오래된 세그먼트의 퍼밋을 가중 없이 통째로 되돌려 줍니다. 남는 오차는 도착이 어떻게 퍼졌는지에 대한 가정이 아니라 세그먼트의 굵기 자체입니다. 세그먼트 끝에 온 도착은 최대 한 세그먼트만큼 일찍 잊히고, 이 오차는 `SegmentsPerWindow`가 커질수록 줄어듭니다.

ASP.NET Core에서는 같은 리미터를 rate limiting 미들웨어로 엮되 전역이 아니라 클라이언트별 키로 겁니다. 하나의 한도를 키마다 하나씩으로 바꿔 주는 것이 `PartitionedRateLimiter`입니다.

```csharp
builder.Services.AddRateLimiter(options =>
{
    options.AddPolicy("per-key", httpContext =>
        RateLimitPartition.GetSlidingWindowLimiter(
            partitionKey: httpContext.User.Identity?.Name ?? "anonymous",
            factory: _ => new SlidingWindowRateLimiterOptions
            {
                Window = TimeSpan.FromMinutes(1),
                SegmentsPerWindow = 6,
                PermitLimit = 100,
            }));

    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.OnRejected = async (context, token) =>
    {
        // 언제 돌아오라는 말 없이 거절하지 않습니다.
        if (context.Lease.TryGetMetadata(MetadataName.RetryAfter, out var after))
            context.HttpContext.Response.Headers.RetryAfter =
                ((int)after.TotalSeconds).ToString(CultureInfo.InvariantCulture);
        await context.HttpContext.Response.WriteAsync("rate limited", token);
    };
});

app.UseAuthentication();   // 키가 User에서 나오므로 이것이 먼저 돌아야 합니다
app.UseRateLimiter();
app.MapGet("/report", GetReport).RequireRateLimiting("per-key");
```

`User`에서 뽑는 키는 리미터보다 앞에 `UseAuthentication`이 있어야 하고, 그 시점에 아직 익명인 호출자는 모두 버킷 하나를 나눠 쓰므로 그쪽은 클라이언트 IP나 API 키로 나눕니다.

이 리미터들은 한 프로세스 안에 살기 때문에 인스턴스가 여럿이면 설정한 숫자는 노드별 숫자입니다. 인스턴스 전체에서 지켜야 하는 한도라면 창을 공유 저장소에 두고 거기서 판정합니다. 정확한 형태는 키마다 시각을 점수로 갖는 정렬 집합이고, 자르기와 세기를 하나의 원자적 스크립트 안에서 처리합니다.

```lua
-- KEYS[1] 키, ARGV[1] 지금(ms), ARGV[2] 창 길이(ms), ARGV[3] 한도,
-- ARGV[4] 이 요청의 고유 id. 같은 밀리초에 도착한 둘이 서로 덮어쓰지 않고
-- 별개 멤버가 되게 합니다
redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, ARGV[1] - ARGV[2])
local used = redis.call('ZCARD', KEYS[1])
if used >= tonumber(ARGV[3]) then
  -- 빠져나가야 하는 것은 가장 오래된 항목이므로 그 만료가 정직한 대기 시간입니다.
  local oldest = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
  return { 0, oldest[2] + ARGV[2] - ARGV[1] }
end
redis.call('ZADD', KEYS[1], ARGV[1], ARGV[1] .. ':' .. ARGV[4])
redis.call('PEXPIRE', KEYS[1], ARGV[2])
return { 1, 0 }
```

세는 대신 펴는 쪽이 목적이라면 `QueueLimit`을 0보다 크게 준 `TokenBucketRateLimiter`가 버킷이 비고 나서부터는 호출자 쪽에서 보기에 Leaky Bucket처럼 움직입니다. 요청은 거절당하는 대신 퍼밋을 기다리고, 퍼밋은 일정한 속도로 도착합니다. 그 전까지는 여전히 Token Bucket입니다. 놀고 있던 버킷은 `TokenLimit`까지 토큰을 모아 두었다가 한꺼번에 쓰므로, 첫 요청부터 펴고 싶다면 `TokenLimit`을 `TokensPerPeriod`보다 크지 않게 두어 쓸 버스트가 없게 합니다. 경계 있는 채널 하나와 `PeriodicTimer`로 당겨 가는 단일 리더로 짠 `System.Threading.Channels`도 같은 모양을 손으로 쓴 것이며, 펴야 할 대상이 남의 인바운드가 아니라 우리 쪽 아웃바운드일 때 꺼내기 좋습니다.
