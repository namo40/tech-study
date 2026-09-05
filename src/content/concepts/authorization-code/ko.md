---
title: "Authorization Code"
summary: "Authorization code 흐름은 앱이 사용자의 비밀번호를 한 번도 보지 않고 토큰을 얻는 방법입니다. 브라우저가 authorization server로 가서 로그인한 뒤 한 번만 쓸 수 있는 code를 들고 돌아오면, 앱은 브라우저가 건드리지 않는 경로로 그 code를 토큰과 바꿉니다."
category: "인증과 인가"
scene: authorization-code
steps:
  - title: "절차"
    text: "앱이 브라우저를 authorization server로 보내 로그인하게 합니다. 서버는 수명이 짧은 code와 함께 브라우저를 되돌려 보냅니다. 앱은 브라우저가 건드리지 않는 경로로 code를 토큰과 바꾸고, access token으로 API를 호출합니다."
  - title: "왜 code인가"
    text: "브라우저를 거치는 것은 무엇이든 샙니다. URL, 히스토리, referrer, 로그입니다. 그래서 front channel에는 code만 실립니다. 한 번만 쓸 수 있고 앱의 secret 없이는 쓸모없습니다. 토큰도 거기 실리면 똑같이 새므로, back channel로만 다닙니다."
  - title: "PKCE"
    text: "브라우저나 모바일 앱은 secret을 간직할 수 없습니다. 그래서 로그인마다 하나를 만들어 냅니다. 무작위 verifier를 code를 요청할 때는 해시로, code를 쓸 때는 원문으로 보냅니다. verifier 없이 훔친 code는 쓸모없습니다."
  - title: "짧은 토큰, 교체되는 refresh"
    text: "access token은 몇 분만 삽니다. 만료되면 API가 401을 돌려주고 앱은 refresh token으로 새 쌍을 받습니다. refresh token은 한 번만 쓸 수 있습니다. 옛것을 다시 쓰는 것은 탈취의 신호이므로 서버는 그 계열 전체를 폐기합니다."
related:
  - label: OAuth 2.0
    slug: oauth-2-0
  - label: OpenID Connect
    slug: openid-connect
  - label: Proof Key for Code Exchange
    slug: proof-key-for-code-exchange
  - label: Access Token
    slug: access-token
  - label: ID Token
    slug: id-token
  - label: Refresh Token
    slug: refresh-token
  - label: Token Rotation
    slug: token-rotation
  - label: Bearer Token
    slug: bearer-token
  - label: JSON Web Token
    slug: json-web-token
  - label: Claims
    slug: claims
  - label: Token Revocation
    slug: token-revocation
  - label: CORS
    slug: cors
references:
  - title: "OAuth 2.0 Security Best Current Practice (RFC 9700)"
    url: https://www.rfc-editor.org/info/rfc9700/
  - title: OpenID Connect Core 1.0
    url: https://openid.net/specs/openid-connect-core-1_0.html
  - title: "Proof Key for Code Exchange (RFC 7636)"
    url: https://www.rfc-editor.org/rfc/rfc7636
---

## 언제 쓰나

- 사용자가 ID 공급자를 거쳐 로그인하는 모든 앱에서 씁니다. 서버에서 렌더링하는 웹 앱은 client secret과 함께 쓰고, 단일 페이지 앱과 모바일 앱은 secret 대신 PKCE와 함께 씁니다.
- 사용자를 대신해 API를 호출할 access token이 필요할 때 씁니다. 사용자가 등장하지 않는 서버 간 호출은 client credentials 흐름을 쓰며, 그쪽은 브라우저도 code도 필요 없습니다.
- 비밀번호를 ID 공급자만 보게 하고 싶을 때 씁니다. 앱은 비밀번호를 아예 받지 않으므로 앱이 뚫려도 계정이 뚫리지는 않습니다.

## 주의점

