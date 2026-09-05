---
title: "Change Data Capture"
summary: "Change Data Capture는 데이터베이스가 자기 복구를 위해 이미 남기고 있는 로그를 읽어 커밋된 행 변경 하나하나를 이벤트로 바꿉니다. 테이블을 폴링하지도, 같은 내용을 두 번 쓰지도 않습니다. 변경 자체가 메시지이고, 파이프라인은 데이터베이스가 놓아 둔 자리에서 그것을 읽어 갑니다."
category: "분산 트랜잭션과 메시지 일관성"
scene: transactional-outbox
sceneStep: 4
related:
  - label: Transactional Outbox
    slug: transactional-outbox
  - label: Replication
    slug: replication
  - label: Eventual Consistency
    slug: eventual-consistency
  - label: Materialized View
    slug: materialized-view
  - label: Projection
    slug: projection
  - label: Event Sourcing
    slug: event-sourcing
  - label: Message ID
    slug: message-id
references:
  - title: About change data capture (SQL Server)
    url: https://learn.microsoft.com/en-us/sql/relational-databases/track-changes/about-change-data-capture-sql-server
  - title: Track data changes (SQL Server)
    url: https://learn.microsoft.com/en-us/sql/relational-databases/track-changes/track-data-changes-sql-server
  - title: Outbox event router (Debezium)
    url: https://debezium.io/documentation/reference/stable/transformations/outbox-event-router.html
---

outbox를 폴링하는 릴레이는 대개 대답이 없는 질문을 반복합니다. 깨어날 때마다 조회 한 번이 들고, 간격이 지연의 바닥을 정하고, 간격을 줄이면 비용이 이쪽 칸에서 저쪽 칸으로 옮겨 갈 뿐입니다. Change Data Capture는 그 질문 자체를 없앱니다. 커밋된 변경은 이미 데이터베이스의 write-ahead log 안에 들어 있습니다. 그래야 데이터베이스가 갑작스러운 종료에서 살아나고 레플리카가 보조를 맞추기 때문입니다. 캡처 프로세스는 그 로그를 읽어 행 변경 하나마다 이벤트 하나를 내보냅니다. 무슨 일이 있었는지 정하는 것은 여전히 트랜잭션이고, 파이프라인은 묻기를 그만두고 듣기 시작할 뿐입니다.

나오는 것은 outbox 행이 담고 있던 것보다 한 단계 낮습니다. 그것이 맞바꾸는 대가입니다. outbox 행은 우리가 설계한 메시지입니다. 이름이 있고, 버전이 있고, 우리가 고른 본문이 있습니다. 캡처 피드가 주는 것은 테이블 한 행의 변경 전후 모습이고, 그것은 소비자가 우리 스키마를 보게 된다는 뜻입니다. 컬럼 이름 변경, 새로 생긴 nullable 필드, 둘로 쪼갠 테이블이 전부 아래쪽에 닿습니다. 흔한 해결은 outbox 테이블을 그대로 두고 그것만 캡처하는 것입니다. 트랜잭션은 우리가 의도한 메시지를 쓰고, 로그 리더가 그것을 실어 나릅니다. Debezium의 outbox event router가 바로 이 구성이고, 특이한 사례가 아니라 기본값으로 이해해 둘 만합니다.

보장은 장면의 4단계가 끝나는 지점과 같습니다. 캡처 프로세스는 로그를 어디까지 읽었는지 기록해 두고, 죽었다 살아나면 마지막으로 기록해 둔 위치부터 이어서 읽습니다. 그래서 그 위치와 종료 사이의 변경은 두 번 읽힙니다. 전달은 최소 한 번이고, 소비자에게는 여전히 메시지 id와 무엇을 처리했는지에 대한 기억이 필요합니다. 다만 순서는 보통 outbox보다 낫습니다. 로그가 하나의 시퀀스라서 변경이 커밋 순서대로 나오는 것이 공짜이고, 테이블이나 키 단위로 나누면 필요한 곳에서는 그 순서를 지키면서 나머지는 나란히 처리할 수 있습니다.

운영 면에서는 일이 서비스 밖으로, 데이터베이스와 파이프라인 쪽으로 옮겨 갑니다. SQL Server의 change data capture는 변경 테이블에 기록하므로 정리 작업과 별도의 디스크가 필요합니다. PostgreSQL의 logical decoding은 모든 복제 슬롯이 다 소비할 때까지 write-ahead log 조각을 붙들고 있어서, 멈춘 소비자가 지연 그래프가 아니라 주 서버의 디스크 부족 장애가 됩니다. 둘 다 애플리케이션 안이 아니라 그것이 사는 자리에서 감시해야 합니다. 선택의 실제 모양은 그것입니다. outbox 릴레이는 우리가 소유하고 디버깅할 수 있는 코드이고, change data capture는 우리가 설정하고 지켜봐야 하는 인프라입니다.
