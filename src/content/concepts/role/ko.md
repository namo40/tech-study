---
title: "Role"
summary: "Role은 사물이 아니라 사람에게 붙은, 이름 붙은 부여의 묶음입니다. 싸고 읽기 쉬운 바깥 문이 되어 명백한 외부인을 막아 주며, 리소스를 들여다보는 검사 앞에 겹으로 세울 때 가장 값어치가 큽니다."
category: "인증과 인가"
scene: resource-based-authorization
sceneStep: 3
related:
  - label: Resource-based Authorization
    slug: resource-based-authorization
  - label: Role-Based Access Control
    slug: role-based-access-control
  - label: Default Deny
    slug: default-deny
  - label: Authorization
    slug: authorization
  - label: Claims
    slug: claims
  - label: Least Privilege
    slug: least-privilege
  - label: Attribute-Based Access Control
    slug: attribute-based-access-control
  - label: Authentication
    slug: authentication
references:
  - title: "Role-based authorization in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/authorization/roles
  - title: "Policy-based authorization in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/authorization/policies
  - title: "Resource-based authorization in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/authorization/resource-based
---

장면의 3단계는 역할이 실수인가 아닌가 하는 논쟁이 끝나는 대목입니다. Check 안에 `admin` 카드가 올라오고, 한 호출자에게 배지가 붙고, 소유 규칙이라면 거절했을 요청이 통과합니다. 그것이 관리자라는 말의 뜻이고, 그 규칙을 owner 규칙과 같은 스택에 카드로 그린 것이 요점입니다. 리소스 검사가 도착했다고 역할이 사라진 것도 아니고, 역할이 이긴 것도 아닙니다. 역할은 목록에서 owner 규칙 위에 한 줄을 차지하고, 딱 한 가지만 말합니다.

Role은 부여 묶음에 붙인 이름입니다. 그 가치의 전부는 압축입니다. 권한 열한 개 대신 "Support", 테이블 아홉 개에 대한 읽기 권한 대신 "Auditor", 긴 대화 대신 "Admin". 그 압축 덕분에 역할은 리뷰에서 읽히고, 엔지니어가 아닌 사람도 배정할 수 있고, 사람이 팀을 옮길 때 한 번의 조작으로 회수됩니다. 어느 것도 사소하지 않고, 권한을 하나씩 부여하는 방식으로는 어느 것도 얻지 못합니다.

압축은 동시에 한계입니다. 역할은 사람에게 붙어 토큰을 타고 다니므로, 특정 객체를 언급하지 않는 질문에만 답할 수 있습니다. "이 호출자가 문서 영역에 접근해도 되는가"는 역할의 질문입니다. "이 호출자가 문서 417을 수정해도 되는가"는 아니고, 역할을 아무리 잘 설계해도 그렇게 되지 않습니다. `Editor_Project_417` 같은 이름을 만들어 내고 있다면, 모델에 둘 곳이 없어서 객체를 이름 안에 써넣은 것이고, 객체마다 역할 하나를 만들고 배정하고 정리하는 일을 영원히 떠안기로 조용히 서명한 것입니다.

그래서 합리적인 배치는 겹이고, 장면은 그 겹을 실행 순서대로 그립니다. 거친 문은 싸고 먼저 걸립니다. 이 호출자가 인증되었는가, scope를 들고 있는가, 이 기능 근처에 올 수 있는 그룹에 속하는가. 이 검사에는 토큰 말고 아무것도 필요 없으니, 데이터베이스 연결을 열기도 전에 외부인을 돌려보낼 수 있습니다. 정밀한 검사는 그다음에, 불러온 리소스 위에서 돌면서, 같은 종류의 객체 둘 사이에서 실제로 달라지는 경우를 판정합니다. 역할은 물량을 줄이고, 리소스 검사가 질문을 판정합니다.

장면의 admin 카드는 일부러 좁습니다. 이름 붙은 연산 하나만 부여하고 전부는 아니며, 그래서 자막이 만능열쇠가 아니라 이름 붙은 부여라고 부릅니다. 비상구가 모델이 되어 버리지 않게 지키는 규율이 바로 이것입니다. `Update`에 한해 소유를 건너뛰는 관리자 역할은 읽고, 감사하고, 테스트할 수 있는 결정입니다. 모든 핸들러를 건너뛰는 관리자 역할은 사고가 났을 때만 도는 테스트되지 않은 경로이고, 그 순간이야말로 무엇이 허용되는지 처음 알게 되고 싶지 않은 때입니다.

실무 습관 둘이 따라옵니다. 역할은 개인이 아니라 그룹에 부여해서, 팀에 들어오고 나가는 일만 기억하면 되게 만듭니다. 그리고 역할을 정책 자체가 아니라 정책의 입력으로 다룹니다. 엔드포인트 본문 여기저기에 흩어진 `IsInRole`은 시간이 지나면 "누가 이 일을 할 수 있는가"에 검색 없이는 답할 수 없는 시스템이 됩니다. 오늘은 역할 하나를 요구하는 이름 붙은 정책이라면, 내일은 엔드포인트를 한 줄도 건드리지 않고 다른 것을 요구할 수 있습니다.

정직한 요약은 장면이 주는 그대로입니다. 역할은 사라지지 않습니다. 애초에 답할 모양이 아니었던 질문에 답하는 척을 그만두고, 싸고 빠른 맨 앞줄로 옮겨 가서, 판정은 문서를 손에 든 검사에게 넘깁니다.
