---
title: "Bearer Token"
summary: "Bearer token은 소지가 곧 권한이라는 뜻입니다. API는 토큰을 내민 쪽에게 응답할 뿐 그밖에는 아무것도 묻지 않습니다. 토큰을 다루는 모든 원칙이 이 한 문장에서 나옵니다. 조심해서 나르고, 수명은 짧게 범위는 좁게 유지하고, 언젠가 새는 날을 미리 계산해 두어야 합니다."
category: "인증과 인가"
scene: bearer-token
steps:
  - title: "소지가 곧 권한"
    text: "요청은 헤더에 토큰을 실어 보내고, API는 당신이 누구인지 묻지 않고 응답합니다. 토큰이 없으면 응답도 없습니다. 그밖의 무엇도 참조되지 않습니다. 이 한 문장이 모델의 전부입니다."
  - title: "읽을 수 있지, 비밀이 아닙니다"
    text: "JWT는 base64 세 조각입니다. 헤더, 클레임, 서명. 쥐고 있는 사람은 누구나 클레임을 읽을 수 있습니다. 누구를 위한 것인지, 무엇을 허용하는지, 언제 죽는지 말입니다. 인코딩은 암호화가 아니고, 서명은 바뀌지 않았다는 것만 증명합니다."
  - title: "검증 관문, 그리고 유출"
    text: "API는 서명과 만료와 대상을 확인합니다. 싸고, 로컬이고, 발급자를 호출하지 않습니다. 그런데 토큰이 새면 공격자의 요청도 같은 관문을 통과합니다. 소지가 곧 권한이기 때문입니다. 피해의 상한을 정하는 것이 만료입니다."
  - title: "서명은 되돌릴 수 없으니, 폐기하고 교체합니다"
    text: "서명된 토큰은 만료까지 유효합니다. 일찍 끊으려면 API가 토큰의 id를 거부 목록과 대조해야 하고, 그것은 일부러 지불하는 조회 비용입니다. 정직한 클라이언트는 그저 새 토큰으로 갈아 끼우고 아무것도 눈치채지 못합니다."
related:
  - label: Access Token
    slug: access-token
  - label: Refresh Token
    slug: refresh-token
  - label: Authorization Code
    slug: authorization-code
  - label: ID Token
    slug: id-token
  - label: Proof Key for Code Exchange
    slug: proof-key-for-code-exchange
  - label: JSON Web Token
    slug: json-web-token
  - label: Claims
    slug: claims
  - label: Token Revocation
    slug: token-revocation
  - label: Token Rotation
    slug: token-rotation
  - label: Cookie Authentication
    slug: cookie-authentication
references:
  - title: "The OAuth 2.0 Authorization Framework: Bearer Token Usage (RFC 6750)"
    url: https://www.rfc-editor.org/rfc/rfc6750
  - title: JSON Web Token (RFC 7519)
    url: https://www.rfc-editor.org/rfc/rfc7519
  - title: Access tokens in the Microsoft identity platform
    url: https://learn.microsoft.com/en-us/entra/identity-platform/access-tokens
  - title: Configure JWT bearer authentication in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/security/authentication/configure-jwt-bearer-authentication
---

## 언제 쓰나

- 로그인 이후의 모든 API 호출은 이미 토큰을 나르고 있습니다. 이름을 붙였든 아니든 그렇습니다. 세션을 공유하지 않는 클라이언트와 API 사이에서 권한이 이동하는 방식이 bearer입니다. 호출하는 쪽이 문자열 하나를 붙이면 API가 그것을 읽고, 어느 쪽도 상대를 기억할 필요가 없습니다.
- API가 상태를 두지 않고 호출자가 많을 때 고릅니다. 서명된 토큰은 공개 키로 로컬에서 검증되므로 호출마다 발급자를 왕복하지도, 공유 세션 저장소를 뒤지지도 않습니다. 이 패턴이 자리 잡은 이유가 그것입니다.
- 브라우저를 처음부터 끝까지 직접 다루는 경우에는 맞지 않습니다. `HttpOnly`가 붙은 same-site 쿠키도 bearer 자격 증명이지만, 브라우저가 대신 붙여 주고 스크립트가 읽지 못합니다. 토큰이 도난당하는 가장 큰 경로가 그렇게 사라집니다.
- 401 비율과 토큰 수명을 같은 그래프에 놓고 봅니다. 401이 일정한 주기로 계단처럼 오른다면 클라이언트가 갱신하는 속도보다 수명이 짧은 것이고, 배포 직후에 오른다면 대개 audience나 issuer가 더 이상 맞지 않는 것입니다.
- 토큰을 어디에 적어도 되는지를 먼저 정합니다. 답은 거의 언제나 "메모리와 `Authorization` 헤더 안에서만, 그밖에는 어디에도"입니다. 첫 로그 줄이 찍히기 전에 정하는 편이 첫 사고가 난 뒤에 정하는 것보다 훨씬 쌉니다.

