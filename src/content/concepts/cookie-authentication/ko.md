---
title: "Cookie Authentication"
summary: "Cookie authentication은 로그인한 사용자에게 쿠키를 심고, 그 뒤로 브라우저가 그 사이트로 가는 모든 요청에 쿠키를 자동으로 붙이는 방식입니다. 요청이 내 페이지에서 왔는지 남의 페이지에서 왔는지는 가리지 않습니다. 그 자동성이 곧 편리함이고, cross-site request forgery가 노리는 것도 바로 그 지점입니다."
category: "인증과 인가"
scene: cookie-authentication
steps:
  - title: "쿠키로 로그인 상태가 됩니다"
    text: "한 번 로그인하면 서버가 쿠키를 심고, 그 뒤로는 브라우저가 이 사이트로 가는 모든 요청에 알아서 쿠키를 붙입니다. HttpOnly는 스크립트가 읽지 못하게 막습니다. 페이지가 만질 수 없는 것을 브라우저가 대신 나릅니다."
  - title: "자동이라는 말은 가리지 않는다는 뜻입니다"
    text: "당신이 만들지 않은 페이지가 당신 사이트로 폼을 제출해도 브라우저는 똑같이 쿠키를 붙입니다. 서버에게는 로그인된 요청으로 보일 뿐, 당신 페이지에서 온 것인지 남의 페이지에서 온 것인지 구별할 수 없습니다. 그것이 cross-site request forgery이고, 쿠키가 그 운반 수단입니다."
  - title: "SameSite가 첫 번째 선을 긋습니다"
    text: "쿠키에 Lax를 표시하면 다른 사이트발 POST에는 실리지 않습니다. 위조된 요청은 맨몸으로 도착해 실패합니다. 최상위 이동에는 여전히 실리므로 링크는 계속 동작합니다. Strict는 그 문마저 닫는 대신, 밖에서 들어오는 모든 링크가 로그아웃 상태로 시작하게 됩니다."
  - title: "당신 페이지만 되돌려 줄 수 있는 토큰"
    text: "서버는 폼 안에 antiforgery 토큰을 심어 둡니다. 진짜 제출은 쿠키와 토큰을 함께 돌려주지만, 위조된 쪽은 페이지를 읽을 수 없으니 토큰을 되돌려 줄 수 없습니다. SameSite와 출처 확인을 겹쳐 두면, 각 선은 다르게 실패하고 함께일 때 버팁니다."
related:
  - label: SameSite Cookie
    slug: samesite-cookie
  - label: Cross-Site Request Forgery
    slug: cross-site-request-forgery
  - label: Antiforgery Token
    slug: antiforgery-token
  - label: Same-Origin Policy
    slug: same-origin-policy
  - label: Origin Validation
    slug: origin-validation
  - label: CORS
    slug: cors
  - label: Bearer Token
    slug: bearer-token
  - label: Access Token
    slug: access-token
  - label: Distributed Session
    slug: distributed-session
  - label: Sticky Session
    slug: sticky-session
references:
  - title: "Use cookie authentication without ASP.NET Core Identity"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/authentication/cookie?view=aspnetcore-10.0
  - title: "Prevent Cross-Site Request Forgery (XSRF/CSRF) attacks in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/anti-request-forgery?view=aspnetcore-10.0
  - title: "Work with SameSite cookies in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/samesite?view=aspnetcore-10.0
  - title: "Set-Cookie"
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie
---

## 언제 쓰나

- 브라우저가 곧 클라이언트인 퍼스트파티 웹 앱입니다. 서버 렌더링 페이지, Razor Pages, MVC, Blazor Server처럼 요청을 보내는 주체와 자격 증명을 보관하는 주체가 같으면, 자격 증명을 들고 다니게 하는 데 코드가 한 줄도 들지 않습니다.
- 싱글 페이지 앱 앞에 두는 backend-for-frontend입니다. 브라우저는 쿠키로 BFF와 이야기하고 BFF는 토큰으로 API와 이야기하므로, 토큰이 자바스크립트까지 내려오지 않습니다. 이 패턴이 존재하는 이유가 바로 쿠키 쪽이 더 안전한 절반이기 때문입니다.
- 스크립트가 자격 증명을 읽을 수 없어야 하는 경우입니다. `HttpOnly`는 `localStorage`에 담긴 토큰이 결코 가질 수 없는 성질이고, 원래라면 토큰을 통째로 빼앗겼을 cross-site scripting 결함이 페이지가 열려 있는 동안 세션을 쓰는 정도로 그치는 이유이기도 합니다.
- 탭을 닫거나 새로 고치거나 브라우저가 죽어도 세션이 살아남아야 하는데, 그 저장 코드를 직접 쓰고 싶지 않은 경우입니다. 만료와 갱신, 크기 제한은 브라우저의 몫입니다.
- 로그아웃이 실제로 의미를 가져야 하는 경우입니다. 서버 상태를 등에 업은 쿠키 세션은 그 자리에서 무효로 만들 수 있지만, 스스로 완결된 토큰은 그렇게 하지 못합니다.

