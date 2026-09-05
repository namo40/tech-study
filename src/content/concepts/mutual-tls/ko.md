---
title: "Mutual TLS"
summary: "Mutual TLS는 증명을 양방향으로 만듭니다. 양쪽 끝이 서로 신뢰하는 기관이 서명한 인증서를 제시하므로 연결 자체가 신원을 실어 나르고, 비밀은 회선을 건너지 않습니다."
category: "인증과 인가"
scene: authentication
sceneStep: 4
related:
  - label: Authentication
    slug: authentication
  - label: API Key
    slug: api-key
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
  - title: "Configure certificate authentication in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/authentication/certauth
  - title: "Set Up TLS Mutual Authentication in Azure App Service"
    url: https://learn.microsoft.com/en-us/azure/app-service/app-service-web-configure-tls-mutual-auth
  - title: "The Transport Layer Security (TLS) Protocol Version 1.3 (RFC 8446)"
    url: https://www.rfc-editor.org/rfc/rfc8446
---

장면의 4단계를 보면 그림의 어느 쪽이 바뀌는지 드러납니다. 세 단계 동안 부르는 쪽만 자신을 증명했고 검증자는 그러지 않았습니다. 문이 무엇을 요구하든, 아무도 문에게 되묻지 않았습니다. 4단계에서는 검증자 안에 인증서가 나타나고, 두 캡슐에도 인증서가 나타납니다. 어떤 호출도 출발하기 전에 말입니다. 이 순서가 핵심입니다. 핸드셰이크는 요청의 일부가 아니라, 요청을 보낼 통로가 생기기 전에 끝나 있어야 하는 것입니다.

보통의 TLS도 이미 한 방향은 증명합니다. 브라우저는 서버가 제시한 인증서가 신뢰하는 기관의 서명을 받았는지, 그리고 거기 적힌 이름이 접속한 호스트와 맞는지 확인합니다. 그래서 아무나가 아니라 그 은행과 이야기하고 있다는 것을 압니다. Mutual TLS는 그 검사를 반대 방향으로도 돌립니다. 서버가 클라이언트에게 인증서를 요구하고, 같은 방식으로 체인과 폐기 상태를 확인하고, 답이 마음에 들지 않으면 핸드셰이크를 거절합니다. 증명은 둘이지만 장치는 하나이고, 어느 쪽도 비밀을 보내지 않습니다.

마지막 대목이 비밀번호나 API key와 종류를 가르는 지점입니다. 인증서는 공개 문서입니다. 소지를 증명하는 것은 인증서가 아니라 개인 키이고, 그 키는 자기가 있는 기계를 떠나지 않습니다. 핸드셰이크 동안 그 키가 양쪽이 방금 합의한 무언가에 서명하고, 상대는 그 서명을 검증합니다. 엿듣는 쪽이 기록한 것은 어느 것도 재생할 수 없습니다. 서명된 대상이 그 핸드셰이크에만 해당하는 값이었기 때문입니다. 그래서 어느 쪽이든 위장하려면 호스트에서 개인 키를 훔쳐야 하고, 이것은 회선에서 헤더를 읽는 것과는 전혀 다른 등급의 공격입니다.

이렇게 얻는 신원은 인증서의 주체이고, 그 주체가 무엇을 뜻하는지 일찍 정해 두는 편이 좋습니다. 서비스 메시에서는 보통 워크로드 ID라서, 자동으로 발급되고 몇 년이 아니라 몇 시간 동안 유효하며 플랫폼이 아무의 손도 빌리지 않고 교체합니다. 파트너 연동에서는 한 조직이 들고 있는 장기 인증서인 경우가 더 많습니다. 둘 다 동작하지만 운영 비용이 완전히 다르고, 그 차이 때문에 메시 쪽이 흔한 경우가 되었습니다. 스스로 교체되는 짧은 수명의 인증서는 만료를 장애에서 아무 일도 아닌 것으로 바꿉니다.

실무에서 mutual TLS가 가장 자주 어긋나는 지점이 바로 만료이고, 양쪽 끝에서 다 어긋납니다. 조용히 만료된 클라이언트 인증서는 인증 실패처럼 보이지도 않는 오류 메시지와 함께 호출자 하나를 멈춥니다. 만료된 인증 기관은 모두를 한꺼번에 멈춥니다. 지나고 나서 보면 둘 다 뻔하지만, 그날이 오기 전까지는 둘 다 보이지 않습니다. 참여하는 모든 인증서의 남은 수명을 감시하고, 기한이 닥치기 한참 전에 알리고, 달력 알림보다 자동으로 갱신하는 발급자를 고릅니다.

ASP.NET Core에서 서버 쪽은 Kestrel 설정 하나와 스킴 하나입니다. 클라이언트 인증서를 요구하는 것은 전송 계층의 결정이므로, 파이프라인이 아니라 연결을 받아들이는 자리에서 설정합니다.

```csharp
builder.WebHost.ConfigureKestrel(options =>
{
    options.ConfigureHttpsDefaults(https =>
    {
        // 핸드셰이크 도중에 인증서를 요구합니다. 내놓지 못하는 연결은
        // 애초에 요청이 되지 못합니다.
        https.ClientCertificateMode = ClientCertificateMode.RequireCertificate;
    });
});

builder.Services.AddAuthentication(CertificateAuthenticationDefaults.AuthenticationScheme)
    .AddCertificate(options =>
    {
        options.AllowedCertificateTypes = CertificateTypes.Chained;
        options.RevocationMode = X509RevocationMode.Online;
    });
```

클라이언트 쪽은 `HttpClient`가 쓰는 핸들러에 인증서를 붙이는 일이고, 그래서 형식화된 클라이언트가 자연스러운 자리입니다. 핸들러는 호출마다 새로 만드는 대신 팩터리가 만들어 풀에 두고 재사용하며, 거기 담긴 키는 다른 어디에도 나타나지 않습니다.

```csharp
builder.Services.AddHttpClient("ledger")
    .ConfigurePrimaryHttpMessageHandler(() =>
    {
        var handler = new SocketsHttpHandler();
        handler.SslOptions.ClientCertificates = new X509Certificate2Collection(
            X509CertificateLoader.LoadPkcs12FromFile("ledger-client.pfx", password: null));
        return handler;
    });
```

이것을 정직하게 유지해 주는 습관이 둘 있습니다. 유효한 인증서도 결국 신원일 뿐이므로 인가 질문은 그대로 남습니다. 인증 기관이 지금까지 서명한 모든 것을 받아들이는 대신, 주체나 지문을 실제로 응대하려던 호출자 목록과 대조합니다. 그리고 연결이 우리 코드 앞에서 끝나는 경우, 즉 로드 밸런서나 인그레스, API 게이트웨이가 앞에 있는 경우에는 증명이 거기서 소비되고 애플리케이션은 무슨 일이 있었는지 적힌 헤더가 달린 평범한 요청을 받습니다. ASP.NET Core에는 이 경우를 위한 모양이 있습니다. `AddCertificateForwarding`과 `UseCertificateForwarding`이 헤더에서 인증서를 다시 만들어 인증서 스킴에 넘겨주므로, 핸드셰이크가 어디서 일어났는지 뒤쪽에서는 알 필요가 없습니다. 그 헤더는 다른 무엇도 애플리케이션에 닿아 그 값을 설정할 수 없을 때만 믿을 수 있고, 그것은 코드의 성질이 아니라 네트워크의 성질입니다. 짐작하지 말고 확인해 두는 편이 좋습니다.
