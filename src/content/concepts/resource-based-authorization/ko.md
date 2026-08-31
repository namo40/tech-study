---
title: "Resource-based Authorization"
summary: "Resource-based authorization은 자원을 손에 들고 판정합니다. \"이 사용자가 문서를 수정할 수 있는가\"가 아니라 \"이 사용자가 이 문서를 수정할 수 있는가\"를 묻습니다. 소유와 상태는 대상 위에 있고, 역할은 거친 바깥 문으로 남으며, 어느 규칙도 된다고 하지 않으면 답은 거부입니다."
category: "인증과 인가"
scene: resource-based-authorization
steps:
  - title: "역할만 보는 검사는 문서를 쳐다보지 않습니다"
    text: "고스트는 질문 하나만 던집니다. \"이 사용자가 editor인가?\" 그리고 도착하는 것은 무엇이든 수정합니다. 남의 문서라도요. 실패한 것은 없습니다. 규칙은 적힌 그대로 일했고, 바로 그것이 문제입니다. 질문이 너무 작았습니다. 의미 있는 인가는 세 가지를 한꺼번에 묻습니다. 누가, 무엇을, 어느 자원에."
  - title: "판정은 자원을 손에 들고 내립니다"
    text: "똑같은 요청 둘, doc 1을 수정하라. 처리기는 문서를 불러와 소유자를 읽고, 서로 다른 두 답을 내립니다. A에게는 허용, B에게는 거부. 이것이 패턴의 전부입니다. 결정적 사실이 자원 위에 살고 있으니, 규칙은 토큰만으로는 돌 수 없습니다. 같은 역할, 같은 행동이라도 문서가 다르면 답이 다릅니다."
  - title: "역할은 사라지는 것이 아니라 제자리를 찾습니다"
    text: "admin 카드는 소유를 건너뜁니다. 그것이 관리자라는 말의 뜻이니까요. 하지만 그것은 이름 붙은 좁은 부여 하나이지 만능열쇠가 아닙니다. 거친 역할 문은 명백한 외부인을 싸게 걸러 내고, 자원 검사는 정말 중요한 경우를 판정합니다. 두 겹은 서로 다른 질문에 답하고, 바로 그래서 둘 다 두는 것입니다."
  - title: "침묵은 거부입니다"
    text: "어떤 규칙도 들어 본 적 없는 새 행동이 도착하고, 시스템은 거절합니다. 어떤 규칙이 안 된다고 해서가 아니라, 어느 것도 된다고 하지 않았기 때문입니다. 그 기본값이 아직 쓰지 않은 모든 규칙을 받쳐 주는 안전망입니다. 처리기를 깜빡한 실수는 테스트 환경에서 시끄럽게 닫힌 채로 실패해야 합니다. 운영에서 조용히 열린 채로 실패해서는 안 됩니다."
related:
  - label: Authorization
    slug: authorization
  - label: Authentication
    slug: authentication
  - label: Role
    slug: role
  - label: Default Deny
    slug: default-deny
  - label: Role-based Access Control
    slug: role-based-access-control
  - label: Claims
    slug: claims
  - label: Least Privilege
    slug: least-privilege
  - label: Attribute-based Access Control
    slug: attribute-based-access-control
  - label: Workload Identity
    slug: workload-identity
  - label: Audience
    slug: audience
references:
  - title: "Resource-based authorization in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/authorization/resourcebased
  - title: "Policy-based authorization in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/authorization/policies
  - title: "Role-based authorization in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/authorization/roles
---

## 언제 쓰나

판단 기준은 간단합니다. 대상을 보지 않고는 답할 수 없는 질문이라면, 그 검사는 자원 위에 있어야 합니다.

