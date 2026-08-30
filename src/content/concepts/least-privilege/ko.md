---
title: "Least Privilege"
summary: "최소 권한은 신원마다 필요한 것만 주고 그 이상은 주지 않는 원칙입니다. 그래서 침해가 일어나도 새어 나가는 것은 시스템 전체가 아니라 그 신원의 몫뿐입니다. 통과해야 할 검토가 아니라 권한의 모양에 관한 설계 결정입니다."
category: "인증과 인가"
scene: workload-identity
sceneStep: 4
related:
  - label: Workload Identity
    slug: workload-identity
  - label: Authorization
    slug: authorization
  - label: Default Deny
    slug: default-deny
  - label: Audience
    slug: audience
  - label: Claims
    slug: claims
  - label: Authentication
    slug: authentication
  - label: Key Rotation
    slug: key-rotation
  - label: Secret Management
    slug: secret-management
  - label: API Key
    slug: api-key
references:
  - title: Increase security with the principle of least privilege
    url: https://learn.microsoft.com/en-us/entra/identity-platform/secure-least-privileged-access
  - title: Best practices for Azure RBAC
    url: https://learn.microsoft.com/en-us/azure/role-based-access-control/best-practices
  - title: Use Microsoft Entra Workload ID with Azure Kubernetes Service
    url: https://learn.microsoft.com/en-us/azure/aks/workload-identity-overview
---

장면의 4단계는 이 생각 전부를 그림 하나로 그립니다. pod A의 role은 storage를 열고 pod B의 role은 데이터베이스를 엽니다. 그래서 둘은 각자 자기 자원에 닿아 ok를 받고, pod A가 데이터베이스로 손을 뻗으면 거절당합니다. 그 거절에는 극적인 구석이 하나도 없습니다. 공격도 없고, 이상 징후도 없고, 누굴 깨울 만한 경보도 없습니다. 그 접근이 role에 없었을 뿐이고, role이란 그 워크로드가 건드려도 되는 범위의 모양입니다.

이 그림이 그릴 값어치가 있는 이유는 반대 상황에 있습니다. 두 파드가 공용 서비스 계정 하나로 돌았다면 저 세 번의 접근이 모두 성공했을 것이고, 둘 중 하나가 침해되기 직전까지 시스템은 지금과 똑같아 보였을 것입니다. 그 순간 차이는 사고의 크기로 드러납니다. 워크로드마다 role이 하나면 pod A에 들어온 공격자가 쥔 것은 storage뿐이고 데이터베이스는 여전히 남의 문제입니다. 최소 권한은 침해 가능성을 줄여 주지 않습니다. 침해가 얼마짜리인지를 미리 정해 둘 뿐입니다.

이 원칙이 서류 작업이라는 평판을 얻은 이유는 적용에 비용이 들기 때문입니다. 계정 하나를 열로 쪼갠다는 것은 신원을 열 개 만든다는 뜻이고, 신원이 곧 발급하고 저장하고 회전시키다 결국 유출되는 자격을 뜻하던 시절에는 열 개가 하나보다 문제가 아홉 개 더 많은 것이었습니다. 팀을 넉넉한 역할 하나로 밀어붙인 것이 이 셈법이고, 워크로드 신원이 바꾸는 것이 정확히 이 셈법입니다. 신원을 플랫폼이 기동 시점에 발급하고 스스로 만료시킨다면, 워크로드마다 신원 하나는 만드는 비용도 유지하는 비용도 들지 않습니다. 촘촘함이 비싸기를 멈추면 나눠 쓸 이유도 사라집니다.

습관 세 가지가 일의 대부분을 합니다. 돌아가는 선에서 가장 좁은 범위에 부여합니다. 스토리지 계정 하나가 아니라 컨테이너 하나에, 서버 하나가 아니라 데이터베이스 하나에 주는 식입니다. 보통은 역할 이름보다 범위가 더 큰 지렛대입니다. 넓은 역할보다 구체적인 내장 역할을 고르고, 직접 유지해야 할 사용자 지정 역할을 만드느니 넓은 내장 역할을 고릅니다. 그리고 쓰기와 읽기를 갈라 둡니다. 보고만 하는 서비스가 무언가를 바꿀 수 있어서는 안 되고, 그렇게 말해 두는 비용은 할당 하나입니다.

.NET에서 이 모양은 코드가 아니라 할당에서 나오고, 그것이 바로 요점입니다. 애플리케이션은 리소스를 위한 토큰을 요청할 뿐이고, 역할이 있거나 없거나 둘 중 하나입니다.

```bash
# 워크로드 하나, 역할 하나, 범위 하나
az role assignment create --assignee $ORDERS_CLIENT_ID \
  --role "Storage Blob Data Contributor" \
  --scope ".../storageAccounts/orders/blobServices/default/containers/receipts"
```

API 안에서도 들어온 호출자가 무엇을 해도 되는지에 같은 원칙이 적용됩니다. 클레임을 키로 삼은 정책은 결정을 한곳에 모으고 엔드포인트를 읽기 좋게 유지해 주므로, 새 권한은 여기저기 흩어진 `if` 문이 아니라 정책 하나가 됩니다.

```csharp
builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("orders:read", policy => policy.RequireClaim("scp", "Orders.Read"));
    options.AddPolicy("orders:write", policy => policy.RequireClaim("scp", "Orders.Write"));
});

app.MapGet("/orders/{id}", GetOrder).RequireAuthorization("orders:read");
app.MapPost("/orders", PlaceOrder).RequireAuthorization("orders:write");
```

지켜봐야 할 고장 양상은 표류입니다. 권한은 사고 대응 중에 붙었다가 걷히지 않고, 좁게 시작한 역할이 팀이 겪은 모든 비상 상황의 합집합이 됩니다. 처방은 지루하지만 잘 듣습니다. 임시 접근은 임시로 부여하고, 의존성을 검토하듯 할당을 주기적으로 검토하고, "이 신원이 실제로 쓰는 것은 무엇인가"를 답이 있는 질문으로 다루세요. 접근 로그에 답이 들어 있습니다.

최소 권한은 애초에 한 번도 어기지 않을 때 가장 지키기 쉽습니다. 새 워크로드는 아무것도 없는 상태에서 시작하고, 첫 호출이 돌아가게 하는 권한 하나를 붙이고, 목록이 의도적으로 한 줄씩 자라게 두세요. 모든 것을 쥐고 시작해서 나중에 조금씩 걷어내려는 방식과는 전혀 다른 일이고, 후자는 끝나는 법이 없습니다.
