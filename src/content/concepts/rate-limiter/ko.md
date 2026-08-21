---
title: "Rate Limiter"
summary: "Rate Limiter는 한 호출자가 일정 시간 안에 보낼 수 있는 요청 수를 제한합니다. 보통은 Token Bucket으로 구현합니다. 토큰이 일정한 속도로 채워지고, 요청마다 하나씩 쓰며, 버킷이 비면 요청은 거부됩니다."
category: "복원력과 장애 대응"
scene: rate-limiter
steps:
  - title: "Token Bucket"
    text: "토큰이 일정한 속도로 채워집니다. 요청마다 토큰 하나를 쓰고 통과하므로 버킷은 거의 가득 찬 채로 유지됩니다."
  - title: "버스트"
    text: "가득 찬 버킷은 크기만큼의 버스트를 받아 줍니다. 버킷이 비면 그 뒤의 요청은 모두를 느리게 만드는 대신 429로 거부됩니다."
  - title: "Retry-After"
    text: "429 응답에는 언제 다시 오면 되는지가 담깁니다. 이를 지키는 클라이언트는 리필 뒤에 돌아오고, 버스트는 고른 흐름으로 바뀝니다."
  - title: "파티션"
    text: "제한은 클라이언트, 테넌트, 엔드포인트 같은 키별로 둡니다. 시끄러운 호출자 하나는 자기 버킷만 비웁니다. 인스턴스가 여럿이면 버킷을 공유 저장소에 둡니다."
related:
  - label: Token Bucket
    slug: token-bucket
  - label: Leaky Bucket
    slug: leaky-bucket
  - label: Fixed Window
    slug: fixed-window
  - label: Sliding Window
    slug: sliding-window
  - label: Concurrency Limiter
    slug: concurrency-limiter
  - label: Throttling
    slug: throttling
  - label: Quota
    slug: quota
  - label: Load Shedding
    slug: load-shedding
  - label: Retry
    slug: retry
  - label: Circuit Breaker
    slug: circuit-breaker
references:
  - title: Rate limiting middleware in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/performance/rate-limit?view=aspnetcore-10.0
  - title: Rate Limiting pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/rate-limiting-pattern
  - title: System.Threading.RateLimiting
    url: https://learn.microsoft.com/en-us/dotnet/api/system.threading.ratelimiting
---

## 언제 쓰나

- 공개 API나 여러 사용자가 함께 쓰는 API에서 호출자 하나가 다른 호출자를 밀어낼 수 있을 때
- 전체 용량만이 아니라 클라이언트, 테넌트, 엔드포인트마다 확실한 상한이 필요할 때
- 버스트가 일상적이고, 정해진 크기까지는 허용하고 싶을 때

## 주의점

- 인스턴스마다 두는 제한은 인스턴스 수만큼 곱해집니다. 전체에 하나의 제한을 두려면 버킷을 Redis 같은 공유 저장소에 두어야 합니다.
- 429를 보낼 때는 `Retry-After`를 항상 함께 보냅니다. 그것이 없으면 거부된 클라이언트가 곧바로 다시 시도해 상황을 더 나쁘게 만듭니다.
- Rate Limit과 Concurrency Limit은 다릅니다. 하나는 시간 구간마다의 요청 수를 제한하고, 다른 하나는 동시에 처리 중인 요청 수를 제한합니다. 대부분의 서비스에는 둘 다 필요합니다.
- 키를 신중하게 고릅니다. IP로 제한하면 NAT 뒤에 있는 사용자가 모두 함께 벌을 받습니다. API 키나 사용자 단위로 제한하는 편이 대체로 공평합니다.

## .NET에서는

ASP.NET Core의 rate limiting 미들웨어를 사용합니다.

```csharp
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.OnRejected = (context, _) =>
    {
        if (context.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retryAfter))
            context.HttpContext.Response.Headers.RetryAfter =
                ((int)retryAfter.TotalSeconds).ToString();
        return ValueTask.CompletedTask;
    };
    options.AddPolicy("per-client", httpContext =>
        RateLimitPartition.GetTokenBucketLimiter(
            partitionKey: httpContext.User.Identity?.Name ?? "anonymous",
            factory: _ => new TokenBucketRateLimiterOptions
            {
                TokenLimit = 20,
                TokensPerPeriod = 10,
                ReplenishmentPeriod = TimeSpan.FromSeconds(1),
                QueueLimit = 0,
                AutoReplenishment = true,
            }));
});

var app = builder.Build();
app.UseRateLimiter();
app.MapGet("/orders", () => Results.Ok())
   .RequireRateLimiting("per-client");
```

`System.Threading.RateLimiting`에는 fixed window, sliding window, token bucket, concurrency limiter가 모두 들어 있습니다. 인스턴스가 여럿일 때는 제한을 그 앞단이나 공유 상태에 두어야 하므로, 프로세스마다 두는 limiter 대신 API gateway나 Redis 기반 limiter를 씁니다.
