---
title: "OAuth 2.0"
summary: "OAuth 2.0은 비밀번호를 넘기는 대신 scope와 수명이 정해진 위임 토큰을 씁니다. 앱은 한동안 문 하나만 여는 열쇠를 받고, 교체는 토큰 탈취를 탐지 가능한 사건으로 바꾸며, OpenID Connect가 그 위에 \"누구인가\"에 대한 답을 얹습니다."
category: "인증과 인가"
scene: oauth-2-0
steps:
  - title: "집 전체의 열쇠를 넘기지 않습니다"
    text: "옛 방식에서 앱은 비밀번호를 요구했고, 그때부터 그 사람 이름으로 무엇이든 영원히 할 수 있었습니다. OAuth는 그것을 위임으로 바꿉니다. 승인하면 서버가 한동안 문 하나만 여는 열쇠를 발급할 것입니다. 열쇠 자체는 다음 단계에 나옵니다."
  - title: "code는 영수증이고, 토큰이 열쇠입니다"
    text: "앱은 사용자를 authorization server로 보내고, 동의하면 1회용 code가 돌아옵니다. 앱은 그것을 read scope의 access token과 나중을 위한 refresh token으로 바꿉니다. 짧은 수명은 의도한 것입니다. API는 사람이 아니라 토큰을 검사합니다."
  - title: "만료는 설계이고, 교체는 경보입니다"
    text: "access token이 죽으면 API는 401을 말하고, refresh token이 새것을 얻어 옵니다. 새 refresh token도 옵니다. 각각 한 번만 통합니다. 훔친 옛것이 다시 오면 서버는 재사용을 알아채고 계열 전체를 폐기합니다. 도난은 영구적이지 않고 시끄러워집니다."
  - title: "OAuth는 무엇을 해도 되는가에 답하고, OpenID Connect는 누구인가에 답합니다"
    text: "다시 로그인하면서 앱은 openid scope를 요청하고, access token 옆에 ID token이 도착합니다. 신원에 대한 서명된 진술이고, 앱이 읽는 것이지 API로 보내는 것이 아닙니다. 질문 둘에 토큰 둘, 이제 둘 다 답이 있습니다."
related:
  - label: Authorization Code
    slug: authorization-code
  - label: Access Token
    slug: access-token
  - label: Refresh Token
    slug: refresh-token
  - label: Token Rotation
    slug: token-rotation
  - label: OpenID Connect
    slug: openid-connect
  - label: Bearer Token
    slug: bearer-token
  - label: JSON Web Token
    slug: json-web-token
  - label: Claims
    slug: claims
  - label: ID Token
    slug: id-token
  - label: Token Revocation
    slug: token-revocation
  - label: Authentication
    slug: authentication
  - label: Authorization
    slug: authorization
  - label: Key Rotation
    slug: key-rotation
references:
  - title: "Microsoft identity platform and OAuth 2.0 authorization code flow"
    url: https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow
  - title: "Refresh tokens in the Microsoft identity platform"
    url: https://learn.microsoft.com/en-us/entra/identity-platform/refresh-tokens
  - title: "OpenID Connect on the Microsoft identity platform"
    url: https://learn.microsoft.com/en-us/entra/identity-platform/v2-protocols-oidc
  - title: "The OAuth 2.0 Authorization Framework (RFC 6749)"
    url: https://www.rfc-editor.org/rfc/rfc6749
---

## 언제 쓰나

OAuth 2.0은 위임 프로토콜입니다. 딱 한 가지 상황을 위해 존재하고, 그 상황을 알아볼 수 있게 되면 나머지 설계는 거기서 따라 나옵니다. 어떤 소프트웨어가 사람을 대신해, 그 사람이 소유한 리소스에 대해, 그 사람이 되지는 않으면서 동작해야 하는 상황입니다.