## 주의점

- Bearer는 말 그대로입니다. 토큰을 쥔 사람이 이깁니다. API는 사본과 원본을 구별하지 못하므로, 설계 질문은 전부 사본이 존재할 수 있는 장소를 적게 만들고 쓸모 있는 시간을 짧게 만드는 문제로 환원됩니다.
- URL에는 절대 넣지 마세요. 쿼리 문자열은 접근 로그, 브라우저 기록, 프록시 로그, 그리고 다음 요청의 `Referer` 헤더에 남습니다. 하나하나가 아무도 지켜보지 않는 곳에 토큰이 살게 된 장소입니다. 자기 로그도 마찬가지여서, 아무도 헤더를 기록하지 않으리라 믿는 대신 헤더를 가려서 남기세요.
- 짧은 수명에 refresh 회전을 더한 조합이 긴 수명 토큰보다 언제나 낫습니다. access token은 분 단위로 두고 refresh token은 쓸 때마다 교체하면, 피해 창이 작아지는 동시에 덫이 하나 생깁니다. 같은 refresh token이 두 번 제시되었다는 사실 자체가 사본이 존재한다는 증거이기 때문입니다.
- 검증은 로컬에서, 그리고 빠짐없이 합니다. 서명은 신뢰하는 발급자가 만들었다는 뜻이고, 만료는 그것이 아직 사실이라는 뜻이며, audience는 이 API를 위한 것이었다는 뜻입니다. audience 검사를 빠뜨리면 같은 발급자가 낸 토큰이면 무엇이든 이 API를 엽니다. 사용자가 남의 앱에 건네준 토큰까지 포함해서 말입니다.
- JWT는 쥔 사람이 읽을 수 있으므로 클레임에 비밀이 들어갈 자리는 없습니다. Base64는 인코딩이지 암호가 아닙니다. 지원 티켓에 붙여 넣기 꺼려지는 내용이라면, 어디로 흘러갈지 통제할 수 없는 토큰에도 넣지 마세요.
- 폐기는 예외 경로로 남겨 둡니다. 모든 호출을 거부 목록과 대조하면 상태 없는 API가 다시 상태를 갖게 됩니다. 그래서 보통은 평상시를 짧은 수명으로 처리하고, 정말로 끊어야 했던 토큰에 대해서만 거부 목록을 확인하는 모양이 됩니다.

## .NET에서는

`AddAuthentication().AddJwtBearer()`가 검증 사슬 전체를 파이프라인에 붙여 줍니다. 세 관문은 `TokenValidationParameters`에서 정합니다. `ValidIssuer`, `ValidAudience`, 그리고 `ValidateLifetime`이며, `ClockSkew`의 기본값 5분은 줄이는 편이 좋습니다. 서명 키는 대개 발급자의 discovery 문서에서 오므로 `Authority`만 지정하면 키 갱신은 알아서 처리됩니다. 엔드포인트 안에서 토큰은 이미 `ClaimsPrincipal`이라, `User.FindFirst("scope")`로 승인된 범위를 읽고 권한 규칙은 문자열 비교 대신 authorization 정책으로 표현합니다. 호출하는 쪽에서는 `HttpClient`에 `request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token)`을 설정하되, `DelegatingHandler`가 토큰을 공급하게 해서 발급과 캐시와 갱신이 호출 지점마다 흩어지지 않고 한곳에 모이게 합니다.
