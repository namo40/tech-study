---
title: "Token Revocation"
summary: "폐기는 토큰이 만료 전에 작동을 멈추게 하는 방법인데, 서명은 되돌릴 수 없으므로 결국 API가 지불하기로 동의한 조회가 됩니다. 그래서 폐기는 예외 경로입니다. 평상시는 짧은 수명이 처리하고, 정말로 끊어야 했던 토큰만 거부 목록이 맡습니다."
category: "인증과 인가"
scene: bearer-token
sceneStep: 4
related:
  - label: Bearer Token
    slug: bearer-token
  - label: Token Rotation
    slug: token-rotation
  - label: Refresh Token
    slug: refresh-token
  - label: Access Token
    slug: access-token
  - label: JSON Web Token
    slug: json-web-token
  - label: Claims
    slug: claims
  - label: Authorization Code
    slug: authorization-code
  - label: Cookie Authentication
    slug: cookie-authentication
references:
  - title: "OAuth 2.0 Token Revocation (RFC 7009)"
    url: https://www.rfc-editor.org/rfc/rfc7009
  - title: "OAuth 2.0 Token Introspection (RFC 7662)"
    url: https://www.rfc-editor.org/rfc/rfc7662
  - title: Refresh tokens in the Microsoft identity platform
    url: https://learn.microsoft.com/en-us/entra/identity-platform/refresh-tokens
---

장면의 네 번째 단계는 앞의 셋에는 필요 없던 관문을 하나 더합니다. 그것이 처음부터 거기 있는 대신 나중에 더해져야 한다는 사실이 이 주제의 전부입니다. 다른 관문들은 토큰을 읽습니다. 서명은 키와, 만료는 시계와, audience는 설정에 적힌 문자열과 대조됩니다. 어느 것도 누구에게 무엇을 묻지 않습니다. 폐기 검사는 그렇게 작동할 수 없습니다. "이 토큰은 회수되었다"는 토큰이 담고 있는 사실이 아니고 앞으로도 아닐 것이기 때문입니다. 그것은 토큰이 이미 세상에 나간 뒤에 누군가 기록한 사실이며, API가 그것을 아는 유일한 방법은 가서 확인하는 것입니다.

그러므로 폐기는 조회이고, 조회야말로 자기 완결적 토큰을 도입하며 피하려 했던 비용입니다. 이렇게 놓고 보면 설계가 정직해집니다. 질문은 폐기를 둘 것인가가 아니라 어떤 호출이 그 비용을 낼 것인가이며, 보통의 답은 이렇습니다. Access token은 아무도 회수할 필요가 없을 만큼 짧은 수명을 주고, 며칠씩 사는 refresh token은 설계상 회수 가능하게 만듭니다. Refresh token을 죽이면 access token 수명 하나 안에 세션이 끝납니다. 뜨거운 경로에 조회를 단 하나도 추가하지 않고 말입니다.

거부 목록이 정말 필요할 때는, 구조적으로 작게 유지합니다. 목록에는 회수되었으면서 아직 만료되지 않은 토큰만 들어가면 되므로, 항목마다 죽을 시각이 자연히 정해집니다. 그래서 저장소는 누군가 청소해야 하는 테이블이 아니라 TTL이 붙은 캐시면 됩니다. 키는 토큰 자신의 id인 `jti` 클레임입니다. 언젠가 회수할 수도 있는 토큰에 `jti`가 필요한 이유가 그것입니다. 토큰 전체를 해시해도 되지만 더 길고, 목록을 들여다보며 저게 무엇이었는지 궁금할 때 아무것도 알려 주지 않습니다. 목록을 API 인스턴스마다 올려 두고 짧은 주기로 갱신하면, 검사 비용은 네트워크 호출이 아니라 해시 집합 조회가 됩니다. 대신 전파 지연이 생기고, 그 지연은 초 단위로 말할 수 있어야 합니다.

다른 모양은 introspection입니다. API가 로컬 검증을 그만두고 받은 토큰마다 인가 서버에 물어보는 방식입니다. 즉각적이고 정확한 답을 얻는 대신 로컬 검사가 사 주었던 것을 전부 내놓습니다. 이제 발급자가 모든 요청의 경로 위에 있고, 발급자의 가용성이 곧 이쪽의 가용성이며, 발급자의 지연이 이쪽 지연에 더해집니다. 불투명 토큰이나 호출량이 적고 민감도가 높은 API에는 어울립니다. 일반적인 경우에는 어울리지 않으며, 폐기가 지저분해 보인다는 이유로 이쪽으로 손을 뻗는 것이 상태 없는 설계가 조용히 상태를 갖게 되는 경로입니다.

교체는 나머지 절반이고, 정직한 클라이언트가 실제로 겪는 부분입니다. 토큰이 회수될 때 클라이언트는 벌을 받는 것이 아니라 새것을 받아 가라는 요청을 받는 것이고, 이미 주기적으로 갱신하고 있던 클라이언트는 아무것도 눈치채지 못합니다. Refresh token 회전은 이것을 단정한 정도를 넘어 쓸모 있게 만듭니다. 갱신할 때마다 새 refresh token이 돌아오고 옛것은 물러나므로, 같은 refresh token이 두 번째로 제시되었다면 어딘가에 사본이 있다는 증거입니다. 이때 올바른 대응은 그 계열 전체를 폐기하고 진짜 사용자에게 다시 로그인하게 하는 것입니다. 도난이 막아 내기를 바라는 대상에서 탐지할 수 있는 대상으로 바뀝니다.

남은 것은 운영의 몫이고, 필요해지기 전에 정해 두는 편이 좋습니다. 침해가 났을 때 무엇을 회수해야 하는지 알아 둡니다. 세션 하나인지, 사용자 한 명의 모든 세션인지, 클라이언트 하나가 발급한 모든 토큰인지 말입니다. 전파 지연이 얼마인지 알아 둡니다. 사고 중에 물어보는 숫자가 그것입니다. 그리고 거부 목록이 중요한 경로에서는 확인되고 그렇지 않은 경로에서는 건너뛰어지는지 확인합니다. 아무도 참조하지 않는 폐기는 아무 효과도 없는 데이터베이스 행일 뿐입니다.
