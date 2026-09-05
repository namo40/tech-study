---
title: "Read Replica"
summary: "Read replica는 쿼리만 답하고 쓰기는 받지 않는 데이터베이스 복사본입니다. 프라이머리에서 읽기 부하를 덜어 주고, 그 대신 답하는 모든 행이 replication lag만큼 낡아 있습니다."
category: "데이터 분산과 일관성"
scene: replication-lag
sceneStep: 1
related:
  - label: Replication Lag
    slug: replication-lag
  - label: Replication
    slug: replication
  - label: Read-Your-Writes
    slug: read-your-writes
  - label: Eventual Consistency
    slug: eventual-consistency
  - label: Load Balancer
    slug: load-balancer
  - label: Read Model
    slug: read-model
  - label: CQRS
    slug: command-query-responsibility-segregation
references:
  - title: Distributed data in cloud-native applications
    url: https://learn.microsoft.com/en-us/dotnet/architecture/cloud-native/distributed-data
  - title: Data store selection (Azure Architecture Center)
    url: https://learn.microsoft.com/en-us/azure/architecture/guide/technology-choices/data-stores-getting-started
---

대부분의 애플리케이션은 쓰기보다 읽기를 훨씬 많이 하고, 그 읽기 하나하나가 같은 기계에서 쓰기와 경쟁합니다. Read replica는 그 경쟁을 없앱니다. 복사본이 쿼리를 답하고, 프라이머리는 변경을 commit해 넘기는 일에 집중합니다. 스키마도 쿼리도 바꿀 필요가 없으니 관계형 데이터베이스가 제공하는 가장 값싼 확장 수단이면서, 바로 그 이유로 잘못 쓰이기도 가장 쉬운 수단입니다.

쿼리를 레플리카로 보내는 일은 대개 코드가 아니라 연결 문자열입니다. SQL Server에서는 그룹에 읽기 전용 라우팅이 구성되어 있다는 전제 아래, 가용성 그룹 리스너가 `ApplicationIntent=ReadOnly`를 읽고 그 연결을 읽기 가능한 보조 복제본으로 보냅니다. PostgreSQL과 MySQL에서는 두 번째 연결을 레플리카 호스트로 향하게 하고 읽기 전용으로 엽니다. 애플리케이션 안에서는 같은 모델 위의 두 번째 컨텍스트나 두 번째 세션 팩토리가 되고, 작업마다 어느 쪽을 쓸지 고릅니다. 읽기 전용 쪽은 정말로 읽기 전용으로 만들어 두는 것이 좋습니다. 그래야 실수로 남은 `SaveChanges`가 데이터베이스까지 가지 않고 그 자리에서 드러납니다.

이렇게 얻은 것은 용량이지 두 번째 진실이 아닙니다. 레플리카는 replication lag만큼 뒤에 있으므로 조금 전까지 맞던 행으로 답합니다. 목록, 대시보드, 리포트, 내보내기, 검색 결과에는 괜찮고, 결과가 쓰기를 결정하는 읽기에는 괜찮지 않습니다. 이미 대체된 데이터를 보고 결정하는 셈이기 때문입니다. 중복 확인, 잔액 확인, 재고 수량은 프라이머리에 남깁니다.

트래픽이 올라간 뒤에는 두 가지를 지켜봅니다. 하나는 지연 자체입니다. 쿼리 부하가 큰 레플리카는 변경을 더 느리게 적용하므로, 가장 바쁠 때 가장 낡습니다. 다른 하나는 레플리카가 응답하지 않을 때의 동작입니다. 읽기는 실패하는 대신 프라이머리로 넘어가야 하고, 그 전환은 지표로 보여야 합니다. 조용히 빠져 버린 레플리카는 프라이머리의 부하가 조용히 두 배가 된 모습으로 나타나기 때문입니다.
