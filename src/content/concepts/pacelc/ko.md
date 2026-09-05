---
title: "PACELC"
summary: "PACELC는 CAP 정리에 매일 마주치는 절반을 더합니다. 네트워크 파티션(Partition)이 있으면 가용성과 일관성 중에서, 아니면(Else) 지연과 일관성 중에서 고른다는 것입니다. 대부분의 날에는 파티션이 없으므로, 시스템의 진짜 성격은 Else 쪽 가지에 있습니다."
category: "데이터 분산과 일관성"
scene: cap-theorem
sceneStep: 4
related:
  - label: CAP Theorem
    slug: cap-theorem
  - label: Strong Consistency
    slug: strong-consistency
  - label: Eventual Consistency
    slug: eventual-consistency
  - label: Linearizability
    slug: linearizability
  - label: Consistent Prefix
    slug: consistent-prefix
  - label: Replication Lag
    slug: replication-lag
  - label: Replication
    slug: replication
  - label: Quorum
    slug: quorum
  - label: Conflict Resolution
    slug: conflict-resolution
  - label: Failover
    slug: failover
references:
  - title: Consistency levels in Azure Cosmos DB
    url: https://learn.microsoft.com/en-us/azure/cosmos-db/consistency-levels
  - title: Data partitioning guidance
    url: https://learn.microsoft.com/en-us/azure/architecture/best-practices/data-partitioning
---

PACELC는 가지가 둘인 한 문장으로 읽힙니다. 네트워크 파티션(Partition)이 있으면 가용성과 일관성 중에서 고르고, 아니면(Else) 지연과 일관성 중에서 고른다는 것입니다. Daniel Abadi가 이 이름을 내놓은 까닭은, CAP 정리만 놓고 보면 드문 비상 상황만 설명할 뿐 시스템 수명의 나머지를 채우는 평범한 화요일 오후에 대해서는 아무 말도 하지 않기 때문입니다. 뒤쪽 절반이 더 쓸모 있는 이유는 바로 그것이 늘 돌아가고 있다는 데 있습니다. 복제된 저장소는 파티션이 있든 없든 모든 읽기마다 지연 대 일관성의 교환을 하고 있고, 사용자가 실제로 겪는 것이 그 교환입니다.

장면의 4단계는 비상 상황을 걷어낸 그 문장입니다. `link`는 온전하고 끊긴 곳은 없는데도 두 읽기의 비용이 여전히 다릅니다. 강한 일관 읽기는 답하기 전에 다른 레플리카까지 갔다 와야 하므로 계량기가 `ms 150`을 읽습니다. 느슨한 읽기는 호출자와 가장 가까운 사본에서 답하므로 `ms 90`을 읽습니다. 아무것도 실패하지 않았고, 위기 속에서 무언가를 고른 사람도 없습니다. 차이는 그저 합의가 네트워크를 건너야 할 때 합의에 붙는 값이고, 그것을 요구하는 모든 읽기에 청구됩니다.

풀어 쓰면 시스템에는 두 글자짜리 설명이 붙습니다. PC/EC는 양쪽 가지 모두에서 일관성의 대가를 치르며, Bigtable과 HBase, 읽기가 리더로 가는 관계형 클러스터가 여기에 놓입니다. PA/EL은 양쪽에서 포기하며, Dynamo와 Cassandra, Riak, 기본값 그대로 둔 Cosmos DB 계정이 그렇습니다. 섞인 짝이 드문 쪽입니다. PC/EL(네트워크가 깨지면 일관되고 나머지 시간에는 빠른 쪽)은 읽기를 읽기 가능한 보조 복제본이 받는 동기 커밋 가용성 그룹의 모양인데, Abadi 자신의 조사에서도 거기에 놓이는 저장소를 대기 어려워합니다. 이 표기의 목적은 제품을 칸에 넣어 정리하는 것이 아니라 Else 쪽 가지를 소리 내어 말하게 하는 것입니다. 두 팀이 네트워크 파티션 중에 벌어지는 일에 완전히 합의하고도 서로 다른 제품을 만들고 있을 수 있습니다. 한쪽은 모든 읽기마다 지역 간 왕복을 치르고 다른 쪽은 그러지 않기 때문입니다.

PACELC의 불편한 대목은 이미 답이 나와 있다는 사실입니다. 스택의 모든 기본값이 이 선 위의 한 위치입니다. `Session`으로 설정된 Cosmos DB 계정, `secondaryPreferred`로 둔 Mongo의 `readPreference`, 비동기 커밋으로 돌아가는 가용성 그룹, 무효화 계획 없이 쿼리 앞에 놓인 캐시가 그렇습니다. 그중 어느 것도 설계 회의를 거치지 않았지만, 전부 얼마나 빠른 답을 얻는 대가로 답이 얼마나 낡아도 되는지에 관한 선택입니다. PACELC를 제대로 읽는다는 것은 그 기본값들을 다시 훑어보고, 어떤 데이터 집합을 옮길 만한지 정하고, 나머지가 그 자리에 남는 이유를 적어 두는 일입니다.
