---
title: "Policy"
summary: "정책은 결정 시점에 호출자와 리소스를 함께 놓고 평가하는 인가 규칙입니다. 그래서 같은 배지라도 행이 다르면 다른 답을 받습니다."
category: "인증과 인가"
scene: authorization
sceneStep: 3
related:
  - label: Authorization
    slug: authorization
  - label: Role-Based Access Control
    slug: role-based-access-control
  - label: Resource-based Authorization
    slug: resource-based-authorization
  - label: Attribute-Based Access Control
    slug: attribute-based-access-control
  - label: Default Deny
    slug: default-deny
  - label: Least Privilege
    slug: least-privilege
  - label: Claims
    slug: claims
  - label: Role
    slug: role
references:
  - title: "Policy-based authorization in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/authorization/policies
  - title: "Resource-based authorization in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/authorization/resource-based
  - title: "Introduction to authorization in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/authorization/introduction
---

장면의 3단계는 역할이 바닥나는 자리입니다. `A`는 editor라서 역할은 `A`가 `B`의 문서를 고치는 것도 선뜻 허용합니다. 꾸러미에는 동사가 적혀 있고, "자기 것만"은 동사가 아니기 때문입니다. 게이트를 정책으로 바꾸면 같은 요청이 다른 질문을 만납니다. 이 호출자가 이 리소스의 소유자인가. 배지도 그대로고 요청도 그대로지만 이제 리소스가 판단의 일부이고, 답은 거부로 뒤집힙니다.

붙들어 둘 구분은 이것이 전부입니다. 역할 확인은 호출자에 대한 진술입니다. 정책은 호출자와 대상을 함께 놓은 진술이고, 토큰을 발급할 때가 아니라 호출이 일어날 때 평가됩니다. 소유권이 가장 뻔한 사례지만, 테넌트, 작업 상태, 다른 사람이 열어 두어 잠긴 레코드, 결재 한도를 넘는 금액, 아예 변경이 허용되는 시간대도 모두 같은 부류입니다.

구조로 보면 정책은 요구 사항 하나 이상에 붙인 이름이고, 요구 사항에는 핸들러가 답합니다. 이름을 붙이는 것은 정돈 이상의 일입니다. 규칙의 표기가 하나로 정해지므로 필요한 모든 엔드포인트에서 같은 문장이 강제되고, 규칙이 웹 서버 없이 단위 테스트할 수 있는 자리에 놓입니다. 한 요구 사항에 핸들러가 여럿 답할 수 있고 대개는 그중 하나만 성공해도 충분한데, "소유자이거나 관리자"를 양쪽이 서로를 몰라도 표현할 수 있는 것이 그 덕분입니다.

평가 순서는 중요하면서도 어긋나기 쉽습니다. 핸들러는 리소스를 손에 넣기 전에는 판단할 수 없으므로, 엔드포인트가 행을 먼저 읽고 나서 물어야 합니다. 판단은 조회 뒤, 변경 앞에 놓입니다. 데이터를 한 번도 본 적 없는 게이트웨이나 미들웨어가 정책을 평가할 수 없는 이유도 여기에 있습니다. 앞단에서는 대상을 좁힐 수 있지만, 행 단위의 답은 그 행이 있는 곳에 속합니다.

자주 나오는 실패가 둘 있습니다. 하나는 판단하지 않고 끝나는 핸들러입니다. 침묵은 거부여야 하므로 성공을 알리는 것을 잊은 규칙은 거절하고, 기본으로 성공하는 규칙은 이름 붙은 구멍입니다. 다른 하나는 요청마다, 나아가 목록의 항목마다 작은 데이터베이스 조회로 변해 버리는 정책입니다. 규칙에 데이터가 필요하면 묶음 전체를 위해 한 번만 읽어 두고 핸들러는 이미 메모리에 있는 것을 보게 합니다. 그러지 않으면 인가가 곧 성능 문제가 됩니다.

정책이 있어야 인가가 입구의 벽에서 벗어납니다. 역할은 한 번 확인하면 세션 전체에 물이 들지만, 정책은 호출마다 눈앞의 객체를 놓고 다시 묻습니다. 일은 더 많고, 그만큼이 맞는 분량입니다. "남의 것 말고 네 것"을 말할 수 있는 규칙의 모양은 이것뿐이기 때문입니다.
