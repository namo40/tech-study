---
title: "Eventual Consistency"
summary: "Eventual consistency는 갱신이 멈추면 모든 복제본이 결국 같은 값으로 모인다는 약속입니다. 다만 언제까지라는 상한은 없습니다. 설계의 대상은 그 사이의 구간입니다. 읽는 쪽이 무엇을 볼 수 있는지, 무엇은 절대 보면 안 되는지, 어떤 읽기에 더 강한 보장이 필요한지를 정합니다."
category: "데이터 분산과 일관성"
scene: eventual-consistency
steps:
  - title: "수렴"
    text: "쓰기는 프라이머리에 먼저 닿고, 잠시 뒤 복제본으로 퍼집니다. 쓰기를 멈추면 모든 복사본이 결국 같은 값이 됩니다. eventually는 언제인지 말해 주지 않고, 간격이 닫힌다는 것만 약속합니다."
  - title: "어디서 읽느냐가 무엇을 보느냐를 정합니다"
    text: "두 독자가 같은 순간 같은 질문을 던져도 다른 답을 받습니다. 복제본마다 자기만큼의 지연으로 프라이머리를 뒤따르기 때문입니다. 쓰기가 몰리면 그 지연에는 상한이 없습니다."
  - title: "가장 먼저 깨지는 약속은 자기 쓰기입니다"
    text: "저장하고 새로 고쳤더니 방금 그 변경이 없습니다. 읽기가 아직 쓰기가 닿지 않은 복제본에 떨어진 것입니다. 세션 일관성은 그 사용자의 읽기를 자기 쓰기가 있는 복사본에 고정해 약속을 되살립니다."
  - title: "시스템 단위가 아니라 읽기 단위로 고릅니다"
    text: "잔액 확인은 프라이머리를 읽고 지연을 지불합니다. 상품 페이지는 아무 복제본이나 읽고 아무것도 지불하지 않습니다. 그 사이의 지연 상한은 뒤처진 복제본이 따라잡을 때까지 회전에서 빼 둡니다."
related:
  - label: Replication
    slug: replication
  - label: Replication Lag
    slug: replication-lag
  - label: Read Replica
    slug: read-replica
  - label: Read-Your-Writes
    slug: read-your-writes
  - label: Session Consistency
    slug: session-consistency
  - label: Bounded Staleness
    slug: bounded-staleness
  - label: Materialized View
    slug: materialized-view
  - label: Projection
    slug: projection
  - label: CQRS
    slug: command-query-responsibility-segregation
  - label: Cache Invalidation
    slug: cache-invalidation
  - label: Saga
    slug: saga
references:
  - title: Consistency levels in Azure Cosmos DB
    url: https://learn.microsoft.com/en-us/azure/cosmos-db/consistency-levels
  - title: Manage consistency levels in Azure Cosmos DB
    url: https://learn.microsoft.com/en-us/azure/cosmos-db/nosql/how-to-manage-consistency
  - title: Distributed data in cloud-native applications
    url: https://learn.microsoft.com/en-us/dotnet/architecture/cloud-native/distributed-data
  - title: Caching guidance (Azure Architecture Center)
    url: https://learn.microsoft.com/en-us/azure/architecture/best-practices/caching
---

## 언제 쓰나

- primary를 떠난 읽기는 모두 최종 일관성 읽기입니다. replica, 캐시, 검색 색인, projection, materialized view가 모두 여기에 해당합니다. 쓰기와 화면 사이에는 보통 이런 층이 하나가 아니고, 층마다 자기 몫의 지연을 더합니다.
- 보장하는 것은 수렴이지 최신성이 아닙니다. 쓰기가 멈추면 복사본들이 더는 어긋나지 않는다는 뜻이고, 쓰기가 계속 들어오는 동안 읽는 쪽이 무엇을 받는지는 말해 주지 않습니다.
- 읽기가 쓰기보다 훨씬 많고, 데이터가 화면에 뜰 때 이미 조금 지난 상태이며, 두 사람이 1초 정도 다른 답을 보아도 아무 일도 아닌 곳에 잘 맞습니다. 카탈로그, 피드, 대시보드, 검색이 그런 화면입니다.
- 복제 지연은 오류율과 나란히 지켜봅니다. 이 지연이 곧 이 문서가 다루는 구간의 폭이기 때문입니다. 지연 수치가 없는 시스템은 자기 읽기가 얼마나 낡을 수 있는지도 모르는 상태입니다.
- 시스템 단위가 아니라 엔드포인트 단위로 정합니다. 대부분의 읽기는 replica로 충분하고, 몇몇은 호출한 사용자 자신의 쓰기를 반드시 보아야 하며, 아주 일부는 모두에게 최신이어야 합니다. 공짜인 것은 첫 번째뿐입니다.

