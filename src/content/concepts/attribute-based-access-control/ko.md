---
title: "Attribute-Based Access Control"
summary: "ABAC는 역할 이름을 찾아보는 대신 주체, 자원, 동작, 환경의 속성을 평가해 접근을 결정합니다. 역할이 문장으로 만들 수 없는 질문에 답하는 모델이고, 역할이 곱해지는 자리에서 속성은 더해집니다."
category: "인증과 인가"
scene: authorization
sceneStep: 3
related:
  - label: Authorization
    slug: authorization
  - label: Role-Based Access Control
    slug: role-based-access-control
  - label: Policy
    slug: policy
  - label: Resource-based Authorization
    slug: resource-based-authorization
  - label: Default Deny
    slug: default-deny
  - label: Role
    slug: role
references:
  - title: "Policy-based authorization in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/authorization/policies
  - title: "What is Azure attribute-based access control (Azure ABAC)?"
    url: https://learn.microsoft.com/en-us/azure/role-based-access-control/conditions-overview
---

장면의 세 번째 단계는 역할이 말하지 못하는 문장을 보여 줍니다. 배지는 쥔 사람이 무엇을 할 수 있는지를 적을 뿐 누구의 것에 그럴 수 있는지는 적지 않고, 그래서 editor 배지는 남의 문서를 고치는 일도 그냥 통과시킵니다. 속성 기반 접근 제어는 그 빠진 문장을 진지하게 받아들이는 모델입니다. 호출자를 이름과 대조하는 대신, 사실들로 이루어진 불리언 식을 평가합니다. 토큰에 담긴 부서나 등급 같은 주체의 사실, 소유자나 테넌트나 기밀 등급 같은 자원의 사실, 그리고 동작의 사실과 시각이나 관리 대상 기기 여부 같은 환경의 사실입니다. 식이 참일 때 허용하고 아니면 거절하는데, 이는 네 번째 단계가 그리는 기본 거부와 같은 태도를 이름이 아니라 데이터 위에서 표현한 것입니다.

```text
subject.department == resource.department
  and resource.classification != "restricted"
  and environment.device == "managed"
```

정직한 동기는 우아함이 아니라 산수입니다. 역할은 차원이 늘어나기 전까지는 권한을 잘 압축합니다. editor 역할은 테넌트마다 하나가 되고, 다음에는 지역마다 하나가 되고, 기밀 문서용이 따로 생기고, 결국 디렉터리에는 누군가 필요로 했던 모든 차원의 곱집합이 남습니다. 이것이 역할 폭발이고, 곱셈입니다. 속성은 대신 더합니다. 지역이 하나 늘면 절 하나에서 비교되는 속성이 하나 늘 뿐이고, 기존 역할마다 새 항목이 생기지는 않습니다. 규칙이 애초에 이름의 목록이 아니었으므로 조직이 커져도 의미가 그대로 유지됩니다. 비용도 함께 이동합니다. 역할을 부여하고 회수하던 관리 부담이 속성을 정확하게 유지하는 부담으로 바뀌고, 사용자의 부서가 틀리면 이제 모든 곳에서 답이 틀립니다.

두 모델은 경쟁 관계가 아니며, 경쟁으로 다루는 것이 ABAC 도입이 실패하는 방식입니다. 역할은 여러 속성 가운데 하나일 뿐이고, 대개 가장 거칠고 가장 싸게 확인되는 속성입니다. 그래서 실무의 모양은 호출자가 이 작업 근처에 올 자격이 있는지 판단하는 역할 관문 뒤에, 지금 이 자원이 범위 안인지 판단하는 조건이 따라오는 형태입니다. Azure의 구현이 정확히 그 배치입니다. 역할 할당이 권한을 주고, 할당에 붙은 선택적 조건이 자원 태그와 주체의 속성을 비교해 범위를 좁힙니다. resource-based authorization은 같은 발상의 가장 좁은 형태로, 눈앞의 인스턴스에 대한 소유 여부 하나만 확인합니다. ABAC는 그 일반형이고, 검사를 애플리케이션 어디에 배선하는지는 policy가 다루는 별개의 질문입니다.

모델이 대가로 요구하는 것은 속성이 믿을 만하고 결정 시점에 손에 있어야 한다는 점입니다. 호출자가 자기 자신에 대해 스스로 정할 수 있는 값은 속성이 아니라 요청이므로, 주체 속성은 서명된 토큰으로 도착하거나 호출자가 고칠 수 없는 디렉터리에서 읽혀야 합니다. 자원 속성은 답을 내기 전에 적재되어야 하고, 그래서 이런 결정은 게이트웨이가 아니라 데이터 옆에 삽니다. 복잡성도 사라지지 않고 자리를 옮깁니다. 서로 겹치는 조건이 많아지면 역할이 많은 것만큼 다루기 어렵고, "이 문서를 누가 읽을 수 있는가"가 조회가 아니라 식에 대한 탐색이 된다는 어려움이 더해집니다. 식은 적게 유지하고 이름을 붙이며, 허용만큼 거절도 꼼꼼히 검증하는 테스트를 두고, 어떤 속성이 그 결정을 만들었는지 남기세요. 아무도 설명하지 못하는 답은 아무도 검토하지 못하는 답입니다.
