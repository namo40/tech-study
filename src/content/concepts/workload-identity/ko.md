---
title: "Workload Identity"
summary: "Workload identity는 아무도 비밀을 저장하지 않은 채로 실행 중인 워크로드에 자기만의 자격을 줍니다. 플랫폼이 태어날 때 짧은 수명의 증명을 발급하고, 클라우드는 발급자와 대상을 확인한 뒤에야 교환해 주며, 워크로드마다 자기 몫의 좁은 역할만 쥡니다."
category: "인증과 인가"
scene: workload-identity
steps:
  - title: "저장된 비밀은 적히는 순간부터 부채입니다"
    text: "고스트는 파드에 구워 넣은 클라이언트 시크릿을 보여 줍니다. 설정으로 복사되고, 로그에 메아리치고, 레지스트리가 기억합니다. 그리고 그것을 영원히 회전시킬 책임은 누군가의 몫입니다. 워크로드 신원은 전제를 지웁니다. 증명이 발급될 것이므로 아무것도 저장하지 않습니다."
  - title: "신원은 손으로 설정하는 것이 아니라 태어날 때 발급됩니다"
    text: "플랫폼은 이 워크로드가 무엇인지 압니다. 자기가 시작했으니까요. 그래서 그렇게 말해 주는 짧은 수명의 토큰을 마운트합니다. 토큰은 몇 시간이면 만료되고 스스로 갱신됩니다. 회전은 분기 프로젝트가 아니라 세계의 기본 상태입니다. 누구도 어디에도 비밀을 입력하지 않았습니다."
  - title: "교환은 두 이름을 검사합니다. 누가 발급했고, 누구를 위한 것인가"
    text: "클라우드는 플랫폼의 발급자를 신뢰하고, 대상이 \"나\"라고 적혀 있는지 확인한 다음에야 플랫폼 토큰을 클라우드 자격으로 바꿔 줍니다. 다른 이를 위해 찍힌 토큰은 그 자리에서 거절됩니다. 페더레이션이란 두 쪽 사이에 공유 비밀이 애초에 존재한 적 없다는 뜻입니다."
  - title: "모든 워크로드는 정확히 자기 몫만 쥡니다"
    text: "pod A의 role은 storage를 열고, pod B의 role은 데이터베이스를 엽니다. 어느 쪽도 상대의 권한을 빌릴 수 없습니다. 공용 서비스 계정이 없으니 침해된 파드가 흘리는 것은 함대 전체가 아니라 그 워크로드의 권한뿐입니다. 신원이 이만큼 촘촘하면 최소 권한은 서류 작업이기를 멈춥니다. 토큰이 원래 그렇게 나올 뿐입니다."
related:
  - label: Authentication
    slug: authentication
  - label: Authorization
    slug: authorization
  - label: Audience
    slug: audience
  - label: Least Privilege
    slug: least-privilege
  - label: Issuer
    slug: issuer
  - label: Key Rotation
    slug: key-rotation
  - label: Secret Management
    slug: secret-management
  - label: API Key
    slug: api-key
  - label: Mutual TLS
    slug: mutual-tls
  - label: OAuth 2.0
    slug: oauth-2-0
  - label: JSON Web Token
    slug: json-web-token
  - label: Claims
    slug: claims
  - label: Default Deny
    slug: default-deny
references:
  - title: Use Microsoft Entra Workload ID with Azure Kubernetes Service
    url: https://learn.microsoft.com/en-us/azure/aks/workload-identity-overview
  - title: What are workload identities?
    url: https://learn.microsoft.com/en-us/entra/workload-id/workload-identities-overview
  - title: Workload identity federation
    url: https://learn.microsoft.com/en-us/entra/workload-id/workload-identity-federation
---

## 언제 쓰나

