---
title: "Authentication"
summary: "Authentication은 신원 주장을 증명하는 일입니다. 주장과 증거를 함께 받아 그 자리에서 검증하며, 사람에게는 방어를 갖춘 비밀번호를, 기계에는 키를, 양쪽 모두에는 인증서를 씁니다. 시스템은 받아들이는 증거 중 가장 약한 것만큼만 강합니다."
category: "인증과 인가"
scene: authentication
steps:
  - title: "주장은 공짜이고, 인증은 증거 검사입니다"
    text: "\"나는 dana다\"라고 말하는 데는 아무 비용이 들지 않습니다. 고스트는 이름만 묻는 문을 그대로 지나갑니다. 진짜 인증은 주장과 함께 증거를 요구하고 그 자리에서 검증합니다. 아는 것, 가진 것, 그 자신인 것입니다. 문은 검사하는 순간부터 장식이기를 멈춥니다."
  - title: "증거는 훔칠 수 있고, 시스템은 가장 약한 증거만큼만 강합니다"
    text: "옳은 비밀번호는 잘못된 손에서도 같은 검사를 통과합니다. 검증자는 의도가 아니라 증거를 보기 때문입니다. 그래서 비밀번호는 방어와 함께 다닙니다. 저장은 해시로, 세션은 짧게, 중요한 순간에는 두 번째 요소를 더합니다. 검증은 금고가 아니라 문입니다."
  - title: "기계에도 신원이 있고, 비밀번호를 칠 손가락은 없습니다"
    text: "서비스는 쥐고 있는 것으로 자신을 증명합니다. 한 번 발급받아 호출마다 제시하고 등록부와 대조되는 API key입니다. 소지가 곧 증거입니다. 그래서 새어 나간 키는 곧 신원 유출이고, 키는 좁은 범위로 만들고 비밀로 보관하고 일정에 따라 회전합니다."
  - title: "mTLS는 증명을 상호로 만듭니다. 양쪽이 인증서를 내밉니다"
    text: "지금까지는 부르는 쪽만 자신을 증명했고 서버는 믿음으로 받아들여졌습니다. mutual TLS에서는 서로가 신뢰하는 기관이 서명한 인증서를 각자 제시하고, 연결 자체가 신원이 됩니다. 비밀은 회선을 건너지 않고, 어느 쪽이든 위장하려면 엿듣는 것이 아니라 개인 키를 훔쳐야 합니다."
related:
  - label: Authorization
    slug: authorization
  - label: API Key
    slug: api-key
  - label: Mutual TLS
    slug: mutual-tls
  - label: OAuth 2.0
    slug: oauth-2-0
  - label: OpenID Connect
    slug: openid-connect
  - label: Cookie Authentication
    slug: cookie-authentication
  - label: Bearer Token
    slug: bearer-token
  - label: Access Token
    slug: access-token
  - label: JSON Web Token
    slug: json-web-token
  - label: Claims
    slug: claims
  - label: Key Rotation
    slug: key-rotation
  - label: Workload Identity
    slug: workload-identity
  - label: Signature
    slug: signature
references:
  - title: "Overview of ASP.NET Core authentication"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/authentication/
  - title: "Configure certificate authentication in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/authentication/certauth
  - title: "What is Microsoft Entra authentication?"
    url: https://learn.microsoft.com/en-us/entra/identity/authentication/overview-authentication
---

## 언제 쓰나

- 응답이 누가 부르느냐에 따라 달라지는 모든 엔드포인트에서, 첫 번째 질문으로 씁니다. 공개된 가격표에는 누구의 신원도 필요 없지만 주문 내역에는 정확히 한 사람의 신원이 필요합니다. 응답이 호출자마다 달라지는 순간, 이 호출자가 누구인지를 확정하는 무언가가 있어야 하고, 그 확정은 누군가 직접 적어 넣은 헤더가 아니라 증거에서 나와야 합니다.
- 사람을 로그인시킬 때 씁니다. 비밀번호는 흔한 첫 번째 요소이지만, 선택 사항이 아닌 장치 한 벌을 함께 데려옵니다. 저장할 때의 적응형 해시, 성공했을 때 발급하는 세션, 세션을 실어 나르는 쿠키, 그리고 잘못되면 아픈 작업을 위한 두 번째 요소입니다. 설계에서 비밀번호는 가장 작은 부분입니다.
- 아무도 자판 앞에 앉아 있지 않은 서비스 사이 호출에 씁니다. 백그라운드 작업자, 웹훅 수신기, 다른 마이크로서비스를 부르는 마이크로서비스는 각자 자기 신원이 필요하고, 그 신원은 쥐고 있는 것으로 증명됩니다. API key, 클라이언트 인증서, 또는 비밀 자체를 없애 주는 플랫폼 발급 토큰입니다.
- 인가가 실행되기 전에 씁니다. 두 질문은 분리되어 있고 순서가 있습니다. 인증이 신원을 만들고 인가가 그 신원을 소비합니다. 아무도 확정하지 않은 신원에 대한 권한 검사는 추측에 대한 권한 검사이고, 장면의 1단계가 그리는 것이 바로 그 장면입니다.
- 증거가 네트워크를 건너는 곳이라면 어디든 씁니다. 여기 나오는 모든 방식은 상대가 검사할 수 있는 무언가를 보내는 일로 환원되므로, 통신 경로는 배포 세부 사항이 아니라 방식의 일부입니다. 평문으로 보낸 증거는 기부한 증거이고, 세상에서 가장 튼튼한 검증자도 누구나 읽을 수 있는 회선을 고쳐 주지는 못합니다.