- client secret이 있어도 PKCE를 함께 씁니다. implicit 흐름과 password grant는 폐기된 방식입니다. 새 설계에 넣지 않고, 이미 쓰고 있다면 걷어낼 계획을 세웁니다.
- redirect URI는 정확히 등록하고 정확히 대조합니다. 와일드카드나 느슨한 접두사 비교, 등록된 출처 어딘가에 있는 open redirect는 code를 남에게 그냥 넘겨주는 것과 같습니다.
- 돌아온 응답에서 `state`를 검증하고, OpenID Connect를 쓴다면 ID token의 `nonce`도 검증합니다. `state`는 응답을 이 브라우저가 보낸 요청에 묶고, `nonce`는 ID token을 그 요청에 묶습니다.
- access token은 짧게 유지하고 refresh token은 교체합니다. 이미 쓴 refresh token이 다시 들어오면 탈취로 간주하고, 재사용된 그 토큰만이 아니라 계열 전체를 폐기합니다.
- 토큰은 브라우저가 읽을 수 없는 곳에 둡니다. 서버 렌더링 앱이라면 세션이나 서버 쪽 토큰 저장소입니다. `localStorage`에 넣는 것은 주입된 스크립트에게 토큰을 건네주는 일입니다.
- ID token은 API로 보내지 않습니다. ID token은 누가 로그인했는지를 말하며 그것을 요청한 클라이언트를 위한 것입니다. API가 원하는 것은 access token과 audience 검사입니다.

## .NET에서는

ASP.NET Core 웹 앱은 세션을 위한 쿠키 핸들러와 흐름을 위한 OpenID Connect 핸들러로 사용자를 로그인시킵니다. 아래처럼 `ResponseType = Code`를 지정하면 `AddOpenIdConnect`가 code 흐름을 수행하고 `state`와 `nonce`를 검증하며 PKCE를 기본으로 켭니다. 핸들러 자체의 기본 응답 유형은 `id_token`이므로, code 흐름은 저절로 얻는 것이 아니라 직접 요청해야 하는 것입니다.

```csharp
// 웹 앱: authorization code 흐름으로 사용자를 로그인시킵니다.
builder.Services.AddAuthentication(options =>
{
    options.DefaultScheme = CookieAuthenticationDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = OpenIdConnectDefaults.AuthenticationScheme;
})
.AddCookie()
.AddOpenIdConnect(options =>
{
    options.Authority = "https://login.example.com";
    options.ClientId = "shop-web";
    options.ClientSecret = builder.Configuration["Oidc:ClientSecret"];   // public client에는 없습니다
    options.ResponseType = OpenIdConnectResponseType.Code;
    options.UsePkce = true;
    options.SaveTokens = true;                                          // 토큰은 인증 쿠키에 실려 다닙니다
    options.Scope.Add("openid");
    options.Scope.Add("profile");
    options.Scope.Add("offline_access");                                // refresh token을 요청합니다
    options.Scope.Add("shop.api");
});

// API: access token을 받고, 이 audience를 위해 찍힌 것인지 확인합니다.
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.Authority = "https://login.example.com";
        options.Audience = "shop.api";
    });
```

`SaveTokens = true`는 토큰을 인증 티켓의 속성에 넣고, 그 티켓은 암호화된 인증 쿠키 안에 실려 다닙니다. 스크립트가 읽을 수는 없지만 쿠키가 커지며, 이 옵션이 기본으로 꺼져 있는 이유가 그것입니다. 티켓을 서버에 두고 브라우저에는 키만 보내려면 쿠키 핸들러에 `options.SessionStore`를 설정합니다. 갱신은 자동이 아닙니다. access token의 만료가 가까워지면 refresh token으로 `/token`을 직접 호출하거나, 그 일을 대신 하고 새 쌍을 세션에 다시 써 주는 토큰 관리 라이브러리를 씁니다.

단일 페이지 앱과 모바일 앱은 간직할 secret이 없으므로 public client로 등록하고 PKCE에 기댑니다. SPA라면 backend-for-frontend를 권합니다. 서버가 흐름을 끝내고 토큰을 들고 있으며, 브라우저에는 자기 출처의 쿠키 하나만 줍니다.
