---
title: "Middleware Pipeline"
summary: "Middleware Pipeline은 각 구성 요소가 들어오는 요청을 한 번, 나가는 응답을 역순으로 한 번 보는 사슬입니다. 어느 것이든 사슬을 끊을 수 있고, 그 순서가 곧 애플리케이션 가장자리의 설계입니다."
category: ".NET 런타임과 호스팅"
scene: middleware-pipeline
steps:
  - title: "들어갔다가 나옵니다"
    text: "요청은 모든 미들웨어를 차례로 지나 Endpoint에 닿고, 응답은 같은 미들웨어를 역순으로 거슬러 올라옵니다. 각 미들웨어는 자기 아래 전부를 감쌉니다."
  - title: "단락"
    text: "미들웨어는 다음을 부르지 않고 직접 응답할 수 있습니다. Authentication의 401이나 Static files가 바로 돌려주는 파일이 그렇습니다. 그 아래 층은 전혀 실행되지 않습니다."
  - title: "예외는 거슬러 올라옵니다"
    text: "Endpoint에서 던진 예외는 모든 미들웨어를 거꾸로 타고 올라옵니다. 가장 바깥 것만 그것을 제대로 된 500으로 바꿀 수 있으므로, 예외 처리기는 맨 앞에 둡니다."
  - title: "순서가 곧 설계입니다"
    text: "같은 미들웨어라도 순서가 다르면 다른 애플리케이션입니다. 예외 처리기는 맨 앞, 값싼 보호는 비싼 작업보다 앞, Authentication은 Authorization보다 앞, Endpoint는 맨 뒤입니다."
related:
  - label: Endpoint Routing
    slug: endpoint-routing
  - label: Minimal APIs
    slug: minimal-apis
  - label: Controllers
    slug: controllers
  - label: Kestrel
    slug: kestrel
  - label: Rate Limiter
    slug: rate-limiter
  - label: Authentication
    slug: authentication
  - label: Authorization
    slug: authorization
  - label: CORS
    slug: cors
  - label: Application Lifetime
    slug: application-lifetime
references:
  - title: ASP.NET Core middleware
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/middleware/?view=aspnetcore-10.0
  - title: Write custom ASP.NET Core middleware
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/middleware/write?view=aspnetcore-10.0
  - title: ASP.NET Core APIs overview
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/apis?view=aspnetcore-10.0
---

## 언제 쓰나

- 모든 요청이나 모든 응답을 반드시 봐야 하는 일. 오류 처리, HTTPS 리디렉션, 정적 파일, 라우팅, CORS, Authentication, Authorization, rate limiting, 압축, 로깅이 그렇습니다.
- 엔드포인트마다 되풀이해서는 안 되는 공통 관심사

## 주의점

- 순서는 겉모습의 문제가 아닙니다. `UseExceptionHandler`를 맨 앞에, `UseStaticFiles`는 `UseRouting`보다 앞에, `UseRouting`은 어떤 엔드포인트가 선택되었는지 알아야 하는 모든 것보다 앞에, `UseAuthentication`은 `UseAuthorization`보다 앞에, 엔드포인트는 맨 뒤에 둡니다.
- `next` 호출을 잊은 미들웨어는 조용히 사슬을 끊습니다. 끊는다면 의도해서 끊습니다.
- `next`를 부르기 전에 응답 본문을 쓰고 나서, 뒤쪽 미들웨어가 헤더를 바꿔 주기를 기대하지 않습니다. 그때는 헤더가 이미 나간 뒤입니다.
- 미들웨어 안의 요청별 작업은 가볍게 유지합니다. 뒤쪽 미들웨어가 어차피 거절할 요청까지 포함해 모든 요청에서 실행되기 때문입니다.

## .NET에서는

```csharp
var app = builder.Build();

app.UseExceptionHandler();
app.UseHttpsRedirection();
app.UseStaticFiles();
app.UseRouting();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

// A middleware sees the request on the way in and the response on the way out.
app.Use(async (context, next) =>
{
    var started = Stopwatch.GetTimestamp();
    await next(context);                       // everything below runs here
    var elapsed = Stopwatch.GetElapsedTime(started);
    context.Response.Headers["X-Elapsed-Ms"] = elapsed.TotalMilliseconds.ToString("F0");
});

app.MapGet("/orders/{id:int}", (int id) => Results.Ok(new { id }))
   .RequireAuthorization()
   .RequireRateLimiting("per-client");

app.Run();
```

`Map`은 경로에 따라 파이프라인을 분기하고, `Run`은 언제나 사슬을 끝내는 종단 미들웨어이며, `AddEndpointFilter`로 등록하는 엔드포인트 필터는 라우팅이 이미 엔드포인트를 고른 뒤에 실행되는 더 가벼운 대안입니다.
