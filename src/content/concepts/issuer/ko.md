---
title: "Issuer"
summary: "issuer는 토큰을 발행한 주체이고 iss 클레임이 그 이름을 담습니다. 검증은 문자열 비교가 아니라 신뢰 사슬입니다. issuer 값이 디스커버리 문서를 가리키고, 그 문서가 서명 키의 위치를 알려 주며, 서명은 그 키로 확인합니다."
category: "인증과 인가"
scene: workload-identity
sceneStep: 3
related:
  - label: Workload Identity
    slug: workload-identity
  - label: Audience
    slug: audience
  - label: JSON Web Token
    slug: json-web-token
  - label: Signature
    slug: signature
  - label: OpenID Connect
    slug: openid-connect
  - label: Bearer Token
    slug: bearer-token
references:
  - title: "JSON Web Token (RFC 7519)"
    url: https://www.rfc-editor.org/rfc/rfc7519
  - title: "OpenID Connect on the Microsoft identity platform"
    url: https://learn.microsoft.com/en-us/entra/identity-platform/v2-protocols-oidc
---

장면의 3단계는 토큰에게 이름 두 개를 묻고, issuer는 그중 첫 번째입니다. 누가 이것을 발행했는가입니다. JWT에서는 `iss` 클레임이고, 친근한 이름이 아니라 URL입니다. 값이 인터넷 전체에서 유일해야 하기 때문이고, 받는 쪽이 그 값으로 무언가를 할 것이기 때문입니다. 두 번째 질문인 누구를 위한 토큰인가는 audience의 몫이며, 둘은 함께여야 쓸모가 있습니다.

받는 쪽이 `iss`로 실제로 무엇을 하는지가 대개 건너뛰는 대목입니다. 사람들이 떠올리는 문자열 비교는 검사 자체가 아니라 사슬의 마지막 고리입니다. issuer 값이 디스커버리 문서를 지목하고, 그 문서는 issuer의 well-known 경로에서 받아 옵니다. 문서는 자기 `issuer`를 선언하고 `jwks_uri`를 가리키며, 그 엔드포인트가 공개 키를 내놓고, 토큰의 서명은 헤더가 지목한 키로 확인합니다. 그 뒤에야 비교에 의미가 생깁니다. 이 토큰이 받는 쪽이 믿기로 한 주체가 공개한 키로 서명되었다는 말이 되기 때문입니다.

```text
GET https://login.microsoftonline.com/<tenant>/v2.0/.well-known/openid-configuration

  "issuer":   "https://login.microsoftonline.com/<tenant>/v2.0"
  "jwks_uri": "https://login.microsoftonline.com/<tenant>/discovery/v2.0/keys"
```

사슬로 읽으면, 그러지 않으면 자의적으로 보이는 운영상의 세부가 설명됩니다. 키를 설정에 박지 않고 받아 오는 이유는 issuer가 키를 교체하기 때문이고, 키를 고정해 둔 수신자는 아무도 알려 주지 않은 교체일에 깨지는 수신자입니다. 문서는 갱신을 곁들여 캐시하므로, 모르는 키 id 때문에 서명 확인이 실패하면 거절하기 전에 다시 받아 와야 합니다. issuer는 `https`여야 하고, 디스커버리 문서 자신의 `issuer` 값이 토큰의 값과 같아야 합니다. 공격자가 건넨 디스커버리 URL이 신뢰하는 issuer의 정의를 바꿔치기하지 못하게 막는 장치입니다. .NET에서 `Authority`를 지정하면 이 과정을 대신 준비해 주고, `ValidIssuer`는 사슬 전체가 아니라 그 끝입니다.

전형적인 실패는 다중 테넌트에서 나옵니다. 테넌트를 나누는 ID 공급자에서는 issuer 안에 테넌트 id가 들어가므로, 공용 엔드포인트에 맞춰 만든 API는 고객마다 다른 `iss`를 보게 되고, 전부 동작하게 만드는 가장 빠른 길은 검사를 끄는 것입니다. 그렇게 하면 실제로는 세상의 어느 테넌트에서 발행한 토큰이든 받아들이게 됩니다. 공격자가 5분 전에 만들어 완전히 통제하는 테넌트도 포함됩니다. 그 토큰들도 같은 공급자가 제대로 서명한 것이기 때문입니다. 올바른 모양은 허용 목록이거나, 온보딩한 테넌트 목록과 테넌트 id를 견주는 issuer 검증기입니다. 워크로드 ID 페더레이션은 같은 규칙을 설정으로 적어 둔 것입니다. 클라우드는 클러스터 토큰 서비스의 정확한 issuer를 받아들일 주체와 함께 저장해 둡니다. 그래서 장면의 3단계는 요청 시점에 내리는 판단이 아니라, 누군가 의도해서 등록해 둔 신뢰 관계를 찾아보는 일입니다.
