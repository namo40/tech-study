---
title: "Key Rotation"
summary: "키 회전은 겹침을 두고 일정에 따라 자격 증명을 교체합니다. 호출자가 갈아타는 동안 두 키가 함께 유효하고, 서명은 키 하나로 하되 검증은 링으로 하며, 유출된 키는 영구 신원이 아니라 닫혀 가는 창이 됩니다."
category: "인증과 인가"
scene: key-rotation
steps:
  - title: "바뀌지 않는 키는 재설정할 수 없는 비밀번호입니다"
    text: "키 하나가 영원히 유효하면, 설정 파일에, 로그 한 줄에, 퇴사자의 노트북에 만들어진 모든 사본이 계속 살아 있는 신원입니다. 고스트는 만료되지 않는 유출을 보여 줍니다. 회전은 신뢰에 수명을 답니다. 키는 가보가 아니라 판본입니다."
  - title: "두 키가 동시에 유효한 것이 회전을 지루하게 만듭니다"
    text: "key A가 아직 통하는 동안 key B가 발급됩니다. 서비스는 둘 다 받고, 호출자는 배포 한 번에 한 명씩 갈아타고, 전환 중이라는 이유로 거절당하는 쪽은 없습니다. A로 오는 트래픽이 잠잠해진 뒤에야 A를 폐기합니다. 겹침 없는 회전은 일정표가 붙은 장애입니다."
  - title: "서명은 키 하나로, 검증은 링 전체로 합니다"
    text: "새 토큰은 최신 키로 서명하지만 어제의 토큰은 아직 날아다니는 중입니다. 그래서 검증자는 최근 키들의 링을 들고 있고, kid 헤더가 어느 키로 확인할지 알려 줍니다. 옛 서명은 필요한 동안 정확히 그만큼 검증 가능하게 남고, 어떤 회전도 수명 중간의 토큰을 무효로 만들지 않습니다."
  - title: "유출은 비상 회전입니다. 같은 길을 더 빨리 달릴 뿐입니다"
    text: "key B가 새어 나갑니다. 회전이 일상이라면 폐기와 교체는 새벽 3시의 즉흥이 아니라 연습된 동작입니다. 창은 몇 분 안에 닫힙니다. 그것을 가능하게 하는 것은 키 자체를 둘러싼 규율입니다. 비밀 저장소에 보관하고, 참조로 배포하고, 모든 접근을 감사합니다."
related:
  - label: API Key
    slug: api-key
  - label: Token Rotation
    slug: token-rotation
  - label: Signature
    slug: signature
  - label: Secret Management
    slug: secret-management
  - label: Secret Store
    slug: secret-store
  - label: Secret Injection
    slug: secret-injection
  - label: Key Ring
    slug: key-ring
  - label: Token Revocation
    slug: token-revocation
  - label: JSON Web Token
    slug: json-web-token
  - label: Mutual TLS
    slug: mutual-tls
  - label: Workload Identity
    slug: workload-identity
  - label: Authentication
    slug: authentication
references:
  - title: Configure cryptographic key auto-rotation in Azure Key Vault
    url: https://learn.microsoft.com/en-us/azure/key-vault/keys/how-to-configure-key-rotation
  - title: Key management in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/security/data-protection/implementation/key-management?view=aspnetcore-10.0
  - title: Rotation tutorial for resources with two sets of credentials
    url: https://learn.microsoft.com/en-us/azure/key-vault/secrets/tutorial-rotation-dual
---

## 언제 쓰나

- 오래 사는 자격 증명은 전부 해당합니다. API 키, 서명 키, 연결 문자열, 클라이언트 시크릿, 인증서. 어떤 문자열이 접근 권한을 주는데 시스템의 어느 부분도 그것을 교체하지 않는다면, 그것은 인증이 아니라 여러 곳에 흩어져 저장된 영구 신원입니다.
- 유출된 뒤가 아니라 유출되기 전에 합니다. 달력을 보고 회전하는 이유는 비상 경로를 이미 걸어 본 길로 만들어 두기 위해서입니다. 분기마다 회전하는 팀은 유출된 키를 반나절 만에 폐기하고, 압박 속에서 처음 회전하는 팀은 절차와 배포를 동시에 발명합니다.
- 비밀을 본 사람이 더는 그것을 필요로 하지 않게 될 때마다 합니다. 퇴사, 계약 종료, 노트북 분실, 저장소 공개가 모두 그런 순간입니다. 한 번 본 문자열은 되돌릴 수 없으니, 그들이 가져간 것을 실제로 무효로 만드는 행동은 회전뿐입니다.
- 규정이 요구할 때도 씁니다. PCI DSS, SOC 2, 그리고 대부분의 고객 보안 검토가 어차피 요구합니다. 그래서 선택지는 회전을 전제로 설계하느냐, 1년에 한 번씩 고통스럽게 겪느냐 둘뿐입니다.
- 호출자 둘 이상이 공유하는 자격 증명. 키가 사는 곳이 많을수록 겹침 구간이 중요해지고, 이 문제의 공학적 핵심은 사실상 겹침 구간이 전부입니다.

## 주의점

