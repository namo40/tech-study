---
title: "Authorization"
summary: "인가는 로그인 다음에 오는 질문입니다. 인증이 누가 부르는지를 증명하면, 역할은 그 사람이 할 수 있는 일을 묶어 주고, 정책은 리소스 자체를 놓고 판단합니다. 그리고 안전한 기본값은 침묵을 거부로 읽는 것입니다."
category: "인증과 인가"
scene: authorization
steps:
  - title: "로그인은 문을 열 뿐, 모든 서랍을 열지는 않습니다"
    text: "인가 단계가 없으면 로그인한 사용자는 무엇이든 만질 수 있습니다. 고스트는 B가 A의 문서를 지우는 데 성공하는 모습을 보여 줍니다. 인증은 \"누구인가\"에 답하고, 인가는 \"해도 되는가\"에 답합니다. 질문 둘, 단계 둘이고, 안전은 두 번째에 삽니다."
  - title: "역할은 이름이 붙은 권한 꾸러미입니다"
    text: "게이트는 배지를 봅니다. editor는 쓸 수 있고 viewer는 읽을 수 있고, viewer의 쓰기는 문서에 닿기 전에 403으로 돌아옵니다. 역할이 있어야 사용자 천 명이 감당됩니다. 사람마다 목록을 주는 대신 꾸러미를 주기 때문입니다."
  - title: "editor라는 역할은 \"자기 것만\"을 말하지 못합니다"
    text: "A는 editor라서 역할은 A가 B의 문서를 고치는 것도 기꺼이 허용합니다. 꾸러미는 동사를 알지 소유를 모릅니다. 정책은 결정 시점에 질문을 던집니다. 호출자가 이 리소스의 소유자인가. 같은 요청, 같은 배지, 다른 답입니다. 이제 리소스가 결정의 일부이기 때문입니다."
  - title: "기본은 거부, 부여는 최소입니다"
    text: "어떤 규칙도 명시적으로 허용하지 않는 요청은 거절됩니다. 침묵은 곧 거부입니다. 각 신원은 필요한 최소만 쥐고, 그래서 훔친 배지가 여는 문이 최대한 적어집니다. 인가는 입구의 벽이 아니라 모든 문 앞의 결정이고, 매번 새로 내려집니다."
related:
  - label: Authentication
    slug: authentication
  - label: Role-Based Access Control
    slug: role-based-access-control
  - label: Policy
    slug: policy
  - label: Least Privilege
    slug: least-privilege
  - label: Default Deny
    slug: default-deny
  - label: Resource-based Authorization
    slug: resource-based-authorization
  - label: Attribute-Based Access Control
    slug: attribute-based-access-control
  - label: Role
    slug: role
  - label: Claims
    slug: claims
  - label: OAuth 2.0
    slug: oauth-2-0
  - label: OpenID Connect
    slug: openid-connect
  - label: Access Token
    slug: access-token
  - label: JSON Web Token
    slug: json-web-token
references:
  - title: "Introduction to authorization in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/authorization/introduction
  - title: "Policy-based authorization in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/authorization/policies
  - title: "Role-based authorization in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/authorization/roles
---

## 언제 쓰나

- 무언가를 실제로 하는 모든 엔드포인트에서, 두 번째 질문으로 씁니다. 인증은 누가 부르는지까지만 알려 줍니다. 그 호출자가 무엇을 어디에 할 수 있는지는 인가가 정하고, 현관에서 한 번이 아니라 요청마다 다시 답해야 합니다.
- 굵직한 권한 구분에는 역할을 씁니다. 관리자 화면, 편집 도구, 상담 콘솔은 특정 부류의 사용자에게 통째로 열리거나 통째로 닫히는 영역입니다. 이럴 때는 이름 붙은 권한 꾸러미가 가장 싸고 정확한 표현입니다.
- 답이 데이터에 달려 있으면 리소스를 보는 정책을 씁니다. 소유권, 테넌트, 작업 상태, 다른 사람이 열어 둔 잠긴 문서 같은 것은 호출자만 봐서는 정할 수 없습니다. 같은 호출자라도 행이 다르면 답이 달라지기 때문입니다.
- 서비스끼리 부르는 경우에도 필요합니다. 유효한 토큰은 어느 서비스가 부르는지를 증명할 뿐, 그 서비스가 무엇을 해도 되는지는 말하지 않습니다. 머신 신원으로 도는 배치 작업도 사람과 똑같이 권한을 따로 정해야 하고, 대개 사람보다 적게 줘야 합니다.
- 작성해 둔 어떤 규칙에도 걸리지 않는 요청이 들어올 수 있는 곳이면 어디든 필요합니다. 매핑되지 않은 경로, 특성을 붙이는 것을 잊은 엔드포인트, 기존 컨트롤러에 새로 추가된 동작이 그렇습니다. 중요한 질문은 그런 요청이 무엇을 해도 되느냐가 아니라 아무도 의견을 내지 않았을 때 무슨 일이 벌어지느냐이고, 답은 거부여야 합니다.

