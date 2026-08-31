---
title: "Denormalization"
summary: "Denormalization은 읽기가 원하는 모양대로 데이터의 사본을 두고 쓰기마다 조금씩 갱신해서, 질문이 여러 곳에서 조립되는 대신 한 곳에 내려앉게 하는 일입니다. 그다음부터 관리하는 것은 사본의 수와 얼마나 낡도록 둘 것인가입니다."
category: "데이터 분산과 일관성"
scene: cross-shard-query
sceneStep: 4
related:
  - label: Cross-Shard Query
    slug: cross-shard-query
  - label: Materialized View
    slug: materialized-view
  - label: Sharding
    slug: sharding
  - label: Partitioning
    slug: partitioning
  - label: CQRS
    slug: command-query-responsibility-segregation
  - label: Eventual Consistency
    slug: eventual-consistency
  - label: Transactional Outbox
    slug: transactional-outbox
  - label: Database Index
    slug: database-index
  - label: Cache-Aside
    slug: cache-aside
references:
  - title: Modeling data in Azure Cosmos DB
    url: https://learn.microsoft.com/en-us/azure/cosmos-db/nosql/modeling-data
  - title: Materialized View pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/materialized-view
  - title: Sharding pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/sharding
---

정규화된 스키마는 모든 사실을 정확히 한 번만 저장합니다. 그래서 쓰기가 단순하고 옳습니다. 바꿀 곳이 한 군데뿐이니 스스로와 어긋날 수가 없습니다. 그 값은 읽기가 치릅니다. 제품이 실제로 던지는 질문은 사실들이 저장된 모양과 거의 언제나 맞지 않으므로, 답은 읽는 시점에 여러 테이블에서, 나뉜 저장소라면 여러 기계에서 조립되어야 합니다. Denormalization은 그 조립 비용을 쓰기 시점에 한 번만 치르고 결과를 보관하겠다는 결정입니다.

단위는 질문의 모양을 한 사본입니다. 고객의 주문 합계, 팔로우하는 사람들의 최근 게시물 스무 개로 된 피드, 외래 키 대신 분류 이름을 직접 들고 있는 상품 행 같은 것들입니다. 이들은 모두 정규화된 사실에서 이끌어 낼 수 있고, 존재하는 이유는 읽을 때마다 이끌어 내는 것이 쓸 때마다 유지하는 것보다 비싸기 때문입니다. 그 비율이 논거의 전부이며, 취향이 아니라 측정의 문제입니다. 답을 바꾸는 쓰기 한 번당 질문이 만 번 들어온다면 사본이 네 자릿수 차이로 이기고, 하루에 한 번 들어온다면 그것은 순전한 부채입니다.

샤딩된 데이터에서 이 방법이 통하는 이유는 사본이 원본과 다른 키를 가질 수 있기 때문입니다. 사실들은 쓰기가 필요로 하는 기준으로 나뉘고, 사본은 읽기가 묻는 기준으로 나뉩니다. 그래서 샤드를 가로지르는 질문이라면 읽기마다 치렀을 부채질이 쓰기마다의 작은 갱신으로 바뀝니다. 이것은 보조 인덱스와 같은 수를 손으로 두는 것이고, 대신 맞바꿈이 눈에 보입니다. 무엇을 복제할지 고르고, 어디에 둘지 고르고, 그것을 최신으로 유지하는 비용을 볼 수 있습니다.

값은 사본이 틀릴 수 있다는 것입니다. 쓰기와 갱신 사이의 순간에는 틀리는데, 이것이 낡음이고, 그 기능이 얼마나 견디는지를 소리 내어 말해 두면 대개 괜찮습니다. 갱신을 잃으면 영구히 틀리는데, 이것은 괜찮지 않고, 중요한 것은 이쪽 실패 방식입니다. 그러므로 갱신 경로는 그것이 뒤따르는 쓰기만큼 믿을 수 있어야 합니다. 사본이 같은 저장소에 있으면 같은 트랜잭션 안에서, 그렇지 않으면 outbox나 change feed를 통해서 갱신합니다. 그래야 사본이 조용히 사라진 메시지가 되지 않습니다. 갱신은 반복해도 안전하게 만들어 두세요. 최소 한 번 전달은 때때로 두 번 적용된다는 뜻이고, 두 번 적용된 증분은 저절로는 결코 바로잡히지 않는 틀린 숫자입니다.

사본의 수를 세어 둡니다. 하나가 늘 때마다 쓰기 증폭이 하나 늘고, 모양이 바뀔 때 다시 채워야 할 것이 하나 늘고, 버그가 오래가는 불일치를 남길 수 있는 자리가 하나 늘어납니다. 모든 사본을 정규화된 원본에서 다시 만드는 방법을 갖추고, 실제로 돌려 보세요. 한 번도 다시 돌려 보지 않은 유도 과정은 믿을 수 없는 유도 과정입니다. 그리고 여전히 정규화되어 있는 진실의 원본을 하나 남겨 둡니다. 사본이 유일한 기록이 되는 순간, 예상하지 못한 질문에 답할 능력을 잃게 됩니다.