- 앱이 사용자를 대신해 API를 호출합니다. 일정을 읽어 오는 도구, 앨범을 가져오는 인화 서비스, 로그인한 직원 자격으로 주문 서비스를 조회하는 사내 대시보드가 그렇습니다. 앱에 필요한 것은 신원이 아니라 접근이고, 그것도 한계가 정해진 접근입니다.
- 자사 SPA나 모바일 앱이 자사 API와 통신합니다. 이것도 위임입니다. 브라우저나 휴대폰은 비밀을 지킬 수 없기 때문입니다. 이때 흐름은 authorization code와 PKCE이고, 이유는 URL에서 code를 복사해 간 사람에게 그 code가 쓸모없어야 하기 때문입니다.
- 서버에서 렌더링하는 웹 앱이 사용자를 로그인시킨 뒤 API를 호출합니다. 여기서도 흐름은 authorization code이고 PKCE도 함께 씁니다. RFC 9700은 public client에는 MUST, confidential client에는 RECOMMENDED로 두며, 정말로 client secret을 보관할 수 있는 앱에서도 PKCE는 비용이 들지 않고 주입 구멍 하나를 막아 줍니다.
- 사용자가 아예 없는 서비스 사이의 통신입니다. client credentials는 위임 부분이 빠진 OAuth입니다. 토큰은 어느 서비스가 호출하는지 말하고, scope는 그 서비스가 무엇을 해도 되는지 말합니다. 동의할 사람이 없다는 바로 그 점 때문에 이 흐름이 맞습니다.
- 대안이 남의 비밀번호를 저장하는 것인 모든 자리입니다. 설계 문서에 "자격 증명을 받아 둬야 한다"는 문장이 있다면, 아직 아무도 그 단어를 꺼내지 않았더라도 그 지점이 OAuth가 답인 지점입니다.

맞지 않는 경우는 하나입니다. 중간에 API가 없는, 자사 애플리케이션에 대한 평범한 로그인입니다. OAuth는 "이 앱이 이 일을 해도 되는가"에 답하고, 세션 쿠키는 "1분 전과 같은 브라우저인가"에 답합니다. 토큰이 현대적으로 느껴진다는 이유로 손을 뻗으면, 단순한 로그인이 토큰 캐시와 갱신 루프를 달고 쿠키보다 못한 보안으로 끝납니다.

## 주의점

- 토큰은 소지자 증서입니다. 만료되기 전까지, API 입장에서는 그것을 들고 있는 사람이 곧 토큰의 주인입니다. 이 한 문장에서 규칙 대부분이 나옵니다. 짧은 수명, 모든 구간의 TLS, URL이나 로그 한 줄이나 분석 페이로드에 절대 넣지 않기, cross-site scripting 결함이 닿을 수 있는 곳이라면 `localStorage`에도 넣지 않기입니다.
- access token은 세션이 아닙니다. 만료는 있지만 로그아웃도, 유휴 시간 제한도, 만료 전에 믿고 쓸 수 있는 폐기도 없습니다. 애플리케이션의 로그인 상태를 access token으로 짜면, 세션의 통제 수단은 하나도 없는 세션이 생깁니다.
- ID token을 API로 보내지 않고, 클라이언트가 access token에서 누가 로그인했는지 알아내게 두지 않습니다. ID token은 앱 앞으로, access token은 API 앞으로 발행되고, 각각 자기 수신자를 대상으로 서명됩니다. ID token을 받아들이는 API는 다른 수신자용으로 발행된 토큰을 받아들이는 셈이고, `aud` 검증은 정확히 그 혼동을 막으려고 있습니다. access token에서 신원 클레임을 읽어도 되는 유일한 당사자는 API이고, 그것도 그 토큰을 자기 audience에 대해 검증한 뒤에만입니다.
- refresh token에는 교체와 재사용 감지가 필요합니다. 그것이 없으면 탈취된 refresh token은 조용하고 영구적인 접근이 됩니다. 그것이 있으면 이미 쓴 토큰의 두 번째 사용이 신호가 되고, 올바른 대응은 토큰 하나가 아니라 계열 전체를 폐기하는 것입니다.
- scope는 거친 권한이지 도메인의 인가 모델이 아닙니다. `orders.read`는 입구에 있는 문입니다. 이 사용자가 바로 이 주문을 읽어도 되는지는 도메인만 답할 수 있는 질문입니다. scope를 답 전체로 취급하면, 문만 통과하면 누구에게나 활짝 열린 API가 됩니다.
- 호출마다 토큰을 전부 검증합니다. 발급자가 공개한 키로 서명을 확인하고 `iss`, `aud`, `exp`, `nbf`를 봅니다. 형식만 갖춘 토큰은 나에게 발급된 토큰이 아니고, audience 검증을 건너뛰는 것은 인가와 장식의 차이입니다.
- redirect URI도 보안 모델의 일부입니다. 정확히 일치하는 등록, 와일드카드 없음, 도메인 어디에도 열린 리다이렉터 없음입니다. authorization code는 그 URI로만 전달되는데, 서버가 임의로 판단하지 않을 때만 그 말이 참이 됩니다.
- 동의는 형식적인 절차가 아닙니다. 요청하는 scope가 곧 사용자가 승낙하는 내용입니다. 필요한 것보다 많이 요청하면 동의 화면이 무서워지고, 승인받기가 어려워지고, 나중에 사고가 났을 때 피해가 커집니다.

