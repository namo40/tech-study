---
title: "Token Rotation"
summary: "refresh token은 교환할 때마다 교체되므로 각각은 정확히 한 번만 통합니다. 그래서 이미 쓴 토큰이 다시 들어오면 그것이 탈취의 증거가 되고, 서버의 답은 토큰 하나가 아니라 계열 전체를 폐기하는 것입니다."
category: "인증과 인가"
scene: oauth-2-0
sceneStep: 3
related:
  - label: OAuth 2.0
    slug: oauth-2-0
  - label: Refresh Token
    slug: refresh-token
  - label: Access Token
    slug: access-token
  - label: Token Revocation
    slug: token-revocation
  - label: Authorization Code
    slug: authorization-code
  - label: Bearer Token
    slug: bearer-token
  - label: OpenID Connect
    slug: openid-connect
  - label: JSON Web Token
    slug: json-web-token
  - label: Key Rotation
    slug: key-rotation
  - label: Authorization
    slug: authorization
references:
  - title: "Refresh tokens in the Microsoft identity platform"
    url: https://learn.microsoft.com/en-us/entra/identity-platform/refresh-tokens
  - title: "Microsoft identity platform and OAuth 2.0 authorization code flow"
    url: https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow
  - title: "The OAuth 2.0 Authorization Framework (RFC 6749)"
    url: https://www.rfc-editor.org/rfc/rfc6749
---

장면의 3단계는 규칙 하나를 켜고, 화면에 보이는 것은 전부 거기서 따라 나옵니다. refresh token은 한 번만 교환할 수 있다는 규칙입니다. 앱이 `refresh #1`을 내밀면 새 access token과 `refresh #2`를 받고, `#1`은 더 이상 존재하지 않게 됩니다. 나중에 탈취가 잡히도록 애니메이션이 정해 둔 것이 아닙니다. 도둑이 내미는 표가 서버가 이미 써 버린 표이기 때문에 잡힙니다.

이 점은 분명히 말해 둘 만합니다. refresh token을 흔히 떠올리는 방식은 토큰을 받아 오기 위한 수명 긴 비밀번호인데, 수명이 길다는 바로 그 성질이 위험을 만들기 때문입니다. refresh token은 이 흐름 전체에서 가장 값나가는 물건입니다. 분 단위가 아니라 며칠이나 몇 주를 살고, API로 보내지 않으니 로그와 프록시에 흩어지지 않으며, 그것을 들고 있는 사람은 access token을 무한정 찍어 낼 수 있습니다. 교체는 탈취를 어렵게 만들지 않습니다. 탈취를 관측 가능하게 만듭니다. 이것은 다르고 더 나은 성질입니다. 알게 되지 못한 일에는 대응할 수 없기 때문입니다.

장치는 두 부분이고 둘 다 있어야 합니다. 첫째가 교체입니다. 교환할 때마다 새 refresh token을 돌려주고 제시된 토큰을 무효로 만듭니다. 둘째가 재사용 감지입니다. 서버는 써 버린 토큰을 기억하고, 두 번째로 제시되면 경보로 취급합니다. 감지 없는 교체는 표적을 옮겨 놓을 뿐입니다. 훔친 토큰을 교환한 도둑은 유효한 대체품을 얻고, 조용히 망가지는 쪽은 정당한 앱이 됩니다. 그 고장을 판단으로 바꾸는 것이 감지입니다.

그 판단은 일부러 무디게 만들어져 있습니다. 써 버린 토큰이 돌아왔을 때 서버는 두 호출자 중 어느 쪽이 진짜 앱인지 구별할 수 없습니다. 도둑이 먼저 교환했고 앱이 지금 낡은 사본을 내미는 중일 수도, 그 반대일 수도 있습니다. 같은 증거에 두 이야기가 다 들어맞습니다. 그래서 올바른 대응은 그 요청 하나를 거절하는 것이 아니라, 그 로그인에서 뻗어 나온 토큰 계열 전체를 폐기하는 것입니다. `revoked` 램프가 켜지고 지갑이 비는 장면이 그리는 것이 그것입니다. 양쪽 모두 접근을 잃고, 사용자는 다시 로그인하며, 도둑의 사본은 아무 값어치가 없어집니다. 진짜 사용자를 한 번 성가시게 하는 쪽이 싼 결말입니다. 비싼 결말은 아무도 눈치채지 못한 채 공격자에게 갱신 가능한 승인을 남겨 두는 것입니다.

이 무딤에서 실무적인 위험 두 가지가 나옵니다. 첫째는 자기 자신과의 경합입니다. 세 스레드에서 동시에 재개되는 모바일 앱이나, 만료된 토큰으로 API 호출 두 개를 한꺼번에 던지는 페이지는 같은 refresh token의 교환 요청을 몇 밀리초 간격으로 보내 자기 계열을 폐기시킬 수 있습니다. 고칠 자리는 클라이언트이고, 방법은 공유 가변 상태에 흔히 쓰는 그것입니다. 갱신을 단일 실행 잠금으로 감싸서, 동시에 온 호출자들이 각자 교환을 시작하는 대신 하나의 교환을 기다리게 합니다. 서버는 보통 직전 토큰을 잠시 더 받아 주는 짧은 유예 구간으로 도와주지만, 그 구간은 호의이지 설계의 토대가 아닙니다.

둘째는 저장입니다. 교체된 토큰은 그것을 기록하는 쓰기만큼만 안전합니다. 앱이 교환해서 `#2`를 받았는데 새 토큰이 디스크에 닿기 전에 죽으면, 깨어난 앱은 `#1`을 들고 있고, 그것을 내밀고, 스스로를 폐기시킵니다. 함께 온 access token을 쓰기 전에 새 refresh token을 먼저 저장하고, 그 둘을 한 트랜잭션으로 다룹니다. .NET에서 Microsoft.Identity.Web의 `AddInMemoryTokenCaches()` 대신 `AddDistributedTokenCaches()`를 쓰라는 근거가 이것입니다. 인스턴스마다 현재 refresh token이 무엇인지 제각각 알고 있는 스케일아웃 앱은, 다음 로드 밸런서의 선택을 기다리는 계열 폐기와 같습니다.

교체는 public client와 confidential client의 차이를 견딜 만한 것으로 만들어 주기도 합니다. 단일 페이지 앱은 비밀을 지킬 수 없으므로 그 refresh token은 페이지에서 스크립트를 실행할 수 있는 모든 것에 노출됩니다. 교체가 있으면 빠져나간 토큰은 쓸모 있는 시간이 짧고, 사용하면 흔적이 남습니다. 브라우저 클라이언트의 refresh token이 수명이 짧고 연장되지 않으며 쓸 때마다 교체되는 이유가 이것이고, cross-site scripting 결함이 읽을 수 있는 곳에 그것을 두는 일이 완화된 문제가 아니라 여전히 심각한 결함인 이유도 이것입니다. 교체는 영향 범위를 줄이지, 폭약을 치우지 않습니다.
