---
title: "JSON Web Token"
summary: "JWT는 점으로 이어 붙인 base64 세 조각입니다. 어떻게 서명했는지 적은 헤더, 클레임이 담긴 페이로드, 그리고 둘 전체에 대한 서명입니다. 서명은 위조를 막을 뿐 내용을 감추지는 않습니다. 그래서 토큰을 쥔 사람은 누구나 안의 클레임을 전부 읽을 수 있습니다."
category: "인증과 인가"
scene: bearer-token
sceneStep: 2
related:
  - label: Bearer Token
    slug: bearer-token
  - label: Claims
    slug: claims
  - label: Access Token
    slug: access-token
  - label: ID Token
    slug: id-token
  - label: Token Revocation
    slug: token-revocation
  - label: Refresh Token
    slug: refresh-token
  - label: Authorization Code
    slug: authorization-code
  - label: Cookie Authentication
    slug: cookie-authentication
references:
  - title: JSON Web Token (RFC 7519)
    url: https://www.rfc-editor.org/rfc/rfc7519
  - title: JSON Web Token Best Current Practices (RFC 8725)
    url: https://www.rfc-editor.org/rfc/rfc8725
  - title: Security tokens in the Microsoft identity platform
    url: https://learn.microsoft.com/en-us/entra/identity-platform/security-tokens
---

장면의 2단계는 토큰을 분해합니다. 그러면 점으로 구분된 base64 조각 세 개가 나옵니다. 첫 번째는 헤더이고, 일부러 작고 심심합니다. 무엇으로 서명했는지, 어떤 키로 했는지가 전부입니다. 두 번째는 페이로드, 곧 클레임이며 흐름 안의 나머지 모두가 실제로 읽는 부분입니다. 세 번째는 앞의 둘에 대해 계산된 서명이고, 누군가 키를 쥐고 있어야만 만들 수 있는 유일한 부분입니다.

패널이 잠금 해제가 아니라 그냥 펼쳐지는 것이 이 단계가 말하려는 바입니다. Base64는 전송용 인코딩이라, 토큰이 URL과 헤더와 복사 붙여넣기를 견디도록 고른 것입니다. 되돌리는 데는 키도 허락도 필요 없습니다. 토큰을 디코더에 붙여 넣어 본 사람은 이미 이 사실을 확인했습니다. 그러니 서명은 기밀성이 아니고, 애초에 그럴 의도도 없었습니다. 서명은 지금 쥐고 있는 바이트가 발급자가 만든 바이트라는 것을 증명할 뿐, 누가 쥐고 있는지에 대해서는 아무것도 증명하지 않습니다. Bearer 자격 증명이 가진 성질을 안쪽에서 서술하면 정확히 이것입니다.

여기서 하지 말아야 할 일의 짧은 목록이 따라 나옵니다. 클레임에 비밀을 넣지 않습니다. 클레임은 토큰을 가진 사람 모두에게 공개된 것이고, 사용자 본인은 물론 그의 브라우저 확장이 읽을 수 있는 것까지 포함합니다. 조회하기 싫은 데이터를 담는 캐시로 JWT를 쓰지 않습니다. 토큰은 요청마다 함께 이동하므로, 2킬로바이트로 불어난 페이로드는 호출마다 2킬로바이트이고 언젠가 부딪히게 될 헤더 크기 제한이기도 합니다. 그리고 "디코딩이 깔끔하게 됐다"를 검증으로 취급하지 않습니다. 공격자가 직접 만든 토큰이라도 디코딩은 됩니다.

검증은 서명과 그 주변의 등록된 클레임이며, 알고리즘은 통보받는 대상이 아니라 확인하는 대상입니다. 이 지점의 유명한 실패는 헤더의 `alg`를 읽고 그대로 믿은 라이브러리였습니다. 그 덕분에 공격자가 `alg`를 `none`으로 두거나, RSA 토큰을 공개 키로 서명한 HMAC으로 낮춰 버릴 수 있었습니다. 요즘 라이브러리는 둘 다 기본적으로 거부하며, 그 상태를 유지하는 방법은 도착한 것을 그대로 받아들이는 대신 허용할 알고리즘을 고정하는 것입니다.

대칭이냐 비대칭이냐가 누가 발급할 수 있는지를 정합니다. `HS256`은 공유 비밀 하나를 쓰므로 토큰을 검증할 수 있는 서비스는 만들 수도 있습니다. 애플리케이션 하나 안에서는 괜찮지만 두 팀이 얽히는 순간 나쁜 선택이 됩니다. `RS256`과 `ES256`은 개인 키로 서명하고 잘 알려진 JWKS 엔드포인트에 공개된 공개 키로 검증하므로, API 백 개가 토큰을 확인하는 동안 발급은 정확히 한 서비스만 할 수 있습니다. 키 교체는 그 엔드포인트의 성질이 됩니다. 발급자가 새 키를 옛 키와 나란히 게시하면 검증하는 쪽은 `kid`로 둘 다 집어 들고, 옛 키로 서명된 토큰이 모두 사라진 뒤에 옛 키를 내립니다.

마지막으로 알아 둘 것은, 자기 완결적이라는 성질의 대가입니다. 검증에 발급자 호출이 필요 없다는 말은, 발급 이후에 발급자가 알게 된 어떤 사실도 이미 날아간 토큰에는 닿지 못한다는 뜻입니다. 세션 종료, 역할 회수, 기기 인증 해제, 그 어느 것도 서명을 바꾸지 않습니다. 이 형식이 치르는 거래가 그것이고, 빠져나갈 길은 장면의 4단계가 보여 주는 두 가지뿐입니다. 창이 문제가 되지 않을 만큼 짧은 수명, 그리고 문제가 될 때를 위해 id로 대조하는 거부 목록입니다.
