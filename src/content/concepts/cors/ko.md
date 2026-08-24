---
title: "CORS"
summary: "CORS는 다른 origin의 페이지가 응답을 읽어도 되는지 브라우저가 서버에게 묻는 절차입니다. 요청 자체는 대개 서버까지 도달하며, CORS가 정하는 것은 페이지가 그 답을 볼 수 있는지입니다. 브라우저가 아닌 클라이언트에게는 아무런 경계도 되지 않습니다."
category: "애플리케이션 보안"
scene: cors
steps:
  - title: "요청은 가고, 답은 막힌다"
    text: "shop.example의 페이지가 api.example을 호출합니다. 서버는 두 번 다 처리합니다. 브라우저는 두 번 다 응답을 버립니다. 서버가 이 origin이 읽어도 된다고 말한 적이 없기 때문입니다."
  - title: "정확히 허용한다"
    text: "서버가 읽어도 되는 origin을 지목하면 브라우저가 그 응답을 통과시킵니다. 와일드카드는 공개 데이터에는 괜찮지만 쿠키와 함께는 절대 안 됩니다."
  - title: "Preflight"
    text: "단순한 GET이나 폼 전송을 넘어서는 요청이면 브라우저가 먼저 OPTIONS로 어떤 메서드와 헤더가 허용되는지 묻고, 답을 캐시한 뒤에야 실제 요청을 보냅니다. 서버가 목록에 넣지 않은 메서드는 브라우저를 떠나지도 않습니다."
  - title: "보안 경계가 아니다"
    text: "서버, 스크립트, curl은 브라우저의 관문을 아예 보지 않습니다. 악의적인 페이지는 여전히 브라우저가 사용자의 쿠키를 API로 보내게 만들 수 있습니다. CORS는 답만 숨깁니다. 요청 자체를 막는 것은 SameSite 쿠키와 antiforgery 토큰의 일입니다."
related:
  - label: Same-Origin Policy
    slug: same-origin-policy
  - label: Cross-Site Request Forgery
    slug: cross-site-request-forgery
  - label: SameSite Cookie
    slug: samesite-cookie
  - label: Antiforgery Token
    slug: antiforgery-token
  - label: Origin Validation
    slug: origin-validation
  - label: Cookie Authentication
    slug: cookie-authentication
  - label: Bearer Token
    slug: bearer-token
  - label: Authorization Code
    slug: authorization-code
  - label: API Gateway
    slug: api-gateway
references:
  - title: "Enable Cross-Origin Requests (CORS) in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/cors?view=aspnetcore-10.0
  - title: "Prevent Cross-Site Request Forgery (XSRF/CSRF) attacks in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/anti-request-forgery?view=aspnetcore-10.0
  - title: "Fetch Standard, CORS protocol"
    url: https://fetch.spec.whatwg.org/#http-cors-protocol
---

## 언제 쓰나

- 한 origin의 브라우저 페이지가 다른 origin의 API 응답을 읽어야 할 때 씁니다. 호스트가 다른 자체 API를 호출하는 단일 페이지 앱, 고객사 사이트에 심는 위젯, 서브도메인으로 나뉜 프런트엔드가 여기에 해당합니다.
- 서드파티 웹 앱이 소비하는 공개 API에는 반드시 필요합니다. CORS 헤더가 없으면 그런 앱들은 호출은 되는데 아무것도 받지 못하고, 그쪽 개발자에게는 API가 고장 난 것처럼 보입니다.
- 클라이언트가 브라우저일 때만 의미가 있습니다. 서버 간 호출, 백그라운드 작업, 모바일 앱, 명령줄 도구는 CORS를 아예 참조하지 않으므로 이들을 위해 헤더를 추가해도 달라지는 것이 없습니다.

## 주의점