## 주의점

- eventual은 수렴에 대한 말이지 지연의 상한이 아닙니다. 쓰기가 몰리거나, 긴 트랜잭션이 걸리거나, replica가 변경을 한 줄로만 적용하면 그 구간은 막아 주는 것 없이 늘어납니다.
- 사용자가 가장 먼저 신고하는 것은 자기 쓰기를 못 보는 경우입니다. 저장한 뒤 새로 고치면 변경이 닿지 않은 replica에서 화면이 그려지고, 방금 한 편집이 사라져 보입니다. 이 한 가지는 세션 고정이나 세션 토큰으로 해결하고, 모든 읽기를 강한 읽기로 바꾸지는 않습니다.
- 일관성을 실수로 섞지 않도록 합니다. 강한 읽기의 결과를 캐시에 넣거나 projection에 흘려보내면 그것은 이름만 다른 최종 일관성 읽기이고, 최신인 것처럼 신뢰받게 됩니다.
- 단조 읽기도 함께 봅니다. 사용자가 replica 사이를 오가면 어떤 값을 본 뒤 더 옛 값을 보고 다시 새 값을 보게 되는데, 이는 시스템이 방금 한 작업을 되돌린 것처럼 읽힙니다.
- 최종 일관성 읽기가 쓰기의 입력이 되게 두지 않습니다. 낡은 값을 읽어 고쳐 쓰면 아직 아무도 보지 못한 변경을 조용히 덮어쓰고, 오류는 아무 데서도 나지 않습니다.

## .NET에서는

Azure Cosmos DB는 이 선택을 겉으로 드러냅니다. 계정 전체의 기본값 하나에, 요청 단위로 덮어쓰는 값이 붙는 구조입니다. 현실적인 기본값은 Session이고, 세션 토큰이 사용자를 따라다녀야만 그 보장이 유지됩니다.

```csharp
// Session is the practical default: a client always sees its own writes.
builder.Services.AddSingleton(_ => new CosmosClient(connection, new CosmosClientOptions
{
    ConsistencyLevel = ConsistencyLevel.Session,
}));

// The token is what carries the guarantee. Keep it per user, not per process,
// or the next request lands on a node that has never heard of the write.
var read = await container.ReadItemAsync<Cart>(
    id,
    new PartitionKey(userId),
    new ItemRequestOptions { SessionToken = tokens.Get(userId) });
tokens.Set(userId, read.Headers.Session);

// The one read that cannot be eventual, asked for explicitly and paid for.
var balance = await container.ReadItemAsync<Account>(
    accountId,
    new PartitionKey(userId),
    new ItemRequestOptions { ConsistencyLevel = ConsistencyLevel.Strong });
```

Cosmos DB가 아니어도 형태는 같습니다. SQL Server나 PostgreSQL 뒤의 read replica는 연결 문자열로 라우팅하고, 어떤 읽기가 replica를 써도 되는지는 핸들러마다 흩어 두지 말고 한곳에서 정합니다. `HybridCache`와 출력 캐싱은 저장소가 주는 보장 위에 얹히는 또 하나의 최종 일관성 층입니다. 강한 읽기를 캐시에 넣어 둔 사본은 그 항목이 살아 있는 동안만큼만 새것이고, 만료 시간으로 정한 값이 곧 받아들이기로 한 낡음의 정도입니다.
