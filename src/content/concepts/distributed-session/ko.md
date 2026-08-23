---
title: "Distributed Session"
summary: "Distributed Session은 세션 상태를 모든 인스턴스가 읽을 수 있는 저장소에 둡니다. 그래서 어떤 인스턴스든 어떤 사용자든 처리할 수 있고, 재시작해도 잃는 것이 없습니다."
category: "서버 상태 관리"
scene: sticky-session
sceneStep: 4
related:
  - label: Sticky Session
    slug: sticky-session
  - label: Session State
    slug: session-state
  - label: Redis
    slug: redis
  - label: ASP.NET Core Data Protection
    slug: aspnet-core-data-protection
references:
  - title: Session and state management in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/app-state?view=aspnetcore-10.0
  - title: Configure ASP.NET Core Data Protection
    url: https://learn.microsoft.com/en-us/aspnet/core/security/data-protection/configuration/overview?view=aspnetcore-10.0
---

인스턴스를 서로 바꿔 쓸 수 있게 만드는 것은 저장소입니다. 세션 상태가 프로세스 밖으로, Redis나 SQL Server처럼 배포 전체가 닿을 수 있는 곳으로 옮겨 가면, 그 사용자를 한 번도 본 적 없는 인스턴스가 다른 인스턴스가 하던 자리를 그대로 이어받습니다. 재시작, 축소, 롤링 배포의 대가는 로그인이 아니라 왕복 한 번이 됩니다.

ASP.NET Core에서는 세션을 옮기는 것으로 절반만 끝납니다. 세션 쿠키와 인증 쿠키는 모두 Data Protection 키 링으로 보호되는데, 이 키 링은 기본적으로 로컬 파일 시스템에 쓰이고 거기에 머무릅니다. 키 링이 서로 다른 두 인스턴스는 상대의 쿠키를 읽지 못하므로, 사용자는 이전과 똑같은 빈도로 로그아웃됩니다. 키를 같은 공유 저장소에 저장하고, 모든 인스턴스에 같은 애플리케이션 이름을 줍니다.

만료는 이제 시계가 하나가 아니라 둘입니다. `IdleTimeout`은 아무도 건드리지 않은 세션 항목이 얼마나 오래 남을지 정하고, 쿠키는 쿠키대로 수명을 들고 다닙니다. 저장소 자체의 축출 정책까지 세면 셋입니다. 세션은 작게 유지하고, 중요한 것을 기록하는 자리가 아니라 다시 만들 수 있는 값을 담아 두는 캐시로 다룹니다. 지난 요청에 있던 항목이 이번 요청에도 있으리라고 가정하지 않습니다.