## 주의점

- cross-site request forgery 방어가 없는 쿠키 인증은 열린 문이고, 기본값 상태가 이미 열린 문입니다. 브라우저가 쿠키를 붙이는 이유는 요청이 당신 사이트로 갔기 때문이지 당신 페이지가 보냈기 때문이 아닙니다. 상태를 바꾸는 엔드포인트는 전부 남의 페이지에서도 닿을 수 있다고 가정합니다.
- 브라우저 기본값에 기대지 않고 `SameSite=Lax`를 명시적으로 지정합니다. 요즘 주요 브라우저의 기본값이 `Lax`이긴 하지만, 속성 없이 쓴 쿠키는 사용자의 브라우저가 올해 어떤 결정을 내렸는지에 운명을 맡기는 셈이고, 오래된 클라이언트는 여전히 `None`으로 동작합니다.
- `Lax`가 답의 전부는 아닙니다. 다른 사이트발 POST에서는 쿠키를 붙잡아 두지만 최상위 GET 이동에는 여전히 실리므로, GET으로 상태를 바꾸는 엔드포인트는 그대로 위조 가능합니다. GET으로 상태를 바꾸지 마세요. 상태를 바꾸는 쪽에는 antiforgery 토큰을 답니다.
- `Strict`는 이동하는 문까지 닫고, 그만큼 값을 치릅니다. 검색 결과나 메일 링크로 들어온 사용자는 로그아웃 상태로 도착했다가 다음 클릭에서 다시 로그인하게 됩니다. 은행에는 맞는 설정이고 콘텐츠 사이트에는 맞지 않는 설정입니다.
- `HttpOnly`와 `Secure`는 항상 켜고, 가능하면 `__Host-` 접두사까지 씁니다. `HttpOnly`는 쿠키를 `document.cookie`에서 빼내고, `Secure`는 평문 연결에 실리지 않게 하며, `__Host-` 접두사는 `Domain` 속성 없이 정확히 한 호스트에 쿠키를 묶어 놓아 옆 서브도메인이 뚫렸을 때 내 사이트가 받아들일 쿠키를 심는 일을 막습니다.
- 로그인 시점에 쿠키를 새로 발급합니다. session fixation은 피해자가 로그인하기 전에 공격자가 이미 아는 세션 식별자를 브라우저에 심어 두고, 로그인이 끝나면 그 세션을 그대로 타는 공격입니다. 인증이 끝난 뒤 `SignInAsync`를 호출하는 것이 새 식별자를 만드는 일입니다.
- 수명이 긴 쿠키는 그것이 닿는 모든 창을 넓힙니다. 슬라이딩 만료는 활동 중인 사용자를 로그인 상태로 두면서도 놀고 있는 세션에는 무한한 수명을 주지 않고, 그 위에 절대 만료를 얹으면 훔친 쿠키가 값어치를 갖는 기간에 천장이 생깁니다.
- 쿠키는 어디까지나 브라우저의 자격 증명입니다. 모바일 앱, 데몬, 데이터센터에서 API를 부르는 서비스에는 쿠키 저장고도 없고 SameSite의 보호도 없습니다. 그런 호출자에게는 토큰이 맞고, 한 엔드포인트에 두 방식을 섞으면 그 엔드포인트의 안전도는 둘 중 약한 쪽을 따라갑니다.
- 규모도 실제 제약입니다. 암호화된 principal을 담은 쿠키는 모든 요청에 실려 다니고 크기 상한이 약 4 KB이므로, 클레임이 많다면 서버 쪽에 두고 쿠키에는 키만 담습니다.

## .NET에서는

스킴은 한 번만 등록하면 되고, 옵션이 곧 보안 태세 전부입니다. 아래에서 그냥 두어도 되는 기본값은 하나도 없습니다.

