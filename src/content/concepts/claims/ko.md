---
title: "Claims"
summary: "Claim은 토큰이 누구를 위한 것인지, 무엇을 허용하는지, 그것이 언제까지 사실인지를 키와 값으로 진술한 것입니다. 검증은 그것들을 두루 읽는 일이 아니라 정해진 관문 몇 개이며, 각 관문은 이름 붙은 클레임 하나를 API가 이미 알고 있는 값과 비교합니다."
category: "인증과 인가"
scene: bearer-token
sceneStep: 2
related:
  - label: Bearer Token
    slug: bearer-token
  - label: JSON Web Token
    slug: json-web-token
  - label: Access Token
    slug: access-token
  - label: ID Token
    slug: id-token
  - label: Authorization
    slug: authorization
  - label: Token Revocation
    slug: token-revocation
  - label: Authorization Code
    slug: authorization-code
  - label: Refresh Token
    slug: refresh-token
references:
  - title: "JSON Web Token (RFC 7519), registered claim names"
    url: https://www.rfc-editor.org/rfc/rfc7519
  - title: Provide optional claims to your app
    url: https://learn.microsoft.com/en-us/entra/identity-platform/optional-claims
  - title: ClaimsPrincipal
    url: https://learn.microsoft.com/en-us/dotnet/api/system.security.claims.claimsprincipal
---

장면의 세 번째 단계는 모든 요청을 똑같이 짧은 관문 행에 통과시키고, 관문 하나하나는 클레임 하나를 API가 이미 알고 있는 값 하나와 비교합니다. 검증이란 그것입니다. API가 호출자에 대해 견해를 세우는 것이 아니라 설정에 적힌 값들과 벌이는 동등 비교 네댓 번이고, 그래서 호출마다 돌려도 될 만큼 싸고 네트워크가 필요 없을 만큼 로컬합니다.

관문은 등록된 클레임에서 오며, 각각 다른 질문에 답합니다. `iss`는 누가 만들었는지를 말하고, 신뢰하기로 정한 발급자와 대조됩니다. `aud`는 누구를 위해 만들었는지를 말하고, 이 API 자신의 식별자와 대조됩니다. 리포팅 API용으로 완전히 유효한 토큰이 결제 API를 열지 못하게 막는 것이 이 검사입니다. `exp`는 언제 사실이기를 그치는지를, `nbf`는 언제부터 사실인지를 말하며, 둘 다 시계와 비교하되 약간의 오차를 허용합니다. `sub`는 주체의 이름이고, 누가 무엇을 했는지 기록할 때 저장해야 할 값이 바로 이것입니다. 이메일 주소나 표시 이름과 달리 안정적이기 때문입니다.

그다음에는 신원이 아니라 권한을 나르는 클레임이 있습니다. `scope`는 사용자가 앱에 무엇까지 허락했는지를 말하며, 위임 전체를 둘러싼 굵은 울타리입니다. `orders.read`만 가진 앱은 누가 로그인해 있든 주문을 쓰지 못합니다. 역할과 그룹은 이 주체가 무엇을 해도 되는지를 말하며, 완전히 다른 축입니다. 둘을 구분하는 것이 중요합니다. 섞어 버리면 앱이 사용자의 권한을 통째로 물려받거나, 반대로 앱이 적게 요청했다는 이유로 사용자가 자기 데이터를 못 보는 API가 나옵니다.

나머지는 전부 청구서가 붙은 설계 결정입니다. 클레임은 요청마다 이동하므로 하나 늘릴 때마다 호출마다의 바이트가 되고, 언젠가 전체 요청을 거절할 어딘가의 헤더 크기 제한이 됩니다. 그룹 클레임이 그 전형입니다. 사용자가 속한 그룹을 모두 내보내는 디렉터리는 어떤 사용자에 대해서는 수백 개를 내보내고, ID 제공자는 그럴 때 목록 대신 직접 가져오라는 포인터로 바꿔 버립니다. 피하려던 왕복이 되돌아오는 셈입니다. 권한 규칙이 실제로 읽는 몇 개만 담고, 나머지는 조회합니다.

또 하나의 함정은 낡음이고, 이 형식 전체가 치르는 거래와 같은 것입니다. 클레임은 토큰이 만들어진 순간에 대한 진술이며 토큰의 수명 동안 얼어붙어 있습니다. 누군가를 그룹에서 빼도 지금 들고 있는 토큰은 만료될 때까지 여전히 그가 그룹에 있다고 말합니다. 이것은 호출마다 조회를 붙여 우회할 버그가 아닙니다. 호출마다 조회하는 순간 상태 없는 설계를 내버리는 것이기 때문입니다. 이것은 의도적으로 고르는 수명이며, 낡은 창이 감당할 만큼 짧으면 됩니다.

.NET에서는 이 모두가 `HttpContext.User` 위의 `ClaimsPrincipal`로 도착하고, 개별 진술은 `User.FindFirst("scope")`나 `User.FindFirstValue(ClaimTypes.NameIdentifier)`로 돌아옵니다. 두 가지를 알아 두면 시간이 절약됩니다. 프레임워크는 기본적으로 짧은 JWT 클레임 이름 일부를 긴 WS-Federation URI로 매핑하므로, `DefaultInboundClaimTypeMap`을 비우지 않으면 `sub`가 `nameidentifier`로 도착합니다. 있을 줄 알았던 이름이 없다면 거의 언제나 이것입니다. 그리고 권한 판단은 `if`가 아니라 정책에 둡니다. scope를 요구하거나 특정 값의 클레임을 요구하는 정책은 규칙을 한곳에 모아 두고, 그 규칙에 기대는 모든 핸들러에서 규칙을 빼냅니다.