- 소유. 글쓴이가 자기 글을 고치고, 고객이 자기 주문을 취소하고, 회원이 자기 댓글을 지웁니다. 역할은 "글쓴이"라고만 말하고, 누구의 것인지는 자원이 말합니다. A를 B의 초안에서 떼어 놓는 것은 두 번째뿐입니다.
- 상태. 결제된 주문은 수정할 수 없고, 잠긴 문서는 이름을 바꿀 수 없고, 닫힌 티켓은 담당자를 옮길 수 없습니다. 권한이 행을 불러온 뒤에야 존재하는 필드에 달려 있으니, 로그인 시점에 클레임을 아무리 채워 넣어도 이 답은 나오지 않습니다.
- 관계. 관리자가 자기 팀원의 평가를 읽고, 교사가 자기 반을 채점하고, 의사가 자기 담당 환자의 차트를 엽니다. 호출자와 자원 사이의 연결선이 곧 권한이고, 그 연결선은 토큰이 아니라 데이터베이스에 있습니다.
- 테넌트. 여러 테넌트를 받는 시스템에서 "같은 역할, 다른 테넌트"는 반드시 실패해야 하고, 빈 목록을 돌려주는 방식이 아니라 들어오는 길에서 막혀야 합니다. 자원에 붙은 테넌트 식별자가 곧 검사이고, 사고 보고서마다 있었더라면 하고 아쉬워하는 바로 그 검사입니다.
- 역할 검사로 정직하게 하려면 객체마다 역할을 하나씩 만들어야 하는 모든 곳. `Editor_Project_417` 같은 이름을 떠올리고 있다면, 그 권한이 사람이 아니라 객체에 관한 것임을 발견한 셈입니다. 그럴 때는 처리기를 쓰세요.

거친 역할 문은 이 모든 것 앞에 그대로 두는 편이 좋습니다. 싸고, 읽기 쉽고, 아무것도 불러오기 전에 명백한 외부인을 걸러 냅니다. 다만 문서 둘을 구별하지는 못합니다.

## 주의점

- 검사에 자원이 필요하니 불러온 다음에 돌아갑니다. 흠은 아니지만, 객체가 이미 존재하는 지점으로 판정이 밀려나므로 처리기가 실패에서 무엇이 새어 나가는지도 함께 정하게 됩니다. 404와 403 중 무엇을 돌려줄지는 의도해서 고르세요. 403은 대상이 있다고 인정하고 404는 인정하지 않으니, 자원 종류마다 하나를 골라 지키는 편이 예외 필터에 맡기는 것보다 낫습니다.
- 처리기는 작게, 한 가지만 묻게 유지합니다. 요구 사항 하나는 질문 하나여야 합니다. "호출자가 소유자인가", "주문이 아직 열려 있는가" 정도로요. 그래야 그것들을 묶은 정책이 소리 내어 말할 법한 문장처럼 읽힙니다. 조건 다섯 개를 품은 처리기 하나는 아무도 손대지 못하는 처리기가 됩니다.
- 자원 규칙을 쿼리 필터에만 밀어 넣지 않습니다. 필터는 행을 감추고 처리기는 행동을 거절하며, 둘은 다른 일입니다. 모든 쿼리를 현재 테넌트로 좁히는 전역 필터는 훌륭하지만, 필터가 닿지 않는 경로로 식별자를 통해 가져온 행을 호출자가 수정하는 것은 여전히 막지 못합니다. 보통은 둘 다 필요하고, 엔드포인트마다 어느 쪽이 지키고 있는지 말할 수 있어야 합니다.
- 판정 결과 캐시는 조심하거나 아예 두지 않습니다. 인가의 답은 어느 한 순간의 호출자와 자원에 관한 사실이고, 소유가 바뀌거나 공유가 회수되거나 주문이 결제되면 그 순간은 끝납니다. 꼭 캐시해야 한다면 자원이 바뀔 때 함께 바뀌는 값을 키로 삼고, 약속한 가장 짧은 회수 시간보다 수명을 짧게 두세요.
- 거부를 감사 기록에 남깁니다. 거절된 요청은 가장 이르고 가장 싼 침해 신호이고, 비용은 로그 한 줄입니다. 어떤 호출자가 1분에 마흔 번 소유 처리기에 걸린다면, 성공한 요청은 결코 알려 주지 않을 것을 알려 주고 있는 셈입니다.
- 자원 검사가 유일한 검사가 되게 두지 않습니다. 이 검사는 늦게, 불러온 데이터 위에서, 정밀한 일을 합니다. 인증되지 않은 요청 홍수와 데이터베이스 사이에 홀로 서 있지 않도록 싼 문들을 앞에 세우세요.

## .NET에서는

명령형으로 쓰는 모양은 `IAuthorizationService.AuthorizeAsync`이고, 자원을 불러온 뒤 엔드포인트 안에서 호출합니다. 이 일에는 어트리뷰트가 없습니다. 어트리뷰트는 들여다봐야 할 대상이 존재하기 전에 돌기 때문입니다.

