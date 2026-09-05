---
title: "API Key"
summary: "API key는 기계가 내미는 신원의 증거입니다. 한 번 발급받은 긴 비밀을 호출마다 제시하고 등록부와 대조합니다. 소지가 증명의 전부라서, 새어 나간 키는 곧 새어 나간 신원입니다."
category: "인증과 인가"
scene: authentication
sceneStep: 3
related:
  - label: Authentication
    slug: authentication
  - label: Mutual TLS
    slug: mutual-tls
  - label: Key Rotation
    slug: key-rotation
  - label: Workload Identity
    slug: workload-identity
  - label: Signature
    slug: signature
  - label: Bearer Token
    slug: bearer-token
  - label: Access Token
    slug: access-token
  - label: JSON Web Token
    slug: json-web-token
  - label: Claims
    slug: claims
  - label: Authorization
    slug: authorization
  - label: OAuth 2.0
    slug: oauth-2-0
  - label: OpenID Connect
    slug: openid-connect
  - label: Cookie Authentication
    slug: cookie-authentication
references:
  - title: "Subscriptions in Azure API Management"
    url: https://learn.microsoft.com/en-us/azure/api-management/api-management-subscriptions
  - title: "AzureKeyCredential Class"
    url: https://learn.microsoft.com/en-us/dotnet/api/azure.azurekeycredential
  - title: "Azure Key Vault Overview"
    url: https://learn.microsoft.com/en-us/azure/key-vault/general/overview
---

장면의 3단계를 보면 기계에 없는 것이 눈에 띕니다. `service` 캡슐에는 비밀번호가 없습니다. 칠 손가락도 없고 기억할 사람도 없기 때문입니다. 대신 점 옆에 판이 하나 붙어서 이동합니다. 아는 것이 아니라 쥐고 있는 것입니다. 검증자는 그것을 읽고 등록부에서 찾아보며, 그 답의 모양은 한 단계 앞에서 사람에게 준 답과 같습니다. 방식이 바뀌었을 뿐 질문은 바뀌지 않았습니다.

이것이 사실상 API key의 전부입니다. 서버가 해석해야 할 구조도 없고 안에서 따질 클레임도 없는, 길고 무작위한 불투명한 문자열입니다. 서버는 자기가 발급한 키와 그 키가 누구의 것인지를 표로 들고 있고, 검증은 조회입니다. 유도되는 것도 없고 계산되는 것도 없고 스스로 만료되지도 않습니다. 키는 신원에 관한 증거가 아니라, 검사의 목적에서는 그냥 신원 자체입니다. 처음 들리는 것보다 훨씬 센 말입니다.

그 결과가 장면의 3단계가 짚는 것입니다. 새어 나간 키는 즉시, 그리고 온전히 신원 유출입니다. 뒤를 받쳐 줄 두 번째 요소도 없고, 기기 결속도 없고, 낯선 로그인을 알아차릴 사용자도 없습니다. 그 문자열을 쥔 사람이 곧 그 서비스이며, 어디에서든 그렇고, 누군가 폐기할 때까지 그렇습니다. 그래서 키를 둘러싼 모든 관행은 사실 사본 하나의 값어치를 줄이는 관행입니다. 키마다 소유자가 자기 일을 할 수 있는 가장 좁은 작업 집합으로 범위를 좁히면 사본이 물려받는 것이 작아집니다. 하나를 나눠 쓰지 말고 호출자마다 자기 키를 주면, 다른 모두를 끊지 않고도 사본을 추적하고 폐기할 수 있습니다. 그리고 일정에 따라 교체하면, 아무도 알아차리지 못한 사본에도 유효 기간이 생깁니다.