## 주의점

- 로그인 성공은 권한이 아닙니다. 인증은 "이 사람이 누구인가"에 답하고 거기서 멈춥니다. 이 호출자가 이 대상에 이 일을 해도 되는지는 자기 규칙을 가진 두 번째 결정입니다. 첫 번째 답을 두 번째 답으로 취급하는 것이 접근 제어 결함이고, 실제 애플리케이션에서 가장 흔하게 발견되는 심각한 문제 가운데 하나입니다.
- 비밀번호를 되돌릴 수 있는 형태로 저장하지 마세요. 암호화는 키를 손에 넣은 사람이면 누구나 되돌릴 수 있고, 그 키는 데이터 옆에 있습니다. 솔트를 넣은 적응형 해시를 쓰세요. PBKDF2, bcrypt, scrypt, Argon2 중 하나를, 비밀번호 하나를 검증하는 비용은 서버에 저렴하고 10억 개를 시도하는 비용은 공격자에게 저렴하지 않도록 조정해서 씁니다. 직접 방식을 발명하지 말고 프레임워크가 제공하는 것을 쓰세요.
- 실패에 속도 제한과 잠금을 걸지 않으면 검증자가 신탁이 됩니다. 즉시, 그리고 영원히 답해 주는 문은 수백만 번의 추측도 기꺼이 확인해 줍니다. 게다가 "그런 사용자 없음"과 "비밀번호 틀림"을 구분해서 답하면 계정 목록부터 털립니다. 실패가 몇 번 쌓이면 느려지게 하고, 두 경우에 같은 답을 주고, 무슨 일이 있었는지 기록합니다.
- 로그인할 때 세션을 다시 발급합니다. 브라우저가 이미 들고 있던 식별자가 로그인 이후에도 살아남으면, 그 식별자를 심어 둔 공격자가 이제 피해자로 로그인되어 있는 셈입니다. 세션 고정은 규칙 하나로 닫힙니다. 인증된 신원을 실어 나르는 세션은 인증 이전에 존재하던 세션이 아니어야 합니다.
- API key는 신원이므로 신원답게 다룹니다. 키마다 필요한 최소 범위를 주고, 저장소에 커밋하는 설정이 아니라 비밀로 보관하고, URL과 로그에서 빼고, 감당할 수 있는 주기로 회전합니다. 새어 나간 키는 새어 나간 비밀번호가 아니라, 알아차릴 사람이 없는 새어 나간 계정입니다.
- 토큰 형식을 직접 만들지 말고, 남이 만든 것의 검증도 건너뛰지 마세요. 서명은 검증이 하는 만큼만 값어치가 있습니다. 알고리즘, 발급자, 대상, 만료를 매번 확인하고, 토큰이 스스로 제안하는 알고리즘은 절대 받아들이지 않습니다.
- 받아들이는 방식 중 가장 약한 것이 시스템을 규정합니다. 공들여 만든 mTLS 경로와, 예전 연동에서 남아 잊힌 basic auth 엔드포인트가 함께 있으면 그 시스템은 basic auth입니다. 지금 팀이 만들지 않은 것까지 포함해 들어오는 모든 경로를 세어 보고, 지키지 않을 것은 지웁니다.

## .NET에서는