## .NET에서는

API 쪽에서 할 일은 검증입니다. `Microsoft.AspNetCore.Authentication.JwtBearer`는 발급자의 디스커버리 문서에서 서명 키를 받아 와 서명을 확인하고, 지정한 조건을 강제합니다.

```csharp
builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.Authority = "https://login.microsoftonline.com/{tenant}/v2.0";
        options.TokenValidationParameters = new TokenValidationParameters
        {
            // 남의 API용으로 발행된 토큰이 내 API에서 통하는 일을 막아 주는 검사가
            // 바로 이 audience 검사입니다. 두 항목 모두 이 API 하나입니다. v2.0 토큰은
            // client id를 싣고, v1.0 토큰은 대신 `api://` 리소스 URI를 실을 수 있습니다.
            ValidateAudience = true,
            ValidAudiences = [ordersClientId, $"api://{ordersClientId}"],
            ValidateIssuer = true,
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromSeconds(30),
        };
    });
```

scope는 정책이 됩니다. 거친 문을 한 번 선언해 두고, 각 엔드포인트는 자기가 어느 문 뒤에 있는지만 말합니다. 앱이 이미 Microsoft.Identity.Web을 참조한다면 `RequireScope`와 `[RequiredScope]`가 같은 분리를 대신 해 줍니다.

```csharp
builder.Services.AddAuthorization(options =>
{
    // `scp`는 공백으로 구분된 문자열 하나로 도착하므로, 정확히 일치하는지만 보면
    // scope를 둘 이상 받은 토큰이 거절됩니다.
    options.AddPolicy("orders.read", policy => policy.RequireAssertion(context =>
        (context.User.FindFirstValue("scp") ?? "").Split(' ').Contains("orders.read")));
});

