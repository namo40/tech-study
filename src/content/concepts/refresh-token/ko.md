---
title: "Refresh Token"
summary: "Refresh token은 access token이 만료됐을 때 사용자를 다시 로그인시키지 않고 새 토큰을 받아 오기 위해 앱이 내미는 토큰입니다. back channel을 벗어나지 않고, 쓸 때마다 회전하며, 옛것이 다시 들어오면 탈취로 간주됩니다."
category: "인증과 인가"
scene: authorization-code
sceneStep: 4
related:
  - label: Authorization Code
    slug: authorization-code
  - label: Token Rotation
    slug: token-rotation
  - label: Access Token
    slug: access-token
  - label: Token Revocation
    slug: token-revocation
  - label: OAuth 2.0
    slug: oauth-2-0
  - label: Proof Key for Code Exchange
    slug: proof-key-for-code-exchange
  - label: Bearer Token
    slug: bearer-token
references:
  - title: "OAuth 2.0 Security Best Current Practice (RFC 9700)"
    url: https://www.rfc-editor.org/info/rfc9700/
  - title: "The OAuth 2.0 Authorization Framework (RFC 6749)"
    url: https://www.rfc-editor.org/rfc/rfc6749
  - title: OAuth 2.0 for Browser-Based Apps
    url: https://datatracker.ietf.org/doc/html/draft-ietf-oauth-browser-based-apps
---

짧은 access token은 장면의 4단계가 보여 주는 문제를 만듭니다. 사용자가 아직 일하고 있는데 토큰이 죽는 것입니다. API는 401을 돌려주고, 누군가는 아무도 방해하지 않으면서 새 토큰을 만들어 내야 합니다. 브라우저를 authorization server로 다시 보내도 되기는 하지만, 그 일이 몇 분마다 일어나고 그때마다 사용자를 리다이렉트에 끌고 다니게 됩니다. Refresh token은 앱이 그 일을 혼자, back channel에서, 사용자의 개입도 브라우저도 없이 해내라고 있는 것입니다.

그래서 refresh token은 앱이 쥔 것 중 가장 값나가는 물건입니다. access token은 몇 분짜리 제한된 권한이지만, refresh token은 그 승인이 살아 있는 동안 access token을 계속 찍어 낼 수 있는 능력입니다. 그러니 어느 지점에서나 다르게 다뤄야 합니다. URL에 넣지 않고, 브라우저에 건네지 않고, API로 보내지 않으며, 앱이 secret을 두는 곳에 저장합니다. 서버 쪽 세션이나 토큰 저장소, 모바일이라면 플랫폼 키체인입니다.

새어 나가더라도 버틸 수 있게 해 주는 것이 회전입니다. 교환할 때마다 새 refresh token이 돌아오고 방금 쓴 것은 무효가 되므로, 훔친 사본은 정상 앱이 다음번 갱신을 할 때까지만 쓸모가 있습니다. 더 좋은 점은 회전이 탈취를 서버가 감지할 수 있는 사건으로 바꾼다는 것입니다. 두 쪽이 같은 refresh token을 들고 있으면 언젠가 한쪽이 이미 회전으로 밀려난 토큰을 내밀게 되는데, 그것은 정상적인 일이 아닙니다. 규약을 따르는 클라이언트는 이미 쓴 토큰을 다시 내밀지 않기 때문입니다. 서버의 대응은 그 계열 전체, 즉 원래 승인에서 갈라져 나온 모든 토큰을 취소하는 것입니다. 그러면 양쪽 세션이 모두 끝나고 진짜 로그인을 다시 해야 합니다. 장면의 마지막이 그것이고, 앱 자신의 refresh token까지 사본과 함께 어두워지는 이유입니다.

대가는 응답이 유실된 상황이 공격과 똑같아 보인다는 점입니다. 새 쌍을 담은 응답이 네트워크에서 사라지면 클라이언트는 여전히 옛 토큰을 들고 있고, 그것으로 재시도했다가 계열이 취소됩니다. 이를 막을 장치를 두세요. 갱신 호출은 반복하면 결과가 달라지는 호출로 다루어 무턱대고 재시도하지 말고, 직전 토큰을 받아 주고 같은 새 쌍을 돌려주는 짧은 유예 구간을 두며, 한 번에 한 스레드만 갱신하게 해서 동시 호출이 서로를 취소로 몰아넣지 않도록 하세요.

필요할 때만 요청하세요. OpenID Connect에서는 `offline_access` scope를 요청한다는 뜻이고, 어느 클라이언트에 줄지 신중하게 정할 값어치가 있습니다. 세션을 가진 서버 렌더링 앱은 보통 받아도 되고, 브라우저에서 도는 앱은 보통 받지 않아야 하며, SPA가 피할 수 없다면 토큰은 페이지가 아니라 백엔드 뒤에 있어야 합니다. 그리고 토큰을 들고 있는 쪽은 그것을 취소할 수도 있어야 합니다. 로그아웃은 쿠키를 지우는 것이 아니라 revocation 엔드포인트를 호출하는 일입니다.