교체는 건너뛰기 쉬운 부분이고, 건너뛰는 이유는 순진하게 하면 장애가 나기 때문입니다. 해법은 두 키를 동시에 유효하게 두는 것입니다. 새 키를 발급하고, 호출자들에게 배포하고, 옛 키로 오는 트래픽이 멈출 때까지 기다린 다음에야 옛 키를 폐기합니다. 쓸 만한 키 저장소는 모두 이 겹침을 지원하고, 겹침이 생기는 순간 교체는 사건이 아니라 일정이 됩니다.

키가 있으면 안 되는 곳은 키가 있어야 할 곳만큼이나 중요합니다. URL에는 두지 않습니다. URL은 접근 로그, 브라우저 기록, 리퍼러 헤더, 오류 보고서에 남기 때문입니다. 저장소에도, 컨테이너 이미지에도, 클라이언트 번들에도 두지 않습니다. 브라우저나 휴대폰으로 내보낸 것은 저장한 것이 아니라 공개한 것이기 때문입니다. 키는 플랫폼이 주는 비밀 저장소에 있어야 하고, 실행할 때 주입되어야 하며, 우리 코드가 어디에도 적어 두지 않아야 합니다. 그 취급에는 로그에 남기지 않는 것도 포함됩니다. 스택 트레이스에 나타난 키는 이미 밖으로 나간 키입니다.

.NET에서 클라이언트 쪽은 한 번 설정해 두는 `HttpClient`의 헤더이고, 값은 저장소에 있는 파일이 아니라 비밀 저장소에 연결된 구성에서 옵니다.

```csharp
builder.Services.AddHttpClient("billing", client =>
{
    client.BaseAddress = new Uri("https://billing.internal/");
    // 키는 쿼리 문자열이 아니라 헤더에 담습니다. URL은 기본으로 기록되지만,
    // 헤더는 누군가 요청 로깅을 켰을 때만 기록됩니다.
    client.DefaultRequestHeaders.Add("X-Api-Key", builder.Configuration["Billing:ApiKey"]);
});
```

서버 쪽은 작은 인증 핸들러이고, 중요한 두 가지는 모두 비교에 있습니다. 키 자체가 아니라 해시로 조회하면 데이터베이스 사본이 모든 키의 사본이 되지는 않습니다. 그리고 고정 시간으로 비교합니다. 일찍 끝나는 비교는 어디까지 일치했는지를, 시간을 잴 인내심이 있는 사람에게 흘리기 때문입니다.

```csharp
var provided = context.Request.Headers["X-Api-Key"].ToString();

// 헤더가 없거나 접두사를 담기에 너무 짧으면 조회할 것이 없고,
// 인덱싱하면 거절 대신 예외가 납니다.
if (provided.Length < 8) return AuthenticateResult.NoResult();

var digest = SHA256.HashData(Encoding.UTF8.GetBytes(provided));

// 조회 한 번, 그다음 저장된 다이제스트와의 고정 시간 비교입니다.
var record = await registry.FindByPrefixAsync(provided[..8]);
if (record is null || !CryptographicOperations.FixedTimeEquals(digest, record.Digest))
{
    return AuthenticateResult.Fail("unknown api key");
}
```

솔직하게 덧붙이면, API key는 장면이 보여 주는 세 방식 중 가장 약하고 그 이유를 분명히 해 둘 만합니다. 비밀번호 뒤에는 두 번째 요소를 요구할 수 있는 사람이 있고, 인증서는 회선을 건너지 않는 개인 키의 소지를 증명합니다. 키는 호출마다 보내는 비밀이므로, 요청을 읽을 수 있는 모든 구간이 신원을 읽을 수 있습니다. 대안이 아무것도 없을 때, 인증서를 발급해 줄 수 없는 외부 호출자일 때, 또는 지금 있는 플랫폼에 더 나은 수단이 없을 때는 API key가 옳은 답입니다. 플랫폼에 Managed Identity나 워크로드 ID, mutual TLS 같은 수단이 있다면 그쪽이 더 나은 이유는 바로, 안 그러면 우리가 지켜야 했을 문자열을 아예 없애 주기 때문입니다.
