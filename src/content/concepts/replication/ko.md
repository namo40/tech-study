---
title: "Replication"
summary: "Replication은 데이터의 복사본을 다른 기계에 하나 더 두고, 모든 변경을 그쪽으로 보내 최신 상태로 유지하는 일입니다. 읽기 용량과 넘어갈 기계를 얻는 대신, 두 복사본이 서로 다른 값을 가지는 구간을 치릅니다."
category: "데이터 분산과 일관성"
scene: replication-lag
related:
  - label: Replication Lag
    slug: replication-lag
  - label: Read Replica
    slug: read-replica
  - label: Primary-Replica
    slug: primary-replica
  - label: Failover
    slug: failover
  - label: RPO
    slug: rpo
  - label: Eventual Consistency
    slug: eventual-consistency
  - label: Materialized View
    slug: materialized-view
references:
  - title: Distributed data in cloud-native applications
    url: https://learn.microsoft.com/en-us/dotnet/architecture/cloud-native/distributed-data
  - title: Data store selection (Azure Architecture Center)
    url: https://learn.microsoft.com/en-us/azure/architecture/guide/technology-choices/data-stores-getting-started
---

기계 하나가 데이터를 들고 쓰기를 받습니다. Replication은 그 기계가 commit한 모든 변경을 다른 기계로도 보내고, 받은 쪽이 같은 변경을 같은 순서로 적용해 같은 행을 갖게 하는 구성입니다. 이 복사본이 쓸모 있는 이유는 셋이고, 구분해 두는 편이 좋습니다. 읽기를 답할 수 있고, 첫 번째 기계가 사라졌을 때 승격될 수 있으며, 다른 지역에 두면 그 지역 전체의 장애를 견딜 수 있습니다. 셋을 모두 원하는 설계라면 대개 목적마다 다른 replica가 필요합니다.

대부분이 먼저 만나는 형태는 primary-replica입니다. 기계 하나가 모든 쓰기를 받고, 복사본 하나 이상이 그것을 따라갑니다. 다른 선택지는 여러 기계가 동시에 쓰기를 받는 방식인데, 쓰기 병목 하나를 없애는 대신 충돌 해소를 떠안습니다. 이제 두 기계가 서로의 변경을 듣기 전에 같은 행을 바꿀 수 있기 때문입니다. 소유자나 지역으로 자연스럽게 나뉘는 데이터라면 해 볼 만한 교환이고, 사용자가 하나의 값을 기대하는 데이터라면 손해 보는 교환입니다.

또 하나의 선택은 primary가 쓰기를 언제 끝난 것으로 볼지입니다. 비동기 복제는 primary가 변경을 가진 순간 commit하고 전송은 그 뒤에 합니다. 쓰기는 빠르게 유지되고, primary가 죽으면 아직 보내지 못한 것이 사라집니다. 동기 복제는 두 번째 기계의 확인을 받은 뒤에 commit을 돌려줍니다. 승격 때 잃는 것이 없고, 모든 쓰기가 왕복 비용을 냅니다. 그래서 느리거나 닿지 않는 replica가 곧 느리거나 실패하는 쓰기가 됩니다. 대부분의 데이터베이스는 그 사이의 방식도 제공합니다. 여러 replica 중 하나의 확인만 기다리는 식이라면 흔한 경우는 빠르게 두면서 손실의 한도는 정할 수 있습니다.

무엇을 고르든 복사본은 어느 정도 뒤처져 있고, 그 정도는 눈으로 볼 수 있어야 하는 숫자입니다. 쓰기가 적으면 작고, 폭주와 긴 트랜잭션에서 늘어나며, 읽기가 얼마나 낡을 수 있는지와 failover가 얼마나 잃을 수 있는지를 함께 결정합니다.