- CORS는 요청이 서버에 닿는 것을 막지 않고, 페이지가 응답을 읽는 것을 막습니다. 상태를 바꾸는 엔드포인트는 CORS가 아니라 SameSite 쿠키와 antiforgery 토큰으로 보호해야 합니다.
- `Access-Control-Allow-Origin: *`와 자격 증명을 절대 함께 쓰지 말고 정확한 origin을 나열하세요. 와일드카드는 데이터가 공개라는 브라우저용 신호이며, 브라우저는 그것을 쿠키나 `Authorization` 헤더와 짝지어 주지 않습니다.
- `Origin` 헤더를 확인 없이 그대로 되돌려 주지 마세요. 목록 대조 없이 반사한 origin에 `Allow-Credentials: true`까지 붙으면 인터넷의 모든 사이트에게 문을 열어 준 것과 같습니다.
- Preflight는 왕복 한 번을 더 씁니다. `Access-Control-Max-Age`를 설정하고 커스텀 헤더는 최소로 유지하세요. 단순 요청에 해당하는 메서드와 콘텐츠 타입 안에 머무르면 질문 자체가 생기지 않습니다.
- `UseCors`는 라우팅 뒤, 인증과 인가 앞에 두어야 인증이 preflight를 거절하기 전에 답이 나갑니다. `OPTIONS` 요청은 자격 증명을 싣지 않으므로, 인가 필터가 먼저 돌면 preflight가 거절당하고 실제 요청은 나가지도 않습니다.
- 무엇을 노출하는지 이해하지 못한 채 전부 자기 origin으로 프록시해서 CORS를 "해결"하지 마세요. 프록시를 두면 모든 호출이 동일 origin이 되고, 브라우저는 아무것도 확인하지 않게 됩니다.

## .NET에서는

ASP.NET Core는 CORS를 이름 붙인 정책으로 구성하고 미들웨어로 적용합니다. antiforgery 설정을 바로 옆에 두는 이유는 두 기능이 같은 질문의 서로 다른 절반을 담당하기 때문입니다.

```csharp
builder.Services.AddCors(options =>
{
    options.AddPolicy("shop", policy => policy
        .WithOrigins("https://shop.example")
        .WithMethods("GET", "PUT")
        .WithHeaders("Content-Type", "Authorization")
        .AllowCredentials()
        .SetPreflightMaxAge(TimeSpan.FromHours(1)));
});
builder.Services.AddAntiforgery(options => options.Cookie.SameSite = SameSiteMode.Lax);

var app = builder.Build();
app.UseRouting();
app.UseCors("shop");          // after routing, before auth
app.UseAuthentication();
app.UseAuthorization();
app.UseAntiforgery();

app.MapPut("/orders/{id:int}", UpdateOrder).RequireCors("shop").RequireAuthorization();
```

`WithOrigins`는 스킴과 기본값이 아닌 포트까지 포함한 정확한 origin을 받고 문자열로 비교하므로 `https://shop.example`와 `https://shop.example/`은 같은 값이 아닙니다. `AllowAnyOrigin`과 `AllowCredentials`를 함께 쓰면 예외가 납니다. 어차피 브라우저가 거부할 헤더를 프레임워크가 미리 막는 것입니다. 여러 origin을 한 묶음으로 받아야 한다면 직접 작성한 조건자를 `SetIsOriginAllowed`에 넘기되, 받은 값을 그대로 돌려주는 대신 확인하는 코드로 만드세요.

서버 간 호출과 모바일 앱은 이 과정을 전혀 거치지 않으므로 인가는 토큰과 정책으로 따로 해야 합니다. 같은 `PUT /orders/{id}`를 호출하는 백그라운드 서비스에는 CORS도 antiforgery 검사도 적용되지 않고, 그 서비스와 엔드포인트 사이에 남는 것은 `RequireAuthorization`뿐입니다. CORS는 진짜 인가 위에 얹힌 브라우저용 편의 장치로 다루고, 인가 자체로 삼지 마세요.
