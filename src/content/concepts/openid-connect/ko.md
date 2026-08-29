---
title: "OpenID Connect"
summary: "OAuth 2.0 위에 얹는 얇은 신원 계층입니다. openid 범위를 요청하면 access 토큰 옆에 id 토큰이 붙어 옵니다. 누가 로그인했는지에 대한 서명된 진술이고, 수신자는 API가 아니라 앱입니다."
category: "인증과 인가"
scene: oauth-2-0
sceneStep: 4
related:
  - label: OAuth 2.0
    slug: oauth-2-0
  - label: ID Token
    slug: id-token
  - label: Claims
    slug: claims
  - label: JSON Web Token
    slug: json-web-token
  - label: Access Token
    slug: access-token
  - label: Authorization Code
    slug: authorization-code
  - label: Token Rotation
    slug: token-rotation
  - label: Bearer Token
    slug: bearer-token
  - label: Authentication
    slug: authentication
  - label: Authorization
    slug: authorization
references:
  - title: "OpenID Connect on the Microsoft identity platform"
    url: https://learn.microsoft.com/en-us/entra/identity-platform/v2-protocols-oidc
  - title: "Microsoft identity platform and OAuth 2.0 authorization code flow"
    url: https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow
  - title: "OpenID Connect Core 1.0"
    url: https://openid.net/specs/openid-connect-core-1_0.html
---

장면의 4단계는 요청에 단어 하나를, 지갑에 카드 하나를 더합니다. 단어는 `openid`이고 카드는 `id` 토큰입니다. 둘이 존재하는 이유는, "이걸로 사용자를 로그인시키자"고 말한 사람들이 묻지 않은 질문에 OAuth 2.0이 답하기 때문입니다. OAuth는 "이 앱이 이 일을 해도 되는가"에 답합니다. 그 사람이 누구인지에 대해서는 아무 의견이 없고, 돌려주는 access 토큰은 그것을 들고 있는 앱에게 일부러 불투명합니다.

OpenID Connect가 표준으로 정리하기 전까지 그 빈틈은 오랫동안 나쁘게 메워졌습니다. 애플리케이션은 access 토큰을 받아 제공자가 마침 열어 둔 프로필 엔드포인트를 호출하고, 응답이 성공한 것을 로그인의 증거로 취급했습니다. 그 토큰이 다른 데서 왔을 때까지는 잘 돌아갑니다. access 토큰은 API를 위해 발행된 소지자 자격 증명이고, 토큰이 통했다는 사실에서 "이 사용자가 로그인했다"를 추론하는 앱은 아무의 토큰이나 아무의 신원으로 받아들인 셈입니다. 이 취약점에는 이름이 있고 긴 역사가 있으며, 해법은 조심하는 것이 아니라 구조를 바꾸는 것입니다. 신원은 앱 자신 앞으로 발행된 토큰에 담겨 와야 합니다.

id 토큰이 바로 그것입니다. 발급자가 서명한 JWT이고, `aud`는 앱의 client ID이며, 클레임은 그 로그인을 설명합니다. 사용자의 안정적인 식별자인 `sub`, 누가 주장하는지인 `iss`, 언제인지인 `iat`와 `exp`, 앱이 시작한 요청에 묶어 주는 `nonce`, 그리고 요청한 범위가 허용한 프로필 클레임들입니다. 앱은 로그인 시점에 한 번 검증하고 나면 그것으로 끝입니다. 갱신도, 긴 수명도, 계속 들고 있을 이유도 없습니다. 무엇을 여는 열쇠가 아니라 한 순간에 대한 진술이기 때문입니다.

여기서 따라 나오는 규칙이 장면이 들어 올리는 규칙이고, 이것만큼은 예외 없이 말해도 됩니다. id 토큰은 API로 가지 않습니다. 그리고 API는 access 토큰의 내용을 자기 것으로 검증하지 않은 채 거기서 신원을 읽지 않습니다. 각 토큰은 특정 수신자를 위해 서명되어 있습니다. id 토큰을 내 API로 보낸다는 것은 다른 수신자용으로 발행된 자격 증명을 내미는 것이고, 그것을 받아들이는 API는 audience를 의미 있게 만드는 검사를 스스로 꺼 버린 것입니다. API가 사용자가 누구인지 알아야 한다면, 그 정보는 인가 서버가 access 토큰에 넣어 준 클레임으로 와야 하고, API는 자기 `aud`에 대해 그것을 검증해야 합니다.

알아 둘 만한 범위는 세 개이고 서로 하는 일이 다릅니다. `openid`는 OAuth 요청을 OpenID Connect 요청으로 바꾸는 범위이고, 애초에 id 토큰을 만들어 내는 범위입니다. `profile`과 `email`은 사람에 대한 클레임을 더합니다. `offline_access`는 신원과 무관하고 refresh 토큰을 요청하는 범위입니다. 프로토콜의 다른 절반에 속하면서도 로그인 설정에서 나머지 옆에 나란히 보이는 이유가 그것입니다.

.NET에서는 핸들러가 일을 해 주는데, 그 일의 모양이 핵심입니다. `AddOpenIdConnect`는 PKCE를 쓰는 authorization code 흐름을 돌리고, 디스커버리 문서의 키로 id 토큰을 검증하고, 발급자와 audience와 수명과 nonce를 확인한 뒤, 결과를 `AddCookie`에 넘겨 세션으로 바꿉니다. id 토큰은 소비되고 버려집니다. 남는 것은 `ClaimsPrincipal`과 쿠키입니다. 이것이 올바른 분업이고, 로그인 관련 버그 대부분은 이 분업을 놓쳐서 생깁니다. id 토큰은 세션을 세우고, access 토큰은 API를 호출하며, 둘은 서로 대체되지 않습니다. 페이지에 붙은 `[Authorize]`는 쿠키에 대해 묻는 것이고, API 엔드포인트의 `[Authorize]` 정책은 access 토큰에 대해 묻는 것입니다. 지금 보고 있는 것이 어느 쪽인지 아는 것이 중요합니다.

마지막 구분 하나가 나중의 혼란을 크게 줄여 줍니다. OpenID Connect는 로그인이 일어났다고 알려 줍니다. 그 뒤의 일을 관리하지는 않습니다. 세션 수명, 유휴 시간 제한, 여러 애플리케이션에 걸친 로그아웃, 민감한 작업 앞의 재인증 요구는 전부 애플리케이션의 결정이고, 쿠키로, 그리고 사용자가 아직 거기 있음을 제공자에게 확인받아야 할 때는 `prompt`와 `max_age` 매개변수로 내립니다. id 토큰의 `exp`를 세션 만료로 취급하는 것은 access 토큰으로 로그인 상태를 짜는 것과 같은 범주의 실수입니다. 토큰의 수명은 토큰을 설명하지, 관계를 설명하지 않습니다.