- 워크로드가 클라우드 API를 부르는데, 그 워크로드가 올라가 있는 플랫폼이 이미 그것이 무엇인지 알고 있을 때 씁니다. 쿠버네티스 위의 파드, CI 파이프라인의 잡, 서버리스 호스트의 함수는 모두 무언가가 프로세스를 시작해 주었고, 그 무언가는 프로세스를 보증할 수 있습니다. 플랫폼이 보증해 주는 순간 비밀번호가 박힌 연결 문자열은 할 일이 없어집니다. 그때 던져야 할 질문은 "비밀을 어디에 보관하나"가 아니라 "왜 비밀이 있나"입니다.
- 클라이언트 시크릿과 연결 문자열 자격을 걷어낼 때 씁니다. 이것만으로도 이전 비용은 회수됩니다. 비밀 하나를 지우면 회전 작업 하나, 볼트 항목 하나, 감사 지적 하나, 그리고 이제는 일어날 수 없게 된 사고 하나가 함께 지워집니다. 지키기 가장 싼 비밀은 애초에 만들지 않은 비밀입니다.
- CI가 클라우드에 인증해야 할 때 씁니다. OIDC로 Azure나 AWS에 페더레이션하는 GitHub Actions 워크플로는 배포 키를 아예 들고 있지 않습니다. 러너는 CI 공급자가 그 저장소와 그 브랜치를 위해 찍어 준 토큰을 내밀고, 클라우드는 그것을 짧은 수명의 자격으로 바꿔 줍니다. 대안인 저장소 시크릿 속 장수 배포 키는 업계에서 가장 흔하게 유출되는 자격이고, 스스로 만료되는 법도 없습니다.
- 지금 여러 워크로드가 클라우드 계정 하나를 나눠 쓰고 있을 때 씁니다. 그것을 쪼개는 일은 워크로드마다 서류 없이 자기가 누구인지 증명할 수 있어야 현실적입니다. 워크로드 신원은 "워크로드 하나에 역할 하나"를 발급 비용 없이 만들어 주고, 그래야 최소 권한이 희망 사항이 아니라 실제로 도달 가능한 것이 됩니다.
- 노트북에서는 쓰지 않습니다. 로컬 개발용으로 운영 비밀을 몰래 들여오는 용도로도 쓰지 마세요. 개발 머신에는 개발자 자격, 장치 로그인, 로컬 에뮬레이터라는 자기 경로가 있습니다. 로컬 개발이 돌아가는 데 운영 비밀이 필요하다면 운영 비밀은 여전히 존재하는 것이고, 그 조직은 이 패턴을 도입한 것이 아니라 장식한 것입니다.
- 인가를 건너뛰는 수단으로도 쓰지 않습니다. 워크로드 신원이 답하는 것은 "누가 부르고 있나"까지입니다. 그 호출자가 무엇을 해도 되는지는 별개의 결정이고, 모든 워크로드에 거대한 역할 하나를 주면 공용 계정을 단계만 늘려서 재현하게 됩니다.

## 주의점

- 플랫폼의 발급자가 신뢰의 뿌리가 됩니다. 클라우드가 클러스터의 OIDC 발급자와 페더레이션한 뒤에는, 그 클러스터가 토큰을 찍어 줄 수 있는 모든 것이 페더레이션된 자격이 허용하는 범위에 닿습니다. 발급자의 키를 보호하고, 신뢰하는 네임스페이스에 서비스 계정을 만들 수 있는 사람이 누구인지 감사하고, "누가 이 클러스터에 배포할 수 있나"를 쿠버네티스 질문이 아니라 클라우드 접근 질문으로 다루세요.
- 대상 검증이 혼동 대리를 막는 벽입니다. 토큰은 누군가를 향해 서명된 진술입니다. 수신자가 다른 서비스를 향한 토큰을 받아 준다면, 토큰을 쥔 어떤 서비스든 그 수신자를 상대로 재생될 수 있습니다. 대상이 자기가 아닌 토큰을 받지 마세요. 연동을 성사시키려고 대상을 넓히지도 마세요. 검사를 꺼 버리는 라이브러리 설정은 의심하고 봐야 합니다.
- 짧은 수명은 불편이 아니라 설계입니다. 교환한 자격은 유효한 동안 메모리에 캐시하고, 만료 전에 갱신하고, 디스크와 로그와 공유 캐시에는 절대 쓰지 마세요. 한번 영속화된 자격은 조용히 다시 저장된 비밀이 되고, 그것이야말로 걷어내려던 대상입니다.
- 페더레이션 주체가 곧 신원입니다. 보통은 네임스페이스와 서비스 계정 이름, 또는 저장소와 브랜치로 된 문자열입니다. 네임스페이스를 바꾸거나, 워크로드를 옮기거나, 브랜치 보호 규칙을 손대면 워크로드가 누구인지가 소리 없이 달라지고, 그 고장은 신원이 바뀐 것처럼이 아니라 권한 버그처럼 보입니다. 주체는 명시적으로 고정하고, 역할 할당을 검토하듯 검토하세요.
- 워크로드 하나에 역할 하나이며 공용 서비스 계정은 두지 않습니다. 침해된 파드의 폭발 반경은 그 파드가 실행되던 신원의 권한과 정확히 같습니다. 그래서 워크로드 둘이 역할 하나를 나눠 쓰는 순간 이 패턴의 값어치는 다 쓰여 버립니다. 두 워크로드가 정말로 같은 접근이 필요하다면, 그것은 기본값으로 손이 가는 일이 아니라 결정으로 적어 둘 만한 일입니다.
- 보증받을 수 없는 것들에는 다른 경로가 필요합니다. 레거시 호스트, 서드파티 SaaS 콜백, 벤더 연동은 여전히 자격이 필요할 수 있습니다. 그런 것들은 볼트에 두고, 수를 적게 유지하고, 누군가 한눈에 읽을 수 있을 만큼 짧은 목록으로 유지하세요.

## .NET에서는

핵심은 애플리케이션 코드가 자격도 분기도 들고 있지 않다는 것입니다. `DefaultAzureCredential`은 여러 공급원을 순서대로 훑어서 지금 실행 중인 환경에 존재하는 것을 집어 옵니다. 클러스터라면 마운트된 페더레이션 토큰이고, 노트북이라면 개발자 로그인입니다. 그리고 모든 Azure SDK 클라이언트가 같은 객체를 받습니다.

