---
title: "Default Deny"
summary: "Default deny는 아무것도 허용하지 않은 행동은 거절한다는 규칙입니다. 빠뜨린 핸들러를 열린 문이 아니라 닫힌 문으로 만들어 주며, 그래서 새 엔드포인트마다 약간의 마찰을 치를 값어치가 있습니다."
category: "인증과 인가"
scene: resource-based-authorization
sceneStep: 4
related:
  - label: Resource-based Authorization
    slug: resource-based-authorization
  - label: Role
    slug: role
  - label: Least Privilege
    slug: least-privilege
  - label: Authorization
    slug: authorization
  - label: Authentication
    slug: authentication
  - label: Claims
    slug: claims
  - label: Role-Based Access Control
    slug: role-based-access-control
  - label: Attribute-Based Access Control
    slug: attribute-based-access-control
references:
  - title: "Policy-based authorization in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/authorization/policies
  - title: "Resource-based authorization in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/authorization/resource-based
  - title: "Role-based authorization in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/authorization/roles
---

장면의 4단계에서는 Check 안의 어떤 카드도 언급한 적 없는 동사를 들고 요청이 도착합니다. 아무것도 그것을 거부하지 않습니다. owner 카드는 수정에 관한 것이고 admin 카드도 수정에 관한 것이며, 어느 쪽도 공유에 대해서는 의견이 없습니다. 그런데도 요청은 거절되고, 그 이유가 이 페이지의 전부입니다. 무엇인가 금지해서가 아니라, 아무것도 허용하지 않았기 때문에 거절된 것입니다. 그다음 규칙이 하나 쓰이고, 같은 요청이 다시 와서 통과합니다. 접근 제어 사고는 전부 그 두 순간 사이에서 삽니다.

기본값이 중요한 이유는 비대칭입니다. 기본이 허용인 시스템은 열린 채로 실패하고, 하필 정보가 가장 적은 상황에서 그렇게 됩니다. 새 엔드포인트, 새 동사, 경로는 추가했는데 특성은 잊은 병합 같은 것들입니다. 기본이 거부인 시스템은 닫힌 채로 실패하고, 시끄럽게 실패하며, 보통은 누군가 테스트 환경에서 새 기능을 눌러 보는 1분 안에 드러납니다. 둘 다 실수입니다. 다만 한쪽만이 낯선 사람이 아니라 우리 팀에게서 소식을 듣는 실수입니다.

기본을 거부로 두는 것은 인가 모델의 나머지를 읽을 수 있게 만들어 주기도 합니다. 침묵이 거부를 뜻하면 정책은 완결된 진술입니다. 허용하는 것이 전부 적혀 있으니 목록을 검토하는 일이 곧 시스템을 검토하는 일입니다. 침묵이 허용을 뜻하면 부여 목록은 아무것도 알려 주지 않습니다. 흥미로운 동작이 아무도 규칙을 쓰지 않은 자리에 있기 때문입니다. 없는 것은 감사할 수 없습니다.

ASP.NET Core의 부품들은 이미 이쪽으로 기울어 있고, 할 일은 마지막 틈을 막는 것입니다. 요구 사항은 명시적인 `context.Succeed`로만 충족되므로, 아무것도 하지 않는 핸들러는 거절하고, 정책에 맞는 핸들러가 하나도 없는 엔드포인트도 거절합니다. 그것이 정책 안쪽의 default deny입니다. 틈은 아예 묻지 않은 엔드포인트입니다. `[Authorize]` 특성이나 그에 준하는 것이 없으면 파이프라인은 손대지 않고 통과시킵니다. `SetFallbackPolicy`는 정책을 지정하지 않은 모든 엔드포인트에 정책을 적용해 그 틈을 막고, "이걸 보호하는 걸 잊었다"를 공개 경로가 아니라 401로 바꿔 놓습니다. 정말로 공개인 엔드포인트는 그때 `[AllowAnonymous]`로 그렇게 말하는데, 이는 검색해서 세어 볼 수 있는 결정입니다.

실패의 어조는 실패한다는 사실만큼 중요합니다. 거부는 개발과 테스트에서는 눈에 잘 띄어야 하고, 운영에서 호출자를 향해서는 조용해야 합니다. 충족되지 않은 요구 사항과 호출자와 리소스 식별자를 로그에 남깁니다. 거절된 요청은 가장 이른 침해 신호이고 비용은 한 줄입니다. 호출자에게는 밋밋한 것을 돌려주고, 403과 404 중 무엇을 쓸지는 리소스 종류마다 의도해서 골라서, 실패가 무엇이 존재하는지 훑는 수단이 되지 않게 합니다.

비용은 실재하고, 작습니다. Default deny는 무엇이 허용되는지 누군가 말할 때까지 새 작업을 막는다는 뜻이고, 그 마찰은 마지막의 보안 검토가 아니라 모든 기능 브랜치에 얹힙니다. 일부러 하는 거래가 그것입니다. 나중의 한 번짜리 무한한 놀람 대신, 지금의 작은 마찰을 고르게 나누는 것입니다. 이것을 테스트로 써 두면 마찰은 자동이 됩니다. 등록된 모든 경로가 정책을 지니거나 명시적으로 빠져 있음을 확인하는 테스트는 잊은 풀 리퀘스트에서 실패하고, 그곳이 세상에서 가장 싸게 알아차리는 자리입니다.

자막은 한 문장으로 말합니다. 침묵은 거부입니다. 이 페이지 전체는 왜 다른 쪽이 아니라 그 기본값 위에 쌓을 값어치가 있는지를 풀어 쓴 긴 주석입니다.
