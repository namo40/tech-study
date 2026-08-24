---
title: "Access Token"
summary: "Access token은 앱이 사용자를 대신해 행동하기 위해 API에 내미는 자격 증명입니다. 수명이 짧고, 받는 대상이 하나로 정해져 있으며, 승인된 scope만 담고 있어서 새어 나가도 오래 쓸모 있지 않고 다른 곳에서는 아예 쓸모가 없습니다."
category: "인증과 인가"
scene: authorization-code
sceneStep: 1
related:
  - label: Authorization Code
    slug: authorization-code
  - label: Bearer Token
    slug: bearer-token
  - label: JSON Web Token
    slug: json-web-token
  - label: Claims
    slug: claims
  - label: Refresh Token
    slug: refresh-token
  - label: ID Token
    slug: id-token
  - label: Token Revocation
    slug: token-revocation
  - label: OAuth 2.0
    slug: oauth-2-0
references:
  - title: "The OAuth 2.0 Authorization Framework (RFC 6749)"
    url: https://www.rfc-editor.org/rfc/rfc6749
  - title: "OAuth 2.0 Security Best Current Practice (RFC 9700)"
    url: https://www.rfc-editor.org/info/rfc9700/
  - title: JSON Web Token Best Current Practices (RFC 8725)
    url: https://www.rfc-editor.org/rfc/rfc8725
---

장면의 1단계가 향해 가는 목적지가 access token입니다. 그 앞의 모든 절차는 이것을 안전하게 얻기 위해 있습니다. 브라우저가 authorization server로 가고, 사용자의 비밀번호는 거기에만 입력되고, code가 돌아오고, 그 code가 이것과 교환됩니다. 그 뒤로 앱은 사용자의 신원을 신경 쓰지 않습니다. API를 호출할 때마다 access token을 붙이고, 그 토큰이 무엇을 할 수 있는지는 API가 판단합니다.

판단의 근거는 토큰에 실린 세 가지입니다. audience는 이 토큰이 어느 API를 위해 발급됐는지를 말합니다. 그래서 주문 API용 토큰은 같은 발급자를 신뢰하는 결제 API에서도 거부됩니다. scope는 그 API의 어느 부분까지 건드릴 수 있는지를 말하며, 앱이 할 수 있는 전부가 아니라 사용자가 동의한 만큼입니다. 만료 시각은 그 내용이 언제까지 참인지를 말하고, 일부러 짧게 잡습니다. 며칠이 아니라 몇 분입니다. API에는 그 밖의 것이 중요하지 않으며, 그래서 앱은 읽을 수 있는 JWT를 받았더라도 access token을 들여다보지 않는 값으로 다뤄야 합니다.

짧은 수명이 주된 방어책입니다. access token은 bearer 자격 증명이라서 손에 쥔 쪽이면 누구나 쓸 수 있고, API는 사본과 원본을 구별할 방법이 없기 때문입니다. 설계가 택한 거래가 바로 이것입니다. 탈취를 불가능하게 만들려 하는 대신, 훔친 토큰이 스스로 만료되게 하고, 공격자가 새 토큰을 찍어 낼 수 있게 해 주는 refresh token은 브라우저가 볼 수 있는 모든 경로에서 치워 둡니다.

대부분의 access token은 서명된 JWT입니다. 덕분에 API는 authorization server를 호출하지 않고도 토큰을 검증할 수 있습니다. 공개된 키로 서명을 확인하고, 발급자와 audience와 만료를 확인하고, claim을 읽으면 됩니다. 빠르고 잘 확장되지만 미리 대비할 결과가 하나 따라옵니다. JWT는 만료될 때까지 유효하므로 세션을 취소해도 이미 나간 토큰은 멈추지 않습니다. 토큰 수명만큼의 시간 창을 받아들이든지, 그 창이 너무 길다고 판단되는 호출에서는 authorization server에 introspection을 요청하세요.

나머지를 안전하게 지키는 습관은 둘입니다. 토큰은 쿼리 문자열이 아니라 `Authorization` 헤더에 실어 보냅니다. 그래야 로그나 브라우저 히스토리, referrer에 남지 않습니다. 그리고 브라우저 저장소에서 멀리 둡니다. 서버 렌더링 앱에서 토큰이 있을 곳은 서버의 세션이고, 단일 페이지 앱에서는 토큰을 대신 들고 있는 백엔드 뒤입니다.