```csharp
builder.Services
    .AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(options =>
    {
        options.Cookie.Name = "__Host-session";
        options.Cookie.HttpOnly = true;                        // no script may read it
        options.Cookie.SecurePolicy = CookieSecurePolicy.Always;
        options.Cookie.SameSite = SameSiteMode.Lax;            // set it, never inherit it
        options.ExpireTimeSpan = TimeSpan.FromHours(8);
        options.SlidingExpiration = true;
        options.LoginPath = "/signin";
        // An API call must get a status code, not a redirect to a login page.
        options.Events.OnRedirectToLogin = context =>
        {
            if (context.Request.Path.StartsWithSegments("/api"))
            {
                context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                return Task.CompletedTask;
            }
            context.Response.Redirect(context.RedirectUri);
            return Task.CompletedTask;
        };
    });

builder.Services.AddAntiforgery(options => options.HeaderName = "X-CSRF-TOKEN");
```

쿠키를 만들어 내는 것은 `SignInAsync`이고, 이 호출이 session fixation을 닫는 지점입니다. 브라우저가 그전까지 들고 있던 식별자는 서버가 방금 만든 것으로 교체됩니다.

```csharp
var claims = new List<Claim>
{
    new(ClaimTypes.NameIdentifier, user.Id),
    new(ClaimTypes.Name, user.DisplayName),
};
var identity = new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme);

await HttpContext.SignInAsync(
    CookieAuthenticationDefaults.AuthenticationScheme,
    new ClaimsPrincipal(identity),
    new AuthenticationProperties { IsPersistent = rememberMe });
```

antiforgery 쪽은 별개의 절반이고, 사람들이 잊는 쪽도 이쪽입니다. MVC와 Razor Pages에서는 form 태그 헬퍼가 숨은 필드를 대신 써 주고 `[ValidateAntiForgeryToken]`이 그것을 검사합니다. 다만 전역에 `[AutoValidateAntiforgeryToken]`을 거는 편이 대개 더 나은 모양입니다. 안전하지 않은 메서드 전부를 검사하고 GET은 건드리지 않으므로, 새 액션을 만들 때마다 누군가 특성을 기억해 주기를 바라지 않아도 됩니다.

```csharp
builder.Services.AddControllersWithViews(options =>
    options.Filters.Add(new AutoValidateAntiforgeryTokenAttribute()));
```

Minimal API는 antiforgery 미들웨어에서 같은 보호를 받습니다. 이 미들웨어는 인증 뒤에 돌면서, 폼을 실은 안전하지 않은 요청마다 토큰을 검사합니다.

```csharp
app.UseAuthentication();
app.UseAuthorization();
app.UseAntiforgery();

app.MapPost("/transfer", (TransferRequest request) => Results.Ok())
   .RequireAuthorization();
```

토큰을 직접 확인해야 하는 엔드포인트, 예를 들어 스크립트가 헤더에 실어 보내는 fetch 같은 경우에는 `IAntiforgery.ValidateRequestAsync`가 그 호출이고, 페이지에 돌려줄 토큰을 건네주는 것은 `GetAndStoreTokens`입니다.

```csharp
app.MapGet("/antiforgery/token", (IAntiforgery antiforgery, HttpContext context) =>
{
    var tokens = antiforgery.GetAndStoreTokens(context);
    return Results.Ok(new { token = tokens.RequestToken });
});

app.MapPost("/api/transfer", async (IAntiforgery antiforgery, HttpContext context) =>
{
    await antiforgery.ValidateRequestAsync(context);   // throws when it does not match
    return Results.Ok();
});
```

이 토큰은 하나의 값이 아니라 한 쌍입니다. 한쪽은 따로 쓰이는 쿠키에, 다른 쪽은 폼이나 헤더에 들어가고, 검증은 둘이 맞는지를 봅니다. 위조된 페이지가 이것을 만들어 낼 수 없는 이유가 여기 있습니다. 세션 쿠키를 보내게 할 수도 있고 antiforgery 쿠키를 보내게 할 수도 있지만, 필드에 무엇을 넣어야 하는지는 당신 페이지를 읽어야 알 수 있고, 두 짝은 서로 맞아야 합니다.

같은 태세에 속하는 조각이 둘 더 있습니다. `IUserClaimsPrincipalFactory`나 `OnValidatePrincipal`은 세션을 살아 있는 중간에 데이터베이스와 다시 대조하는 자리이고, 이미 발급된 쿠키를 들고 있는 비활성 계정이 더는 그것을 쓰지 못하게 되는 것도 여기서입니다. 그리고 쿠키는 data protection 키로 암호화되므로 서버 팜은 키 링을 공유해야 합니다. 키 링을 공유하지 않으면 요청이 서로 다른 기계에 닿을 때마다 사용자가 무작위로 로그아웃되는 증상으로 드러납니다.
