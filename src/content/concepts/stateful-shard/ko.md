---
title: "Stateful Shard"
summary: "상태를 쥔 샤드는 Map의 한 줄을 다른 노드로 바꾼다고 옮겨지지 않습니다. 레플리카를 채우고, 채우는 동안 일어난 쓰기를 다시 반영하고, 그런 다음에야 소유가 뒤집힙니다. 호출하는 쪽이 느끼는 것은 복사의 길이가 아니라 전환의 길이입니다."
category: "데이터 분산과 일관성"
scene: rebalancing
sceneStep: 4
related:
  - label: Rebalancing
    slug: rebalancing
  - label: Sharding
    slug: sharding
  - label: Partitioning
    slug: partitioning
  - label: Cross-Shard Query
    slug: cross-shard-query
  - label: Replication
    slug: replication
  - label: Replication Lag
    slug: replication-lag
  - label: Failover
    slug: failover
  - label: Leader Election
    slug: leader-election
  - label: Eventual Consistency
    slug: eventual-consistency
references:
  - title: Partitioning and horizontal scaling in Azure Cosmos DB
    url: https://learn.microsoft.com/en-us/azure/cosmos-db/partitioning
  - title: Sharding pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/sharding
  - title: Partition Service Fabric reliable services
    url: https://learn.microsoft.com/en-us/azure/service-fabric/service-fabric-concepts-partitioning
---

상태가 없는 샤드는 Map의 한 줄을 고치는 것으로 옮겨집니다. 상태를 쥔 샤드는 바이트를 소유하고 있으니, 옮기는 일이 곧 데이터 마이그레이션입니다. 다만 단위가 몇 달이 아니라 몇 분일 뿐입니다. 그래서 흥미로운 질문은 얼마나 오래 걸리느냐가 아니라, 그 시간 중 얼마를 호출하는 쪽이 보게 되느냐입니다. 이 답이 바로 이동을 한 번에 해치우지 않고 세 박자로 나누는 이유입니다. 복사는 길고 보이지 않고, 따라잡기는 짧고 보이지 않으며, 전환만이 누구에게나 느껴지는 부분입니다.

복사는 여전히 영업 중인 샤드를 상대로 돌아갑니다. 대상 노드의 레플리카가 스냅샷에서 채워지는 동안 원본은 계속 읽기에 답하고 쓰기를 받습니다. 그래서 복사의 길이는 가용성과 무관해집니다. 100기가바이트든 100메가바이트든 호출하는 쪽이 치르는 값은 같습니다. 그동안 내내 원본이 응답하고 있기 때문입니다. 대신 치르는 값이 있습니다. 레플리카는 다 채워지기도 전에 이미 낡아 있습니다. 복사 중에 원본이 받은 쓰기 하나하나가 레플리카가 본 적 없는 변경이기 때문입니다. 이 단계에는 일부러 제한을 겁니다. 같은 디스크와 같은 네트워크를 두고 운영 트래픽과 다투고 있으며, 가장 빠른 복사가 장애를 일으키는 복사인 경우가 아주 흔합니다.

따라잡기는 그 간격을 좁힙니다. 원본은 스냅샷을 뜬 시점부터 자기 쓰기를 기록해 왔고, 그 기록을 레플리카에 다시 반영합니다. 남은 차이를 짧은 멈춤 한 번으로 비울 수 있을 만큼 둘이 가까워질 때까지입니다. 여기서 "충분히 가깝다"는 느낌이 아니라 실제 기준값입니다. 반영이 새 변경이 도착하는 속도보다 빨라야 하고, 그렇지 않으면 간격은 결코 줄지 않고 이동도 끝나지 않습니다. 수렴하지 않는다면 더 세게 밀어붙이라는 신호가 아니라, 멈추고 한산한 시간에 다시 시도하라는 신호입니다.

비용이 드는 순간은 전환뿐입니다. 샤드로 가는 쓰기를 멈추거나 큐에 세우고, 마지막 몇 변경을 레플리카로 흘려보내고, Map을 새 소유자 이름으로 고쳐 쓰고, 트래픽을 재개합니다. 이 순서의 모든 것이 짧아야 합니다. 멈춤의 길이는 따라잡기가 남긴 지연이 결정하고, 앞 단계가 존재하는 이유가 바로 그것입니다. 호출하는 쪽은 잠깐의 지체나 재안내로 이것을 겪습니다. 옛 Map 사본을 쥔 쪽은 원본에 도착해서 다시 안내를 받으니, 원본은 데이터를 더 이상 소유하지 않게 된 뒤에도 한동안 그 재안내를 살려 두어야 합니다.

전체를 안전하게 만드는 규칙은 둘입니다. 매 순간 소유자는 정확히 하나이고, 그것이 누구인지 말하는 것은 Map입니다. 노드가 아니고, 클라이언트가 기억하는 노드도 아닙니다. 그리고 실패한 이동은 원본이 샤드를 계속 소유한 채로 끝나는 이동이며, 반쯤 지어진 레플리카는 버립니다. 버려진 사본은 두 번째 의견이 아니라 쓰레기입니다. 전환은 여러 번 적용해도 결과가 달라지지 않게 만들고 버전으로 fencing을 걸어, 이동 전에 떠난 늦은 메시지가 이동 뒤에 적용되지 못하게 합니다. 그러면 실패한 마이그레이션의 최악의 결과가 낭비된 대역폭에 그칩니다.