app.MapGet("/orders/{id}", async (string id, ClaimsPrincipal user, IOrders orders) =>
{
    // scope는 호출자가 주문을 읽어도 된다고 말합니다. 바로 이 주문을 읽어도
    // 되는지는 도메인의 질문이고, 그 질문은 여기서 해야 합니다.
    var order = await orders.FindAsync(id);
    return order is null || !order.BelongsTo(user.FindFirstValue("oid"))
        ? Results.NotFound()
        : Results.Ok(order);
}).RequireAuthorization("orders.read");
```

사용자를 로그인시키는 웹 앱이라면 `ResponseType`으로 요청했을 때 OpenID Connect 핸들러가 authorization code 흐름을 돌리고, 그때 PKCE는 기본으로 켜져 있습니다.

```csharp
builder.Services
    .AddAuthentication(options =>
    {
        // 앱이 이후의 모든 요청에서 읽는 것은 쿠키이고, OpenID Connect 핸들러는
        // 로그인만 수행합니다. 대신 이쪽을 기본 스킴으로 지정하면 시작 시 오류가 납니다.
        // 원격 핸들러에게 사용자를 자기 자신에게 로그인시키라고 요구하는 셈이기 때문입니다.
        options.DefaultScheme = CookieAuthenticationDefaults.AuthenticationScheme;
        options.DefaultChallengeScheme = OpenIdConnectDefaults.AuthenticationScheme;
    })
    .AddOpenIdConnect(options =>
    {
        options.Authority = "https://login.microsoftonline.com/{tenant}/v2.0";
        options.ClientId = configuration["Oidc:ClientId"];
        options.ClientSecret = configuration["Oidc:ClientSecret"];
        options.ResponseType = "code";           // "token"이나 "id_token token"은 쓰지 않습니다
        options.UsePkce = true;
        options.SaveTokens = true;
        options.Scope.Add("offline_access");     // refresh token을 요청하는 것이 이 줄입니다
        options.Scope.Add("api://orders/orders.read");
    })
    .AddCookie();                                // ID token은 쿠키 세션이 됩니다
```

마지막 줄은 한 번 멈춰서 볼 만합니다. 핸들러는 ID token을 들고 있게 두지 않습니다. 한 번 검증해서 `ClaimsPrincipal`로 바꾸고 쿠키를 내려 줍니다. 그때부터 앱에는 세션이 있고, 토큰은 API를 호출하는 데 씁니다. 이것이 올바른 분업이고, 장면의 4단계가 그리는 것과 같은 분업입니다.

access token을 받아 오고 캐시하는 일은 Microsoft.Identity.Web이 맡습니다. `ITokenAcquisition`이 refresh token을 보관하고, 캐시된 access token의 만료가 가까워지면 교환하고, 교체를 호출하는 쪽이 눈치채지 못하게 처리합니다.

```csharp
builder.Services
    .AddMicrosoftIdentityWebAppAuthentication(configuration)
    .EnableTokenAcquisitionToCallDownstreamApi(["api://orders/orders.read"])
    .AddDistributedTokenCaches();                // 공유 캐시라야 스케일아웃해도 승인이 유지됩니다

public sealed class OrdersClient(ITokenAcquisition tokens, HttpClient http)
{
    public async Task<Order?> GetAsync(string id, CancellationToken ct)
    {
        var accessToken = await tokens.GetAccessTokenForUserAsync(["api://orders/orders.read"]);

        // DefaultRequestHeaders가 아니라 요청마다 붙입니다. 클라이언트는 공유되므로
        // 한 호출자의 토큰이 다음 호출자에게 남아 있어서는 안 됩니다.
        using var message = new HttpRequestMessage(HttpMethod.Get, $"/orders/{id}");
        message.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

        var response = await http.SendAsync(message, ct);
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<Order>(ct);
    }
}
```

이것이 운영에서 버티는지는 두 가지가 결정합니다. 토큰 캐시는 분산 캐시여야 합니다. 그렇지 않으면 스케일아웃한 앱은 요청이 다른 인스턴스로 갈 때마다 refresh token을 잃고, 사용자는 보지 않아도 될 로그인 화면을 다시 봅니다. 그리고 client credentials 변형인 `GetAccessTokenForAppAsync`는 audience가 다른 별개의 승인 방식입니다. 사용자 토큰을 다루기 번거롭다고 요청 처리 중에 이쪽으로 손을 뻗으면, "이 사용자를 대신해 동작한다"가 "서비스 전체로서 동작한다"로 조용히 바뀝니다. OAuth가 막으려고 존재하는 바로 그 치환입니다.
