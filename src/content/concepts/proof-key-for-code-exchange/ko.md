---
title: "Proof Key for Code Exchange"
summary: "PKCE는 authorization code를 그것을 요청한 클라이언트에 묶습니다. 클라이언트는 로그인마다 무작위 verifier를 만들어 code를 요청할 때는 그 해시를 보내고 code를 쓸 때는 verifier 원문을 보냅니다. 그래서 훔친 code는 원문을 갖지 못한 쪽에게는 쓸모가 없습니다."
category: "인증과 인가"
scene: authorization-code
sceneStep: 3
related:
  - label: Authorization Code
    slug: authorization-code
  - label: OAuth 2.0
    slug: oauth-2-0
  - label: OpenID Connect
    slug: openid-connect
  - label: Access Token
    slug: access-token
  - label: Refresh Token
    slug: refresh-token
  - label: Authentication
    slug: authentication
  - label: Authorization
    slug: authorization
references:
  - title: "Proof Key for Code Exchange by OAuth Public Clients (RFC 7636)"
    url: https://www.rfc-editor.org/rfc/rfc7636
  - title: "OAuth 2.0 Security Best Current Practice (RFC 9700)"
    url: https://www.rfc-editor.org/info/rfc9700/
  - title: "OAuth 2.0 for Browser-Based Applications (RFC 10017)"
    url: https://www.rfc-editor.org/rfc/rfc10017
---

장면의 3단계는 앱에 대해 한 가지를 바꿉니다. client secret이 없다는 것입니다. 단일 페이지 앱은 소스를 방문자 모두에게 내려보내고 모바일 앱은 누구나 풀어 볼 수 있는 바이너리를 배포합니다. 그 안에 박아 넣은 secret은 누군가 들여다보기 전까지만 secret입니다. 그래서 2단계가 기대던 검사가 사라집니다. code는 여전히 front channel로 다니고, 공격자는 여전히 URL에서 그것을 복사할 수 있으며, 이제 `/token`에서는 두 호출자를 구별할 방법이 없습니다.

PKCE는 secret을 되돌려 놓되, 로그인마다 새로 만들고 어디에도 저장해 두지 않는 방식으로 그렇게 합니다. 브라우저를 보내기 전에 클라이언트는 엔트로피가 큰 무작위 문자열 `code_verifier`를 만들어 메모리에 둡니다. 그것을 SHA-256으로 해시한 값을 `code_challenge`로, `code_challenge_method=S256`과 함께 인가 요청에 실어 보냅니다. 서버는 곧 발급할 code 옆에 그 challenge를 저장합니다. code가 교환을 위해 돌아오면 클라이언트는 verifier를 원문으로 보내고, 서버는 다시 해시해서 비교합니다. 값이 같으면 같은 클라이언트이고, 값이 다르거나 verifier가 없으면 토큰은 없습니다.

이 방식이 통하는 이유는 front channel을 지나는 것이 해시뿐이기 때문입니다. URL이나 히스토리 항목, referrer 헤더를 읽는 공격자는 challenge와 code를 보지만 그중 어느 것도 verifier로 되돌릴 수 없습니다. 암호학적 해시가 하지 않는 일이 바로 그것입니다. 그래서 훔친 code는 도둑이 본 적 없는 값에 묶여 있고, 같은 복제 code가 앞 단계와는 다른 이유로 `/token`에서 거절되는 장면이 그 모습입니다.

secret을 가진 confidential client에서도 포함해 어디서나 쓰세요. 현재의 보안 권고는 PKCE를 authorization code 흐름의 선택지가 아니라 그 일부로 다룹니다. code injection도 함께 막아 주기 때문입니다. code injection은 공격자가 피해자의 브라우저로 공격자의 code를 교환시켜 두 계정을 슬며시 이어 붙이는 공격입니다. 방식은 언제나 `S256`을 쓰세요. `plain`은 해시를 계산할 수 없는 클라이언트를 위해 남아 있을 뿐이고, challenge와 verifier가 같은 문자열이면 지켜 주는 것이 없습니다.

.NET에서는 만들 것이 없습니다. `AddOpenIdConnect`가 `UsePkce = true`를 기본으로 두고, verifier를 만들어 왕복 동안 correlation 쿠키에 보관했다가 교환 때 함께 보냅니다. 모바일과 데스크톱 클라이언트도 공식적으로 권장되는 라이브러리를 쓰면 마찬가지입니다. SPA라면 흐름을 수행하는 백엔드를 두어 토큰이 아예 브라우저에 닿지 않게 하고, 그 사이를 지나는 code는 PKCE가 지키게 하세요.