## 주의점

- 로그인 성공은 권한이 아닙니다. 이것을 권한으로 취급하면 접근 통제가 무너지고, 이 결함은 실제 웹 취약점 목록에서 늘 상위에 있습니다. 장면의 첫 단계가 바로 그 모습입니다. 호출자가 로그인했다는 이유로 요청이 통과하고, 이 호출자가 이 문서를 만져도 되는지는 아무도 묻지 않습니다.
- 역할이 리소스를 품기 시작하면 곧 무너집니다. `editor-of-project-x`는 리소스 식별자를 삼켜 버린 역할이고, 이런 것이 하나 생기면 곧 수천 개가 됩니다. 애플리케이션 코드가 만들고 지우니 감사도 안 되고 따라가기도 어렵습니다. 이름이 이렇게 불어나기 시작하면 판단을 리소스를 읽는 정책으로 옮기라는 신호입니다.
- 서버에서, 요청마다 확인합니다. 버튼을 숨기는 것은 사용자를 배려하는 일이지 통제가 아닙니다. 뒤에 있는 엔드포인트는 그대로 살아 있고, 공격자가 부르는 것은 바로 그쪽입니다. 서버가 어차피 거절할 것을 UI가 숨기는 것은 괜찮지만, 서버가 허용할 것을 UI만 숨기고 있다면 그 UI가 보안의 전부인 셈입니다.
- 막힌 쪽으로 실패하게 만드세요. 매핑되지 않은 경로, 아무도 특성을 붙이지 않은 컨트롤러, 판단하지 않고 그냥 돌아오는 인가 처리기는 전부 거부로 끝나야 합니다. 기본 거부가 있어야 시스템이 허용하는 것의 목록과 적어 둔 것의 목록이 같아집니다.
- 최소 권한은 사람에게만 해당하지 않습니다. 서비스가 들고 있는 access token, 작업이 사용하는 서비스 계정, 연결 문자열에 적힌 데이터베이스 사용자도 마찬가지입니다. 셋 다 일이 되는 최소한만 할 수 있어야 합니다. 무언가 새어 나갔을 때 공격자가 그대로 물려받는 것이 바로 그 권한이기 때문입니다.
- 거부를 로그로 남기고 지켜봅니다. 거부는 자기 쪽 클라이언트의 버그이거나 누군가 문을 두드려 보는 것이고, 둘 다 알아 둘 값어치가 있습니다. 한 엔드포인트에서 거부율이 튀는 것은 가장 일찍 잡히는 신호 가운데 하나이고, 따로 드는 비용도 없습니다.
- 판단은 한 곳에서 한 번만 내립니다. 컨트롤러 여기저기에 흩어진 인가 로직은 시간이 지나면 어긋나고, 갱신을 잊은 사본이 구멍이 됩니다. 규칙에 정책 이름을 붙여 두고 그 이름만 쓰면, 규칙 자체를 읽고 시험하고 고칠 수 있게 됩니다.

## .NET에서는

ASP.NET Core는 두 질문을 장면과 같은 방식으로 나눕니다. 인증이 `ClaimsPrincipal`을 만들고, 인가가 그 principal과 필요하면 리소스까지 받아 판단을 내놓습니다. 인자 없는 `[Authorize]`는 첫 번째 질문만 던지기 때문에 답의 전부가 되는 경우는 드뭅니다.