```csharp
app.MapPut("/documents/{id:guid}", async (
    Guid id,
    DocumentUpdate update,
    ClaimsPrincipal user,
    AppDb db,
    IAuthorizationService auth,
    CancellationToken ct) =>
{
    var document = await db.Documents.FindAsync([id], ct);
    if (document is null) return Results.NotFound();

    var result = await auth.AuthorizeAsync(user, document, Operations.Update);
    if (!result.Succeeded) return Results.Forbid();

    document.Body = update.Body;
    await db.SaveChangesAsync(ct);
    return Results.NoContent();
});
```

요구 사항은 이름 하나이고, 동사마다 타입을 만들지 않아도 되도록 `OperationAuthorizationRequirement`가 준비되어 있습니다.

```csharp
public static class Operations
{
    public static readonly OperationAuthorizationRequirement Read = new() { Name = nameof(Read) };
    public static readonly OperationAuthorizationRequirement Update = new() { Name = nameof(Update) };
    public static readonly OperationAuthorizationRequirement Delete = new() { Name = nameof(Delete) };
}
```

처리기는 자원과 규칙이 드디어 만나는 자리입니다. `AuthorizationHandler<TRequirement, TResource>`가 둘을 함께 건네주고, 흥미로운 줄은 호출자와 자원의 필드를 비교하는 한 줄뿐입니다.

```csharp
public sealed class DocumentOwnerHandler
    : AuthorizationHandler<OperationAuthorizationRequirement, Document>
{
    protected override Task HandleRequirementAsync(
        AuthorizationHandlerContext context,
        OperationAuthorizationRequirement requirement,
        Document resource)
    {
        var userId = context.User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (userId is not null && resource.OwnerId == userId)
            context.Succeed(requirement);

        return Task.CompletedTask;
    }
}
```

처리기는 조합됩니다. 같은 요구 사항에 두 번째 처리기를 등록하는 것이 거친 문이 제자리를 지키는 방식입니다. 소유 처리기는 소유자에게 성공하고, 별도의 관리자 처리기는 이름 붙은 연산 하나에 대해 문서 주인이 누구든 성공합니다. 둘은 서로를 모르고, 어느 처리기든 성공하는 순간 요구 사항이 충족됩니다.

```csharp
public sealed class DocumentAdminHandler
    : AuthorizationHandler<OperationAuthorizationRequirement, Document>
{
    protected override Task HandleRequirementAsync(
        AuthorizationHandlerContext context,
        OperationAuthorizationRequirement requirement,
        Document resource)
    {
        // 이름 붙은 좁은 부여 하나. 모든 연산이 아니라는 점이 핵심입니다.
        if (requirement.Name == nameof(Operations.Update) && context.User.IsInRole("DocumentAdmin"))
            context.Succeed(requirement);

        return Task.CompletedTask;
    }
}

builder.Services.AddScoped<IAuthorizationHandler, DocumentOwnerHandler>();
builder.Services.AddScoped<IAuthorizationHandler, DocumentAdminHandler>();
```

이름 붙은 정책은 엔드포인트마다 같은 처리기들을 다시 적지 않고 재사용하는 방법입니다. 정책 하나에 싼 클레임 검사와 자원 요구 사항을 함께 묶어 두면, 문을 통과한 호출자에 대해서만 비싼 부분이 돌아갑니다.

```csharp
builder.Services.AddAuthorizationBuilder()
    .AddPolicy("EditDocument", policy =>
    {
        policy.RequireAuthenticatedUser();
        policy.RequireClaim("scope", "documents.write");
        policy.AddRequirements(Operations.Update);
    });
```

마지막 조각은 기본값입니다. 허용하는 것은 `context.Succeed` 하나뿐이니, 아무도 처리하지 않은 요구 사항은 저절로 실패합니다. 다만 그것은 묻는 엔드포인트에서만 도움이 됩니다. 깜빡한 엔드포인트도 묻게 만드는 것이 폴백 정책입니다.

```csharp
builder.Services.AddAuthorizationBuilder()
    .SetFallbackPolicy(new AuthorizationPolicyBuilder()
        .RequireAuthenticatedUser()
        .Build());
```

이 조각들을 순서대로 되짚으면 그것이 곧 장면입니다. 싼 거친 문, 판정 전에 문서를 불러오는 처리기, 가정이 아니라 이름으로 적힌 예외, 그리고 아무도 된다고 하지 않았을 때 안 된다고 말하는 기본값.
