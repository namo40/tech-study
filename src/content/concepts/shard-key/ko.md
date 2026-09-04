---
title: "Shard Key"
summary: "shard key는 라우터가 해시해서 행이 어느 샤드에 사는지 정하는 컬럼입니다. 조회 하나를 상자 하나로 끝낼 수 있는지, 그리고 데이터가 고르게 퍼지는지를 한꺼번에 결정하며, 데이터가 쌓인 뒤에는 사실상 바꿀 수 없습니다."
category: "데이터 분산과 일관성"
scene: sharding
sceneStep: 2
related:
  - label: Sharding
    slug: sharding
  - label: Consistent Hashing
    slug: consistent-hashing
  - label: Hot Partition
    slug: hot-partition
  - label: Partitioning
    slug: partitioning
  - label: Cross-Shard Query
    slug: cross-shard-query
  - label: Rebalancing
    slug: rebalancing
  - label: Database Index
    slug: database-index
  - label: Replication
    slug: replication
  - label: Replication Lag
    slug: replication-lag
  - label: Load Balancer
    slug: load-balancer
references:
  - title: "Data partitioning guidance"
    url: https://learn.microsoft.com/en-us/azure/architecture/best-practices/data-partitioning
  - title: "Partitioning and horizontal scaling in Azure Cosmos DB"
    url: https://learn.microsoft.com/en-us/azure/cosmos-db/partitioning
  - title: "Sharding pattern"
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/sharding
---

장면의 두 번째 단계는 규칙 하나를 켜고, 화면에 보이는 모든 것이 거기서 따라 나옵니다. 키가 속한 샤드는 물어볼 때마다 그 키로부터 계산됩니다. 같은 키를 연달아 세 번 물어보면 세 번 다 같은 상자에 도착하는데, 어딘가에 어디로 갔는지 기록해 두었기 때문이 아니라 같은 입력을 같은 함수에 넣으면 같은 값이 나오기 때문입니다. 그것이 약속의 전부입니다. 이 점은 분명히 말해 둘 만합니다. 샤딩의 좋은 성질은 전부 여기서 세워지고, 나쁜 성질도 전부 여기서 나오기 때문입니다.

좋은 쪽은 키를 들고 온 조회가 정확히 상자 하나만 건드린다는 것입니다. 라우터는 찾아다니지 않고 주소를 계산해서 연결 하나를 엽니다. 그래서 샤딩된 시스템은 데이터가 열 배가 되어도 키가 있는 읽기를 예전과 같은 시간에 답할 수 있습니다. 나머지 10분의 9는 건드린 적이 없기 때문입니다.

나쁜 쪽은 같은 문장을 거꾸로 읽은 것입니다. 키를 들고 오지 않은 조회는 라우팅할 수 없으므로 모든 샤드에 물어보고 답을 합쳐야 합니다. 장면은 그것을 `fan-out`으로 그립니다. 요청 하나가 라우터를 떠나 모든 레인으로 동시에 내려갑니다. 단순히 일이 N배가 되는 것이 아닙니다. 가장 느린 샤드가 응답 시간을 정하고, 그동안 연결 N개가 잡혀 있고, 예전에는 데이터베이스가 해 주던 병합을 이제 여러분이 합니다. 밤에 한 번 도는 리포트라면 감당할 수 있습니다. 요청 경로에 있는 페이지라면 대개 감당하지 못합니다.

그래서 키는 데이터가 아니라 쿼리를 보고 고릅니다. 중요한 읽기를 적어 봅니다. 임계 경로에 있는 것, 가장 자주 도는 것을 적고, 그것들이 이미 공통으로 쥐고 있는 값이 무엇인지 봅니다. 업무 애플리케이션에서 그 값은 거의 언제나 테넌트, 고객, 계정입니다. 제품 자체가 이미 그것을 중심으로 짜여 있기 때문입니다. 중요한 읽기 대부분이 고객을 지목한다면 shard key는 `customer_id`이고, 어떤 분석 작업이 fan-out을 해야 한다는 사실은 놀랄 일이 아니라 치르기로 결정한 값입니다.

두 번째 기준은 분포이고, 사람들이 두 번째로 확인했다가 가장 먼저 후회하는 항목입니다. 라우팅은 잘되는데 분포가 나쁜 키는 복잡함만 전부 주고 확장은 하나도 주지 않습니다. 카디널리티가 낮은 경우가 눈에 띄는 실패입니다. 사용자 70%가 한 나라에 있는데 `country`로 나누면 샤드를 아무리 늘려도 샤드 하나가 데이터의 70%를 안고 있습니다. 단조 증가하는 키는 더 미묘합니다. 타임스탬프나 자동 증가 id로 나누면 새 쓰기가 전부 현재 구간을 가진 샤드로 몰리고, 나머지는 과거만 붙들고 있는데 쓰기 부하는 상자 하나에 전부 떨어집니다. Cosmos DB와 DynamoDB 문서가 이 패턴에 이름을 붙여 둔 데는 이유가 있습니다.

컬럼 하나가 두 일을 다 못 할 때는 복합 키가 해내는 경우가 많습니다. 테넌트 하나가 나머지보다 백 배 크다면 `tenant_id`만으로는 너무 성깁니다. `tenant_id + region`이나 `tenant_id`에 버킷 번호를 섞은 해시는 거대한 테넌트를 쪼개면서 평범한 테넌트는 한자리에 둡니다. 대신 조회가 샤드 하나로 끝나려면 이제 두 부분을 다 알아야 하므로, 복합 키도 쿼리가 이미 아는 것이어야 합니다.

첫 행을 쓰기 전에 정해 둘 것이 두 가지 더 있습니다. 유일성은 이제 지역적입니다. 샤드의 유니크 인덱스는 그 샤드 안에서만 유일하므로, 시스템 전체에서 유일해야 하는 값은 shard key를 포함하든지, GUID나 ULID처럼 그 자체로 유일하게 생성되는 식별자를 받아야 합니다. 조인은 샤드 안에서만 성립하므로, 함께 읽는 테이블은 같은 키로 나눕니다. 그래야 한 고객의 주문, 주소, 청구서가 그 고객과 같은 상자에 삽니다.

나중에 키를 바꾸는 일은 설정 변경이 아니라 데이터 마이그레이션입니다. 모든 행을 다시 해시해서 옮겨야 하고, 보통 이중 쓰기 기간과 백필이 따라오며, 옛 키를 기준으로 쓴 쿼리를 전부 다시 봐야 합니다. 이 선택에 보통보다 많은 설계 시간을 들일 만한 이유가 그것입니다. 여러분은 이 시스템이 남은 평생 무엇을 싸게 물어볼 수 있을지를 고르고 있습니다.