- 겹침 없는 회전은 스스로 잡아 놓은 장애 일정입니다. 순서는 발급, 배포, 전환, 옛 키 트래픽이 잠잠해졌는지 확인, 그리고 폐기입니다. 발급에서 폐기로 곧장 건너뛰면 일상적인 변경이 모든 곳에 같은 순간 도착해야 하는 배포로 바뀝니다. 분산 시스템이 가장 못하는 일이 바로 그것입니다.
- "옛 키가 잠잠해졌다"는 짐작이 아니라 측정이어야 합니다. 요청마다 어느 키가 처리했는지 로그에 남기고, 가장 느린 호출자의 캐시 주기보다 더 오랫동안 옛 키의 횟수가 0이었을 때 폐기합니다. 그 숫자가 없으면 폐기는 도박입니다.
- 검증과 서명은 서로 다른 시계로 회전합니다. 서명은 곧바로 최신 키로 바꾸되, 옛 키들이 서명한 토큰이 만료될 때까지는 최근 키들의 링으로 계속 검증합니다. kid 헤더와 JWKS 문서가 있는 이유가 정확히 이것입니다. 검증자가 여러 키를 동시에 들고 있을 수 있게 하려는 장치입니다. 그 문서의 캐시 주기는 폐기가 실제로 효력을 내기까지 걸리는 시간에 그대로 더해집니다.
- 키에서 파생된 것을 함께 회전하지 않으면 고스트가 남습니다. 옛 키로 발급된 세션, 캐시된 토큰, 큐로 밀어 넣은 하위 사본이 그렇습니다. 각각이 자기 수명을 가진 독립된 자격 증명이라서, 마지막 하나가 사라져야 유출이 닫힙니다.
- 참조로 배포하지 않으면 회전이 매번 재배포가 됩니다. 호출자가 시작할 때와 갱신 주기마다 저장소에서 비밀을 읽어 오면 회전은 데이터 변경입니다. 빌드 시점에 환경 변수로 구워 넣으면 회전은 릴리스가 되고, 릴리스야말로 새벽 3시에 가장 하기 싫은 일입니다.
- 키의 사용만이 아니라 읽기를 감사합니다. 키가 유출됐을 때 피해 범위를 알려 주는 것은 접근 로그입니다. 누가, 언제, 어디서 가져갔는지가 거기 남습니다. 그것이 없으면 "무엇이 털렸나"에 대한 정직한 대답은 "처음부터 전부"입니다.
- 폐기 경로도 발급 경로만큼 자주 시험합니다. 새 키를 발급하는 절반은 늘 잘 됩니다. 누군가 지켜보고 있기 때문입니다. 폐기하는 절반은 아무도 기억하지 못하던 서비스를 찾아냅니다. 그 서비스는 화요일 낮에 찾아내는 편이 낫습니다.

## .NET에서는

Azure Key Vault가 일정을 직접 맡을 수 있습니다. 그러면 회전은 운영 문서의 한 단계가 아니라 볼트가 강제하는 정책이 됩니다.

```csharp
var keys = new KeyClient(new Uri(vaultUri), new DefaultAzureCredential());

await keys.UpdateKeyRotationPolicyAsync("signing-key", new KeyRotationPolicy
{
    ExpiresIn = "P90D",
    LifetimeActions =
    {
        // Cut the next edition a month before this one expires. That month
        // is the overlap, and the overlap is what makes it uneventful.
        new KeyRotationLifetimeAction(KeyRotationPolicyAction.Rotate)
        {
            TimeBeforeExpiry = "P30D",
        },
    },
});
```

호출자는 비밀의 사본이 아니라 참조를 들고 있어야 합니다. 요청마다 볼트를 부르지 않도록 조회를 캐시하되, 캐시 수명은 의도적으로 정합니다. 그 길이가 곧 폐기가 이 프로세스에 도달하기까지 걸리는 시간입니다.

```csharp
// The cache lifetime is a security parameter, not a performance one.
var connection = await cache.GetOrCreateAsync("orders-db", async entry =>
{
    entry.AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(5);
    var secret = await secrets.GetSecretAsync("orders-db");
    return secret.Value.Value;
});
```

ASP.NET Core의 Data Protection이 이미 이 방식으로 동작하고, 본보기로 읽어 볼 만합니다. 키 링을 들고 있다가 기본값 90일이 지나면 활성 키를 물리고, 새 페이로드는 최신 키로 보호하며, 옛 키로 만들어진 페이로드는 그 키가 링에서 빠질 때까지 계속 풀어냅니다.

```csharp
builder.Services.AddDataProtection()
    .PersistKeysToAzureBlobStorage(new Uri(blobUri), new DefaultAzureCredential())
    .ProtectKeysWithAzureKeyVault(new Uri(wrappingKeyUri), new DefaultAzureCredential())
    .SetDefaultKeyLifetime(TimeSpan.FromDays(90));
```

토큰이라면 JWKS 문서에 일을 맡깁니다. 핸들러가 발급자의 공개 키를 가져와 kid로 맞춰 보고 자기 주기에 따라 갱신하므로, 발급자 쪽 회전에 이쪽에서 배포할 것은 없습니다.

```csharp
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.Authority = "https://login.example.com";
        // How long a rotated-out key can still be accepted, and how quickly a
        // new one becomes usable. Both are this number.
        options.AutomaticRefreshInterval = TimeSpan.FromHours(12);
        options.RefreshInterval = TimeSpan.FromMinutes(5);
    });
```

회전 비용이 가장 싼 키는 애초에 들고 있지 않는 키입니다. Managed Identity, 워크로드 아이덴티티 페더레이션, `DefaultAzureCredential`은 저장된 비밀을 플랫폼이 발급하고 회전해 주는 토큰으로 대체합니다. 설정 파일에 한 번도 등장하지 않는 자격 증명은 설정 파일에서 새어 나갈 수도 없습니다.
