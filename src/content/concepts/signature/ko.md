---
title: "Signature"
summary: "서명은 위조할 수 없는 출처 증명입니다. 특정 키가 정확히 이 바이트들을 만들었고 그 뒤로 바뀐 것이 없다고 말합니다. kid 헤더가 어느 키인지 지목하므로 검증자는 키들의 링을 들고 있을 수 있고, 회전은 이미 날아다니는 것을 무효로 만들지 않습니다."
category: "인증과 인가"
scene: key-rotation
sceneStep: 3
related:
  - label: Key Rotation
    slug: key-rotation
  - label: JSON Web Token
    slug: json-web-token
  - label: Key Ring
    slug: key-ring
  - label: Token Revocation
    slug: token-revocation
  - label: API Key
    slug: api-key
  - label: Token Rotation
    slug: token-rotation
  - label: Secret Management
    slug: secret-management
  - label: Secret Store
    slug: secret-store
  - label: Secret Injection
    slug: secret-injection
  - label: Mutual TLS
    slug: mutual-tls
  - label: Workload Identity
    slug: workload-identity
  - label: Authentication
    slug: authentication
references:
  - title: Configure cryptographic key auto-rotation in Azure Key Vault
    url: https://learn.microsoft.com/en-us/azure/key-vault/keys/how-to-configure-key-rotation
  - title: Key management in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/security/data-protection/implementation/key-management?view=aspnetcore-10.0
  - title: Rotation tutorial for resources with two sets of credentials
    url: https://learn.microsoft.com/en-us/azure/key-vault/secrets/tutorial-rotation-dual
---

서명은 암호화가 아닙니다. 서명된 토큰의 페이로드는 보통 그것을 가진 사람이면 누구나 읽을 수 있습니다. 서명이 더해 주는 것은 다른 누구도 할 수 없는 주장입니다. 특정 키가 정확히 이 바이트들을 만들었고, 그 뒤로 한 글자도 바뀌지 않았다는 주장입니다. 페이로드에서 문자 하나만 고쳐도 검증은 실패합니다. 서명이 페이로드 위에서 계산됐는데 이제 둘이 맞지 않기 때문입니다. 증명하는 것은 그것뿐이고, 그것만으로도 내가 통제하지 못하는 네트워크 너머로 신원을 실어 나르기에 충분합니다. 위조할 수 없는 주장은 믿어야만 하는 통로보다 값이 나갑니다.

모양은 두 가지이고, 그 차이가 누가 무엇을 들 수 있는지를 정합니다. 공유 비밀 위의 HMAC인 대칭 서명은 싸고 작지만, 만드는 키와 확인하는 키가 같아서 검증자마다 잠재적 위조자이기도 합니다. 비대칭 서명은 개인 키로 만들고 짝이 되는 공개 키로 확인합니다. 그래서 한 번도 만난 적 없는 서비스가 검증자가 되어도 출처를 확신할 수 있습니다. 그 서비스는 내가 무언가에 서명했다는 사실을 알아볼 수는 있지만 스스로는 아무것도 서명하지 못합니다. 공개 토큰 형식이 비대칭인 이유가 이 비대칭성이고, 공개 쪽 절반이 누구나 가져가도 되는 공개 URL에 놓여 있을 수 있는 이유이기도 합니다.

헤더는 kid를 싣고 있고, 이 작은 필드가 회전을 견딜 만하게 만듭니다. 서명은 자기를 만든 키의 이름을 밝히므로, 검증자는 짐작할 필요도 없고 딱 하나만 들고 있을 필요도 없습니다. 최근 공개 키들의 링을 유지하다가 토큰이 지목한 키를 찾아 그것으로 확인합니다. 새 토큰은 새 키가 잘린 순간부터 최신 키로 서명되고, 어제 서명된 토큰은 자기 일정대로 만료될 때까지 계속 검증됩니다. 수명 중간에 무효가 되는 것은 없고, 다시 인증하라고 통보받을 호출자도 없으며, 키의 은퇴는 아무도 그 이름을 부를 수 없게 된 뒤 링에서 항목 하나가 빠지는 조용한 사건으로만 드러납니다.

서명이 말하지 않는 것도 말하는 것만큼 중요합니다. 서명은 누가 이것을 만들었고 그것이 바뀌지 않았다고 말합니다. 그 진술이 지금도 참인지는 말하지 않습니다. 만료, 대상, 발급자, 폐기는 별개의 검사이고, "서명이 유효하다"에서 멈추는 검증자는 다른 서비스용으로 발급된 토큰이나 한 시간 전에 세션이 끝난 토큰을 기꺼이 받아들입니다. 같은 조심성에서 규칙이 두 가지 더 따라 나옵니다. 토큰이 자기 알고리즘을 고르게 두지 마세요. `alg: none`과 RS256을 HMAC으로 확인하게 만드는 혼동은 둘 다 헤더의 말을 곧이곧대로 믿은 검증자를 노린 공격입니다. 그리고 처음 보는 kid를 그것이 가리키는 URL을 받아 오는 식으로 받아들이지 마세요. 알고리즘은 고정하고, kid는 내가 통제하는 링에서 찾고, 헤더의 나머지는 지시가 아니라 힌트로 다룹니다.
