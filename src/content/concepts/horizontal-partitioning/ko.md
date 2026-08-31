---
title: "Horizontal Partitioning"
summary: "Horizontal partitioning은 테이블을 행으로 자릅니다. 모든 파트가 같은 스키마를 유지하면서 키가 고른 서로 다른 부분집합을 담습니다. 용량을 사 오는 절단이고, 그 선택을 하는 키가 결정의 전부입니다."
category: "데이터 분산과 일관성"
scene: partitioning
sceneStep: 2
related:
  - label: Partitioning
    slug: partitioning
  - label: Sharding
    slug: sharding
  - label: Vertical Partitioning
    slug: vertical-partitioning
  - label: Hot Partition
    slug: hot-partition
  - label: Cross-Shard Query
    slug: cross-shard-query
  - label: Rebalancing
    slug: rebalancing
  - label: Replication
    slug: replication
  - label: Database Index
    slug: database-index
  - label: Keyset Pagination
    slug: keyset-pagination
  - label: CAP Theorem
    slug: cap-theorem
references:
  - title: Data partitioning guidance
    url: https://learn.microsoft.com/en-us/azure/architecture/best-practices/data-partitioning
  - title: Data partitioning strategies
    url: https://learn.microsoft.com/en-us/azure/architecture/best-practices/data-partitioning-strategies
  - title: Sharding pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/sharding
---

장면의 2단계는 대부분의 사람이 이 단어를 들었을 때 떠올리는 절단입니다. 스키마는 바뀌지 않습니다. 모든 파트가 같은 열, 같은 인덱스, 같은 모양을 갖고, 파트들 사이의 유일한 차이는 어떤 행을 담고 있느냐입니다. 장면에서 두 카드가 같은 세 개의 밴드를 그리는 이유가 이것입니다. 어떤 파트를 봐도 그것이 파트라는 사실을 알려 주는 것은 없습니다. 자기가 갖지 않은 행이 다른 어딘가에 있다는 것 말고는요.

그렇게 사 오는 것이 용량이고, 행 수를 따라 커지는 모든 축에서 한꺼번에 사 옵니다. 쓰기가 갈라지니 한 기계가 전부를 받지 않습니다. 잠금은 테이블 전체가 아니라 파트 안에서 다투니, 한 파트의 긴 트랜잭션이 다른 파트에는 보이지 않습니다. 캐시는 전체의 반올림 오차가 아니라 한 파트의 의미 있는 비율을 담습니다. 백업은 끝낼 수 있는 조각만 덮고, 복원은 나머지가 계속 서비스하는 동안 한 파트만 되살리고, 인덱스 재구축은 한 달 전에 잡아 두어야 하는 일이기를 그만둡니다. 이 중 어느 것도 사람들이 이 방법을 꺼내는 표면적인 이유는 아니지만, 다 합치면 대개 진짜 이유입니다.

키가 결정의 전부입니다. 키는 빨라야만 하는 모든 쿼리에 들어 있어야 합니다. 키 없는 쿼리는 한 파트로 보낼 수 없어서 전부를 방문해야 하기 때문입니다. 키는 행을 고르게 퍼뜨려야 합니다. 몰아 놓는 키는 나머지가 노는 동안 한 파트가 시스템을 짊어지게 만들기 때문입니다. 그리고 키는 바뀌지 않아야 합니다. 행이 어디 사는지 정하는 값을 고치는 일은 저장소 사이로 행을 옮기는 일이고, 그 행이 두 곳에 있거나 어디에도 없는 동안 읽는 쪽에 무엇을 보장할지까지 정해야 하기 때문입니다. 테넌트 id, 사용자 id, 계정 id처럼 한 번 부여되고 영영 참조되는 것들이 여기에 맞습니다.

범위 키와 해시 키는 서로 다른 방식으로 실패하고, 그 차이는 고르기 전에 알아 둘 값어치가 있습니다. 키에 범위를 잡으면 이웃한 것들이 함께 있게 되어서, "이 고객의 3월부터 6월까지 전부"가 fan-out이 아니라 한 파트 안의 스캔이 됩니다. 그런데 시간에 범위를 잡으면 새 행이 전부 가장 새로운 파트로 갑니다. 장면의 4단계가 바로 그것입니다. 종이 위에서는 완벽하게 균형 잡혀 보이다가, 돌아가기 시작하는 순간 한 파트가 모든 쓰기를 받습니다. 해시는 구조상 고르게 퍼뜨리는 대신 범위 스캔을 통째로 포기합니다. 이웃한 키가 서로 근처에 떨어지지 않기 때문입니다. 복합 키는 양쪽을 조금씩 사 오지만, 머릿속에 담기 더 어려운 규칙을 대가로 냅니다.

포기하는 것은 예전에 공짜였던 보장들입니다. 트랜잭션은 파트를 가로지를 수 없어서, 두 파트를 건드리는 작업에는 saga나 outbox가 필요하거나, 두 반쪽이 따로 정착한다는 사실을 받아들여야 합니다. 유일 인덱스도 파트를 가로지를 수 없어서, 키가 아닌 것의 유일성은 애플리케이션이나 별도 저장소의 문제가 됩니다. 파트를 넘는 외래 키는 아예 강제할 수 없습니다. 서로 다른 키로 나뉜 테이블끼리의 조인은 조인이기를 그만두고 쿼리 두 개와 코드 약간이 됩니다. 이 하나하나에 쓸 만한 답이 있기는 합니다. 요점은 예전에는 공짜였고 이제는 아니라는 것입니다.

파트 개수는 한 번 정하기는 쉽고 나중에 바꾸기는 어려운 결정이라, 의식하고 정할 값어치가 있습니다. 키의 해시를 파트 수로 나눈 나머지는 누구나 가장 먼저 적는 규칙이고, 동시에 개수가 바뀌면 거의 모든 행을 옮기게 되는 규칙입니다. consistent hashing이 있는 이유가 이것입니다. 키 범위와 데이터베이스를 짝지어 저장하는 shard map은 조회 한 번을 비용으로 내고, 다른 파트를 건드리지 않고 한 파트만 둘로 쪼갤 수 있는 능력을 사 옵니다. 어느 쪽도 데이터를 옮기는 비용을 없애지는 못합니다. 얼마나 많은 데이터가 움직여야 하는지를 바꿀 뿐입니다.

시스템의 운영 규모는 파트 수를 따라 커지고, 그 증가는 사람들이 세기를 잊는 것들에서 선형으로 일어납니다. 파트 하나하나가 연결 풀이고, 감시 대상이고, 백업 일정이고, 패치 창이고, 장애 조치 계획이고, 이관이 중간에 실패할 수 있는 자리입니다. 두 파트는 한 파트보다 겨우 조금 더 일입니다. 열여섯 파트는 다른 직업입니다. 계산이 예쁘게 떨어지는 수가 아니라, 최악의 한 주에도 굴릴 수 있는 수를 고르세요.

.NET에는 이것을 위한 프레임워크 기능이 없습니다. 프레임워크가 당신의 키를 알 수 없기 때문입니다. 대신 있는 것은 키에서 연결 문자열로 가는 작은 지도, 그 지도가 돌려준 연결로 만든 `DbContext`, 그리고 키 없는 쿼리가 실수로 데이터베이스에 닿지 않게 하는 규율입니다. Azure SQL Database는 같은 발상을 shard map manager를 갖춘 elastic database tools로 묶어 두었고, Cosmos DB는 파티션 키를 컨테이너 정의의 일부로 만들어서 그 선택이 한 번 선언되고 조용히 흘러가지 않게 합니다.
