---
title: "Bounded Staleness"
summary: "Bounded staleness는 숫자를 붙인 최종 일관성입니다. 읽기가 primary보다 뒤처질 수는 있지만, 합의한 시간이나 합의한 쓰기 개수보다 더 뒤처지지는 않습니다. 끝이 열려 있던 구간을 라우터가 판단에 쓸 수 있는 예산으로 바꿔 줍니다."
category: "데이터 분산과 일관성"
scene: eventual-consistency
sceneStep: 4
related:
  - label: Eventual Consistency
    slug: eventual-consistency
  - label: Session Consistency
    slug: session-consistency
  - label: Replication Lag
    slug: replication-lag
  - label: Read Replica
    slug: read-replica
  - label: Health-Based Routing
    slug: health-based-routing
  - label: TTL
    slug: ttl
  - label: Cache Invalidation
    slug: cache-invalidation
references:
  - title: Consistency levels in Azure Cosmos DB
    url: https://learn.microsoft.com/en-us/azure/cosmos-db/consistency-levels
  - title: Distributed data in cloud-native applications
    url: https://learn.microsoft.com/en-us/dotnet/architecture/cloud-native/distributed-data
---

최종 일관성에서 곤란한 점은 읽기가 낡는다는 사실이 아니라, 얼마나 낡는지를 아무도 말해 주지 않는다는 점입니다. 쓰기가 몰리면 그 구간은 막아 주는 것 없이 늘어나고, 50밀리초 뒤처지는 동안에는 멀쩡하던 설계가 어느새 2초 전 데이터로 답합니다. 지연 상한은 그 숫자를 못 박습니다. 읽기는 뒤처질 수 있되 몇 밀리초까지, 혹은 몇 버전까지이고 그 이상은 안 됩니다. 상한을 넘는 순간부터는 운의 문제가 아니라 시스템이 무언가를 해야 하는 문제가 됩니다.

그 무언가는 거의 항상 라우팅입니다. 상한 안에 있는 replica는 계속 읽기를 답하고, 상한을 벗어난 replica는 따라잡을 때까지 회전에서 빠지며, 그쪽 트래픽은 아직 상한 안에 있는 복사본으로 넘어갑니다. HTTP 상태 대신 지연을 신호로 쓰는 헬스 체크와 같은 형태이고, 실패하는 방식도 둘 다 같습니다. 상한을 너무 빡빡하게 잡으면 쓰기가 몰릴 때마다 회전이 비어 primary로 전부 쏟아지는데, 그것이야말로 replica를 둔 이유였던 부하입니다. 너무 헐겁게 잡으면 상한은 장식이 됩니다. 한 번도 걸리지 않으니 아무도 보호하지 못합니다. 히스테리시스도 필요합니다. 그러지 않으면 경계선 근처를 오르내리는 replica가 회전을 들락거리고, 그때마다 읽기 한 무더기가 자리를 옮깁니다.

숫자를 고르는 일은 엔지니어링 단위로 적는 제품 결정입니다. 읽는 사람이 무엇을 알아챌지 물어봅니다. 가격표는 한 시간 뒤처져도 아무도 신경 쓰지 않고, 함께 편집하는 문서는 1초도 뒤처지면 안 되며, 재고 수량은 그 사이 어딘가인데 틀렸을 때 판매를 놓치는지 초과 판매가 되는지에 따라 달라집니다. 그런 다음 실제로 관측되는 지연과 상한을 견줍니다. 평소 지연보다 낮은 상한은 보장이 아니라 바쁜 오후를 기다리는 장애입니다.

Azure Cosmos DB는 이것을 일관성 수준으로 바로 제공하며, 시간과 버전 개수를 함께 설정합니다. 복제가 지킬 수 없는 상한은 계정이 받아 주지 않습니다. 다른 환경에서는 직접 조립합니다. replica의 위치나 보고된 지연을 읽고, 예산과 비교해 라우팅하고, 해당하는 복사본이 없으면 primary로 넘깁니다. 캐시도 모습만 다른 같은 발상입니다. TTL은 라우팅을 뺀 지연 상한이고, 그래서 강한 읽기를 담아 둔 캐시 사본도 만료 시간만큼만 새것입니다.