```csharp
// Program.cs — 어느 환경에서나 같은 두 줄.
var credential = new DefaultAzureCredential();

builder.Services.AddSingleton(
    new BlobServiceClient(new Uri("https://contoso.blob.core.windows.net"), credential));
builder.Services.AddSingleton(
    new SecretClient(new Uri("https://contoso.vault.azure.net"), credential));
```

연결 문자열도 없고, 키도 없고, 회전시킬 것도 없습니다. 자격 객체는 스레드 안전하고 내부에서 토큰을 캐시하므로 요청마다 만들지 않고 싱글턴으로 한 번만 등록합니다.

운영에서 무엇을 기대하는지 분명히 적고 싶다면 체인에 맡기지 말고 자격을 직접 지정합니다. `WorkloadIdentityCredential`은 투영된 토큰을 파일 시스템에서 바로 읽어 교환합니다.

```csharp
var credential = builder.Environment.IsDevelopment()
    ? new DefaultAzureCredential()          // 노트북에서는 개발자 로그인
    : new WorkloadIdentityCredential();     // 클러스터에서는 마운트된 토큰
```

실제로 마운트되는 것은 클러스터 API 서버가 파드 안으로 투영한 짧은 수명의 JWT와, 그것이 어디에 있고 누구를 위한 것인지 알려 주는 환경 변수 셋입니다. 선언은 배포 매니페스트가 하고, 애플리케이션은 아무것도 하지 않습니다.

```yaml
# 서비스 계정이 곧 신원이고, 애노테이션이 페더레이션 주체입니다.
apiVersion: v1
kind: ServiceAccount
metadata:
  name: orders
  namespace: shop
  annotations:
    azure.workload.identity/client-id: "00000000-0000-0000-0000-000000000000"
---
apiVersion: apps/v1
kind: Deployment
spec:
  template:
    metadata:
      labels:
        azure.workload.identity/use: "true"   # AZURE_FEDERATED_TOKEN_FILE 주입
    spec:
      serviceAccountName: orders
```

교환 자체가 알아 둘 값어치가 있는 부분이고, 장면의 3단계가 바로 그것입니다. 자격은 투영된 토큰을 읽어 신원 공급자에게 보내고 클라우드 액세스 토큰을 돌려받습니다. 공급자는 답하기 전에 두 가지를 봅니다. 신뢰하라고 들은 발급자가 서명했는가, 그리고 대상이 다른 누구도 아닌 자기를 가리키는가입니다.

```csharp
// WorkloadIdentityCredential이 하는 일을 풀어 쓰면 이렇습니다.
var assertion = await File.ReadAllTextAsync(
    Environment.GetEnvironmentVariable("AZURE_FEDERATED_TOKEN_FILE")!, ct);

var token = await confidentialClient
    .AcquireTokenForClient(new[] { "https://storage.azure.com/.default" })
    .WithClientAssertion(_ => Task.FromResult(assertion))   // 클라이언트 시크릿은 어디에도 없다
    .ExecuteAsync(ct);
```

이 흐름 어디에도 공유 비밀은 없습니다. 클러스터는 서명으로 파드의 신원을 증명하고, 클라우드는 발급자의 well-known 문서에서 가져온 공개 키로 그 서명을 확인합니다. 두 쪽은 사적인 것을 주고받은 적이 없고, 그것이 페더레이션으로 얻는 바로 그 이득입니다.

내가 만든 API가 받는 쪽이 될 때도 검증하는 것은 같은 두 이름입니다. 여기서 대상을 틀리는 것이 혼동 대리 구멍이므로, 라이브러리 기본값을 받아들이지 말고 명시적으로 적을 값어치가 있습니다.

```csharp
builder.Services.AddAuthentication().AddJwtBearer(options =>
{
    options.Authority = "https://login.microsoftonline.com/<tenant>/v2.0";
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true,
        ValidIssuer = "https://login.microsoftonline.com/<tenant>/v2.0",
        ValidateAudience = true,
        ValidAudience = "api://orders",   // 다른 누군가를 위해 찍힌 토큰은 거절된다
        ValidateLifetime = true,
    };
});
```

그러면 최소 권한은 코드의 문제가 아니라 할당의 문제가 됩니다. 워크로드마다 자기 신원이 필요한 범위에서 필요한 역할 하나를 받고, 나눠 쓰는 것은 없습니다.

```bash
# pod A는 storage를 열고, storage만 엽니다
az role assignment create --assignee $ORDERS_CLIENT_ID \
  --role "Storage Blob Data Contributor" \
  --scope "/subscriptions/$SUB/resourceGroups/shop/providers/Microsoft.Storage/storageAccounts/orders"
```

마지막 모양은 그대로 적어 둘 만합니다. 애플리케이션에 비밀이 없고, 저장소에 비밀이 없고, 컨테이너 이미지에 비밀이 없고, 만료되는 것은 아무도 입력하지 않은 토큰 하나뿐입니다. 회전이 프로젝트이기를 멈춘 이유는 회전시킬 것이 남아 있지 않기 때문입니다.
