---
title: "ID Token"
summary: "ID token은 특정 사용자가 특정 시각에 특정 요청에 답해 로그인했다는 사실을 authorization server가 서명해 준 진술입니다. 그것을 요청한 클라이언트를 위한 인증의 증거이며, API를 호출하기 위한 자격 증명이 아닙니다."
category: "인증과 인가"
scene: authorization-code
sceneStep: 1
related:
  - label: Authorization Code
    slug: authorization-code
  - label: OpenID Connect
    slug: openid-connect
  - label: Access Token
    slug: access-token
  - label: Claims
    slug: claims
  - label: JSON Web Token
    slug: json-web-token
  - label: Authentication
    slug: authentication
  - label: Cookie Authentication
    slug: cookie-authentication
  - label: OAuth 2.0
    slug: oauth-2-0
references:
  - title: OpenID Connect Core 1.0
    url: https://openid.net/specs/openid-connect-core-1_0.html
  - title: JSON Web Token Best Current Practices (RFC 8725)
    url: https://www.rfc-editor.org/rfc/rfc8725
  - title: "The OAuth 2.0 Authorization Framework (RFC 6749)"
    url: https://www.rfc-editor.org/rfc/rfc6749
---

1단계의 `/token` 교환은 access token만 돌려주지 않습니다. 앱이 `openid` scope를 요청했다면 ID token도 함께 받는데, 둘은 서로 바꿔 쓸 수 있는 물건이 아닙니다. access token은 "이 호출이 무엇을 해도 되는가"에 답하며, 앱은 그 내용을 이해할 필요가 없습니다. ID token은 "방금 누가 로그인했고 그것이 정말인가"에 답하며, 앱 자신이 읽고 검증하라고 있는 것입니다.

OpenID Connect가 OAuth 2.0에 더한 것이 바로 이것입니다. OAuth 자체는 위임 프로토콜입니다. 앱이 API를 호출할 권한을 받아 오게 해 줄 뿐, 그 뒤에 있는 사람에 대해 믿을 만한 말은 하지 않습니다. 토큰 응답이 성공했다는 사실로 로그인을 추론하는 것은 잘 알려진 실수입니다. access token은 지금 이 사용자와 아무 상관 없는 경로로도 얻을 수 있기 때문입니다. ID token은 로그인 자체를 서술하는 claim들로 그 틈을 메웁니다. 사용자를 가리키는 `sub`, 보증하는 쪽인 `iss`, 이 진술을 받는 클라이언트인 `aud`, 시각을 담은 `iat`와 `exp`, 사용자가 실제로 인증한 시점인 `auth_time`, 그리고 어느 요청에 대한 답인지를 묶는 `nonce`입니다.

검증하는 것이 존재 이유이므로 빠짐없이 하세요. 발급자가 공개한 키로 서명을 확인하고, `iss`를 확인하고, `aud`가 자기 클라이언트 id인지 확인하고, 만료되지 않았는지 확인하고, `nonce`가 이번 로그인에서 자기가 만든 값과 같은지 확인합니다. `nonce` 검사가 다른 세션을 위해 발급된 ID token이 내 세션으로 재생되는 것을 막습니다. ASP.NET Core에서는 OpenID Connect 핸들러가 이 모두를 대신 해 줍니다. 흐름을 직접 구현하지 말고 핸들러를 써야 하는 가장 큰 이유입니다.

검증이 끝나면 ID token의 일은 끝난 것입니다. 보통은 claim을 지역 세션으로 옮겨 놓고 토큰 자체는 더 쓰지 않습니다. 쿠키로 로그인 상태를 만들고, `sub`를 계정 키로 삼고, 필요하다면 표시 이름이나 이메일을 저장합니다. ID token을 API로 보내지 말고, API에서 받아들이지도 마세요. audience가 서비스가 아니라 클라이언트이므로, 그것을 받아들이는 API는 남에게 하는 말을 대신 받는 셈이고, 이 구조 전체의 안전은 그 구분 위에 서 있습니다.

미리 알아 둘 것은 ID token에 없는 것입니다. ID token은 로그인의 스냅숏이지 사용자 프로필도 아니고 인가 판단도 아닙니다. 세션 도중에 바뀌는 역할, 자원에 따라 달라지는 권한, 다른 곳에서 편집되는 프로필 항목은 모두 바깥에 두어야 합니다. userinfo 엔드포인트나 자체 데이터베이스, 또는 세션을 만들 때 실행되고 직접 정한 주기로 갱신되는 claim 변환이 그 자리입니다.
