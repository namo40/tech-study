---
title: "Role-Based Access Control"
summary: "역할 기반 접근 제어는 권한을 사람이 아니라 이름 붙은 꾸러미에 부여합니다. 호출자는 역할을 지니고, 역할은 할 수 있는 동사를 적어 두며, 게이트는 배지만 보고 판단합니다."
category: "인증과 인가"
scene: authorization
sceneStep: 2
related:
  - label: Authorization
    slug: authorization
  - label: Policy
    slug: policy
  - label: Role
    slug: role
  - label: Claims
    slug: claims
  - label: Least Privilege
    slug: least-privilege
  - label: Attribute-Based Access Control
    slug: attribute-based-access-control
  - label: Resource-based Authorization
    slug: resource-based-authorization
  - label: Authentication
    slug: authentication
references:
  - title: "Role-based authorization in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/authorization/roles
  - title: "Introduction to authorization in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/authorization/introduction
---

장면의 2단계는 게이트에 단이 둘 생긴 다음 할 수 있는 가장 싸고 정확한 일입니다. 호출자마다 배지를 지니고, 배지마다 할 수 있는 동사가 적혀 있고, 게이트는 그 둘을 견줍니다. `A`는 editor라서 쓸 수 있고, `B`는 viewer라서 읽을 수 있으니, viewer의 쓰기는 어떤 문서에도 닿기 전에 거절됩니다. 이 판단에서 문서를 들여다본 부분은 없고, 그래서 빠르고 캐시하기 좋고 따라가기도 쉽습니다.

역할이 존재하는 이유는 산수입니다. 사람마다 권한을 주면 권한의 수가 사람 수를 따라 늘고, 사용자 천 명에 기능 마흔 개인 시스템은 사만 칸짜리 표가 됩니다. 그 표를 누군가 계속 맞춰 놓아야 합니다. 역할은 이것을 둘로 쪼갭니다. 제품이 바뀔 때만 바뀌는 꾸러미 몇 개, 그리고 사람이 자리를 옮길 때만 바뀌는 사람당 배정 하나입니다. 입사 처리는 확인 목록 대신 "상담 역할을 준다"가 되고, 퇴사 처리는 뒤지는 일 대신 회수 한 번이 됩니다.

역할은 게이트가 찾아보는 값이라기보다 호출자가 들고 오는 클레임으로 이해하는 편이 낫습니다. 이 차이는 실제로 드러납니다. 역할이 토큰이나 쿠키에 실려 오니 판단에 드는 비용이 없고, 대신 역할은 토큰만큼 낡습니다. 방금 강등된 사람도 토큰이 만료되기 전까지는 예전 배지를 지니고 다닙니다. access token을 짧게 두는 이유 가운데 하나가 이것이고, 정말 급한 회수는 역할 테이블 너머까지 닿아야 하는 이유이기도 합니다.

역할은 답이 리소스에 달리기 시작하는 지점에서 힘을 잃습니다. "이 사용자가 문서를 편집해도 되는가"는 역할의 질문입니다. "이 사용자가 *이* 문서를 편집해도 되는가"는 아닙니다. 이름을 아무리 다듬어도 역할의 질문이 되지 않습니다. 그 압력은 이름에서 먼저 보입니다. 누군가 `editor-of-project-x`를 꺼내는 순간 역할이 리소스 식별자를 삼킨 것이고, 역할의 수는 제품이 아니라 데이터를 따라 늘어나기 시작합니다. 애플리케이션 코드가 실행 중에 역할을 만들고 지우는 것도 같은 냄새입니다.

모델을 오래 건강하게 유지하는 습관이 둘 있습니다. 권한은 역할에 주고 역할은 사람에게 주되, 권한을 사람에게 바로 주지 않습니다. 그래야 누가 무엇을 할 수 있는지 물었을 때 볼 곳이 한 군데뿐입니다. 그리고 정책 안에서는 여기저기 특성에 뿌려 둔 역할 이름보다 권한 모양의 클레임을 씁니다. `editor` 대신 `documents.write`를 확인하면 조직 개편으로 역할 이름이 전부 바뀌어도 살아남고, 꾸러미의 정의가 엔드포인트 백 군데가 아니라 파일 하나에 남습니다.

역할로 더는 말할 수 없게 되면 답은 더 큰 역할이 아닙니다. 결정 시점에 리소스를 읽는 정책이고, 장면의 다음 단계가 보여 주는 것이 바로 그것입니다. 둘은 사이좋게 함께 삽니다. 역할이 대상을 좁히고, 정책이 그 행을 매듭짓습니다.