ASP.NET Core는 인증을 스킴 단위로 나눕니다. 스킴은 요청에서 증거를 읽어 `ClaimsPrincipal`로 바꾸는 법을 아는 이름 붙은 핸들러이고, 기본 스킴은 아무것도 지정하지 않았을 때 실행되는 것입니다. 브라우저에는 쿠키, API에는 bearer token이 보통의 두 경우이며 한 애플리케이션이 둘 다 가질 수 있습니다.

```csharp
builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(options =>
    {
        options.Cookie.HttpOnly = true;
        options.Cookie.SecurePolicy = CookieSecurePolicy.Always;
        options.Cookie.SameSite = SameSiteMode.Lax;
        options.SlidingExpiration = false;
        options.ExpireTimeSpan = TimeSpan.FromHours(8);
    })
    .AddJwtBearer("api", options =>
    {
        options.Authority = "https://login.example.com/";
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidAudience = "orders-api",
            // 요청마다 이 항목이 전부 확인됩니다. 하나라도 건너뛰는 검증기는
            // 서명 검사일 뿐 그 이상이 아닙니다.
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
        };
    });

app.UseAuthentication();
app.UseAuthorization();
```

비밀번호 저장은 직접 쓰지 않는 편이 좋은 부분입니다. ASP.NET Core Identity는 현재 반복 횟수와 버전이 붙은 형식을 가진 해시 도구를 제공하므로, 설정을 올려도 모든 계정이 깨지지 않고 다음 로그인 성공 때 다시 해시됩니다.

```csharp
// SignInManager가 전체 절차를 처리합니다. 해시 비교, 잠금 횟수 계산,
// 그리고 성공했을 때의 새 세션까지입니다. 여기서 비밀번호는 변수가 되지 않습니다.
var result = await signInManager.PasswordSignInAsync(
    userName, password, isPersistent: false, lockoutOnFailure: true);

if (result.RequiresTwoFactor) return Results.Redirect("/mfa");
if (result.IsLockedOut) return Results.StatusCode(StatusCodes.Status429TooManyRequests);
if (!result.Succeeded) return Results.Unauthorized();
```

잠금은 코드가 아니라 설정이고, 문과 신탁을 가르는 것이 바로 이것입니다.

```csharp
builder.Services.Configure<IdentityOptions>(options =>
{
    options.Lockout.MaxFailedAccessAttempts = 5;
    options.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(15);
    options.User.RequireUniqueEmail = true;
});
```

기계 쪽에서는 인증서 인증도 다른 것과 같은 스킴입니다. 핸드셰이크는 요청이 파이프라인에 닿기 전에 서버에서 끝나므로, 핸들러가 할 일은 이미 도착한 인증서가 아는 상대의 것인지 판단하는 것입니다. 서명 검사가 아니라 조회입니다.

```csharp
builder.Services.AddAuthentication(CertificateAuthenticationDefaults.AuthenticationScheme)
    .AddCertificate(options =>
    {
        options.AllowedCertificateTypes = CertificateTypes.Chained;
        options.RevocationMode = X509RevocationMode.Online;
        options.Events = new CertificateAuthenticationEvents
        {
            OnCertificateValidated = context =>
            {
                var thumbprint = context.ClientCertificate.Thumbprint;
                if (!registry.IsKnown(thumbprint))
                {
                    context.Fail("unknown client certificate");
                    return Task.CompletedTask;
                }

                context.Principal = registry.PrincipalFor(thumbprint);
                context.Success();
                return Task.CompletedTask;
            },
        };
    });
```

가장 좋은 비밀은 존재하지 않는 비밀입니다. Azure에서는 관리 ID가 실행 중인 워크로드에 플랫폼이 발급하고 회전시키는 자격 증명을 주므로, 연결 문자열에는 호스트 이름만 남습니다.

```csharp
// 설정에도 키가 없고, 볼트에도 키가 없고, 회전시킬 키도 없습니다.
var client = new BlobServiceClient(
    new Uri("https://contoso.blob.core.windows.net"),
    new DefaultAzureCredential());
```

가져갈 만한 습관이 둘 있습니다. 신원은 클레임에 담고 호출자가 넘긴 파라미터가 아니라 `ClaimsPrincipal`에서 읽습니다. 애초에 스킴을 둔 목적이 그 점에서 호출자를 믿지 않기 위해서였기 때문입니다. 그리고 호출자가 누구인지 증명하지 못했을 때는 `401`을, 증명했는데도 허용되지 않을 때는 `403`을 돌려줍니다. 앞의 것은 로그인을 권하고 뒤의 것은 권하지 않으며, 둘을 섞으면 이미 로그인한 사용자가 로그인 화면을 맴돌게 됩니다.
