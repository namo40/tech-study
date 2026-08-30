---
title: "Audience"
summary: "Audience는 토큰이 향하고 있는 대상의 이름입니다. 이것을 검증해야 수신자가 남을 위해 찍힌 증명을 받아들이지 않게 되고, 그것이 서명이 유효한 것과 여기에서 유효한 것 사이의 차이입니다."
category: "인증과 인가"
scene: workload-identity
sceneStep: 3
related:
  - label: Workload Identity
    slug: workload-identity
  - label: Issuer
    slug: issuer
  - label: JSON Web Token
    slug: json-web-token
  - label: Claims
    slug: claims
  - label: OAuth 2.0
    slug: oauth-2-0
  - label: Authentication
    slug: authentication
  - label: Authorization
    slug: authorization
  - label: Least Privilege
    slug: least-privilege
  - label: Mutual TLS
    slug: mutual-tls
references:
  - title: Access token claims reference
    url: https://learn.microsoft.com/en-us/entra/identity-platform/access-token-claims-reference
  - title: Configure JWT bearer authentication in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/security/authentication/configure-jwt-bearer-authentication?view=aspnetcore-10.0
  - title: Workload identity federation
    url: https://learn.microsoft.com/en-us/entra/workload-id/workload-identity-federation
---

장면의 3단계는 두 이름 위에서 돌아가고, 흥미로운 쪽은 두 번째입니다. 클라우드는 발급자를 읽고 신뢰하기로 합의한 서명자가 만든 토큰이라고 판단합니다. 이 검사는 건네받은 두 토큰 모두 통과합니다. 그다음 클라우드는 대상을 읽습니다. 토큰이 누구를 향해 적혔는지를 말하는 이름이고, 둘 중 하나만 "나"라고 말합니다. 나머지 하나는 아무 문제 없이 진짜인데도 그 자리에서 거절되며, 그 거절이야말로 이 검사가 존재하는 이유 전부입니다.

서명이 증명하는 것은 발급자가 그 토큰을 썼다는 사실뿐입니다. 누가 받기로 되어 있었는지에 대해서는 아무 말도 하지 않습니다. 대상 검사가 없으면 어떤 발급자를 신뢰하는 모든 서비스가 그 발급자가 서명한 모든 토큰을 받아들이게 됩니다. 그 서비스들 중 어느 하나가 정당하게 받은 토큰을 나머지 아무에게나 내밀 수 있다는 뜻입니다. 그것이 혼동 대리입니다. 호출자보다 팔이 긴 구성 요소가 호출자의 증명을 들고 호출자 대신 일해 주는 상황입니다. 대상은 토큰을 정확히 한 곳에서만 쓸모 있게 만들어서 이 구멍을 닫습니다.

작동 방식 자체는 단순합니다. JWT에서 대상은 `aud` 클레임이고, 수신자는 그것을 자기가 알고 있는 자기 식별자와 견줍니다. OAuth 흐름에서는 클라이언트가 특정 리소스를 위한 토큰을 요청하고, 인가 서버가 그 리소스의 식별자를 `aud`에 적습니다. 워크로드 신원 페더레이션에서는 같은 규칙이 한 층 위에서 돕니다. 플랫폼은 교환이 일어날 신원 공급자를 대상으로 하는 토큰을 찍고, 그래서 한 클라우드를 향한 토큰을 다른 클라우드에 재생할 수 없습니다.

틀리는 방법 세 가지는 짚어 둘 값어치가 있습니다. 검사를 꺼 버리는 것이 가장 눈에 띄는 방법이고, 보통 금요일에 연동을 성사시키려다 그렇게 됩니다. 설정은 `ValidateAudience = false` 한 줄이고, 한번 설정 파일에 들어가면 아무도 다시 읽지 않습니다. 받아들이는 집합을 넓히는 것은 더 조용한 방법입니다. 호출자 셋이 토큰을 서로 다르게 요청했다는 이유로 대상 셋을 받아 주는 API는 남의 증명을 건네받을 기회를 셋 갖습니다. 그리고 엉뚱한 종류의 식별자를 받아들이는 것이 가장 미묘합니다. 내 API를 위한 액세스 토큰에는 내 API의 식별자가 실려야 하고, 클라이언트 ID나 그래프 엔드포인트가 실려서는 안 됩니다. 다른 리소스를 위해 찍힌 토큰을 받아 주는 수신자는 말하지 않은 채 그 리소스의 대상과 페더레이션한 셈입니다.

.NET에서 이 검사는 발급자 옆, `TokenValidationParameters` 안에 놓이고, 물려받기보다 직접 적어 둘 값어치가 있습니다.

```csharp
options.TokenValidationParameters = new TokenValidationParameters
{
    ValidateIssuer = true,
    ValidIssuer = "https://login.microsoftonline.com/<tenant>/v2.0",
    ValidateAudience = true,
    ValidAudience = "api://orders",   // 이름 하나, 그리고 그것은 나다
    ValidateLifetime = true,
};
```

검사하는 쪽이 아니라 요청하는 쪽이 될 때는 요청하는 스코프가 대상을 결정하므로, 같은 규율이 반대편에도 적용됩니다. 지금 부르려는 리소스를 위한 토큰을 요청하고, 어쩌다 받아 준다는 이유로 다른 리소스에 그 토큰을 재사용하지 마세요.

들일 만한 습관은 두 이름을 한 문장으로 읽는 것입니다. "이것은 내가 신뢰하는 누군가가 썼다"는 발급자에 대한 인증입니다. "이것은 나를 위해 쓰였다"가 그것을 내가 처리해도 되는 것으로 만들어 줍니다. 앞의 것만 검사하는 시스템은 진짜이기만 하면 자기 앞으로 온 것이기도 하다고 결정한 셈인데, 그런 결정을 일부러 내린 사람은 아무도 없습니다.
