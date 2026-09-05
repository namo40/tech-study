---
title: "Rate Limiter"
summary: "Rate Limiter は、1 つの呼び出し元が一定時間内に送れるリクエスト数を制限します。通常は Token Bucket で実装します。トークンが一定の速度でたまり、リクエストごとに 1 つ使い、バケットが空になるとリクエストは拒否されます。"
category: "回復性と障害対応"
scene: rate-limiter
steps:
  - title: "Token Bucket"
    text: "トークンは一定の速度でたまります。リクエストごとにトークンを 1 つ使って通過するので、バケットはほぼ満杯のままです。"
  - title: "バースト"
    text: "満杯のバケットは、その大きさまでのバーストを受け止めます。空になると、以降のリクエストは全体を遅くする代わりに 429 で拒否されます。"
  - title: "Retry-After"
    text: "429 応答には、いつ戻ればよいかのヒントが含まれます。それを守るクライアントは補充のあとに戻ってきて、今度は通ります。"
  - title: "パーティション"
    text: "制限はクライアント、テナント、エンドポイントなどのキーごとに設けます。騒がしい呼び出し元は自分のバケットだけを空にし、ほかの呼び出し元のトークンは減りません。"
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

## いつ使うか

- 公開 API や複数のユーザーが共有する API で、1 つの呼び出し元がほかを押しのけられる場合
- 全体の容量だけでなく、クライアント、テナント、エンドポイントごとに明確な上限が必要な場合
- バーストが日常的で、決めた大きさまでは許したい場合

## 注意点

- インスタンスごとに置く制限は、インスタンス数だけ掛け算になります。全体に 1 つの制限を置くなら、バケットは Redis のような共有ストアに置く必要があります。
- 429 を返すときは `Retry-After` を必ず添えます。それがないと、拒否されたクライアントはすぐに再試行し、状況をさらに悪くします。
- Rate Limit と Concurrency Limit は別のものです。一方は時間区間あたりのリクエスト数を制限し、もう一方は同時に処理中のリクエスト数を制限します。多くのサービスには両方が必要です。
- キーは慎重に選びます。IP で制限すると NAT の内側にいるユーザーがまとめて巻き添えになります。API キーやユーザー単位で制限するほうが、たいていは公平です。

## .NET では

ASP.NET Core の rate limiting ミドルウェアを使います。

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
app.UseAuthentication();   // これがないと User が空になり、すべての呼び出し元が 1 つのバケットを共有する
app.UseRateLimiter();
app.MapGet("/orders", () => Results.Ok())
   .RequireRateLimiting("per-client");
```

`User` から取るキーは認証が走ってはじめて存在するので、`UseRateLimiter` は `UseAuthentication` の後に置きます。`UseRouting` を明示的に呼ぶアプリでは、その後でもあります。ポリシーはエンドポイントごとに付くからです。その時点でまだ匿名の呼び出し元はすべて `"anonymous"` のバケットを共有するので、クライアント IP や API キーのように、確かに持っているもので分割します。

`System.Threading.RateLimiting` には fixed window、sliding window、token bucket、concurrency limiter がすべて含まれています。インスタンスが複数ある場合は制限をその手前か共有状態に置く必要があるので、プロセスごとの limiter ではなく API gateway や Redis ベースの limiter を使います。