역할은 굵직한 쪽이고, 다른 것과 마찬가지로 하나의 claim입니다.

```csharp
// A named bundle of permissions. Nothing here knows about documents.
app.MapPost("/documents/{id}", CreateRevision).RequireAuthorization("CanEdit");

builder.Services.AddAuthorizationBuilder()
    .AddPolicy("CanEdit", policy => policy.RequireRole("editor"))
    .AddPolicy("CanRead", policy => policy.RequireRole("editor", "viewer"));
```

답이 리소스에 달리는 순간부터는 역할로 표현할 수 없고 정책이 필요합니다. 요구사항은 질문을 가리키는 표지이고, 처리기가 그 질문에 답합니다. 리소스를 받는 쪽은 제네릭 인자가 둘인 `AuthorizationHandler`입니다.

```csharp
public sealed record OwnerRequirement : IAuthorizationRequirement;

public sealed class OwnerHandler : AuthorizationHandler<OwnerRequirement, Document>
{
    protected override Task HandleRequirementAsync(
        AuthorizationHandlerContext context, OwnerRequirement requirement, Document document)
    {
        var caller = context.User.FindFirstValue(ClaimTypes.NameIdentifier);

        // Succeed explicitly, and say nothing otherwise. A handler that does not
        // call Succeed has not allowed anything, which is the default deny.
        if (caller is not null && document.OwnerId == caller) context.Succeed(requirement);

        return Task.CompletedTask;
    }
}
```

무언가 리소스를 건네주기 전에는 처리기가 돌 수 없으므로, 엔드포인트는 문서를 먼저 읽고 나서 묻습니다. 이 순서가 핵심입니다. 판단은 그 행을 놓고, 호출이 일어나는 시점에 내려집니다.

```csharp
static async Task<IResult> CreateRevision(
    string id, RevisionInput input, ClaimsPrincipal user,
    IAuthorizationService authorization, DocumentStore store)
{
    var document = await store.FindAsync(id);
    if (document is null) return Results.NotFound();

    var result = await authorization.AuthorizeAsync(user, document, "OwnerOnly");
    if (!result.Succeeded) return Results.Forbid();

    await store.AppendAsync(document, input);
    return Results.NoContent();
}
```

규칙의 표기를 하나로 두기 위해 요구사항을 이름 붙은 정책으로 등록하고, 처리기는 싱글턴으로 추가합니다.

```csharp
builder.Services.AddAuthorizationBuilder()
    .AddPolicy("OwnerOnly", policy => policy.AddRequirements(new OwnerRequirement()));

builder.Services.AddSingleton<IAuthorizationHandler, OwnerHandler>();
```

기본 거부는 한 줄이면 되고, 아무도 특성을 붙이지 않은 엔드포인트가 어떻게 동작할지를 정하는 것이 바로 그 한 줄입니다. `FallbackPolicy`는 다른 인가 설정이 없는 곳에 적용되므로, 새로 만든 컨트롤러는 누가 보호를 기억해 내기 전에 이미 보호됩니다. 그러면 `[AllowAnonymous]`가 의도적인 예외가 되고, 예외가 필요한 자리에만 적힙니다.

```csharp
builder.Services.AddAuthorizationBuilder()
    .SetFallbackPolicy(new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build());
```

작은 습관 두 가지도 값어치를 합니다. 정책 안에서는 역할 이름보다 권한 모양의 claim을 씁니다. `RequireClaim("permission", "documents.write")`는 조직 개편으로 역할 이름이 전부 바뀌어도 살아남고, 꾸러미 정의를 여러 특성에 흩어 놓지 않고 한곳에 모아 둡니다. 그리고 인증은 됐지만 권한이 없는 호출자에게는 `404` 대신 `403`을 돌려줍니다. 리소스의 존재 자체가 비밀이라고 판단한 경우만 예외입니다. `Results.Forbid()`와 `Results.Challenge()`는 뜻이 다르고, 이 둘을 섞으면 로그인한 사용자가 로그인 화면을 계속 맴돌게 됩니다.
