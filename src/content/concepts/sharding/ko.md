---
title: "Sharding"
summary: "Sharding은 데이터베이스 하나를 키로 나눠 여러 개로 만드는 방식입니다. shard key가 모든 행이 사는 곳을 정하고, 샤드를 추가하면 데이터가 이사해야 하며, consistent hashing은 그 이사를 작게 유지합니다. 그래서 성장이 비상 사태가 아니라 한계가 정해진 예측 가능한 사건이 됩니다."
category: "데이터 분산과 일관성"
scene: sharding
steps:
  - title: "하나의 데이터베이스는 아닌 날이 올 때까지만 하나입니다"
    text: "모든 키를 한 상자에 넣는 방식은 그 상자가 가득 차는 날까지만 통합니다. 데이터로, 쓰기로, 장애 반경으로 가득 찹니다. 샤딩은 상자를 키로 나눕니다. 같은 데이터 모델, 여러 개의 더 작은 집, 그리고 모든 키가 어느 집에 사는지 아는 라우터입니다."
  - title: "shard key는 모든 행의 주소입니다"
    text: "같은 키는 언제나 같은 샤드입니다. 그 약속이 있어야 키 하나 조회가 상자 하나만 건드립니다. 키를 무시한 쿼리는 모든 샤드로 퍼져 나가 전부의 값을 치릅니다. 대부분의 쿼리가 이미 쥐고 있는 키, 그리고 고르게 퍼지는 키를 고릅니다."
  - title: "성장이 거의 전부의 이사를 뜻해서는 안 됩니다"
    text: "hash mod n 아래에서 셋째 샤드를 더하면 대부분의 키에 대해 답이 바뀝니다. 열둘 중 여덟이 이사해야 합니다. 해시 링에서는 새 샤드가 자기 이웃 구간만 넘겨받습니다. 넷만 이사하고 여덟은 집에 남습니다. 지도가 거의 바뀌지 않기 때문에 약속이 확장을 견딥니다."
  - title: "샤드 셋, 지도 하나, 소동은 없습니다"
    text: "키는 링이 말하는 자리에 앉고, 라우터는 요청을 곧장 집으로 보내고, 부하는 모든 상자에 퍼집니다. 성장은 한계가 있는 예측 가능한 이사가 됐고, 다음 샤드도 같은 값일 것입니다. 남는 일은 키 자체를 지켜보는 것입니다. 인기 키는 다른 문제이고, 제 페이지가 따로 있습니다."
related:
  - label: Shard Key
    slug: shard-key
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
  - label: Replication
    slug: replication
  - label: Replication Lag
    slug: replication-lag
  - label: Database Index
    slug: database-index
  - label: Load Balancer
    slug: load-balancer
  - label: Ordering
    slug: ordering
  - label: Event Stream
    slug: event-stream
references:
  - title: "Sharding pattern"
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/sharding
  - title: "Data partitioning guidance"
    url: https://learn.microsoft.com/en-us/azure/architecture/best-practices/data-partitioning
  - title: "Partitioning and horizontal scaling in Azure Cosmos DB"
    url: https://learn.microsoft.com/en-us/azure/cosmos-db/partitioning-overview
---

## 언제 쓰나

- 데이터베이스 하나가 데이터를 더 담지 못하거나, 쓰기를 받아 내지 못하거나, 장애 반경을 가두지 못하고, 수직 확장으로 살 수 있는 기계도 바닥났을 때입니다. 샤딩은 상자 하나를 더 키울 수 없게 된 다음에 꺼내는 수단입니다.
- 테넌트가 자연스러운 경계인 다중 테넌트 시스템입니다. 샤드당 테넌트 하나로 두거나 작은 테넌트를 여럿 묶으면 격리가 덤으로 따라옵니다. 폭주하는 테넌트가 모두의 상자가 아니라 제 상자만 채웁니다.
- 주 인스턴스 하나가 감당하지 못하는 쓰기 중심 워크로드입니다. 읽기 복제본은 읽기만 늘려 주고 쓰기에는 아무것도 해 주지 못하므로, 쓰기 경로가 천장이 되면 쓰기 경로를 쪼개는 것 말고는 남는 수가 없습니다.
- 쿼리가 이미 들고 다니는 키가 있는 데이터입니다. 거의 모든 요청이 어느 고객, 어느 테넌트, 어느 지역에 대한 것인지 알고 있다면, 데이터를 나눌 키는 이미 손안에 있습니다.
- 첫 수단은 아닙니다. 인덱스, 캐시, 읽기 복제본, 오래된 행 보관처럼 값싼 것부터 순서대로 시도합니다. 그것들은 전부 되돌릴 수 있지만 샤딩은 되돌릴 수 없습니다. 샤딩 이후에 작성되는 모든 쿼리는 계속 세금을 냅니다.

## 주의점

- shard key는 사실상 바꿀 수 없습니다. 바꾸려면 모든 행이 사는 곳을 다시 써야 합니다. 오늘 쓰고 있는 쿼리 하나가 아니라 실제로 돌리는 쿼리 전체를 기준으로 고릅니다.
- 샤드를 넘나드는 조회와 트랜잭션이 청구서입니다. 키 없는 조회는 모든 샤드로 퍼지는 fan-out이 되고, 샤드를 넘는 트랜잭션은 분산 커밋이나 saga가 됩니다. 흔한 경로는 샤드 하나 안에 머물게 설계하고, 드문 경로는 느려도 되게 놔둡니다.
- consistent hashing 없는 재배치는 성장을 대이동으로 만듭니다. `hash mod n` 아래에서는 샤드를 하나 더하는 순간 대부분의 키에 대해 답이 바뀌고, 그러면 데이터 대부분이 한꺼번에 움직입니다. 해시 링이나 미리 쪼개 둔 가상 파티션을 재할당하는 방식은 이동량을 추가한 만큼으로 묶어 둡니다.
- 키 공간이 고르다고 부하가 고른 것은 아닙니다. 키가 완벽하게 퍼져 있어도 샤드 하나만 불타는 일이 있습니다. 키 하나가 나머지보다 천 배 자주 읽히기 때문입니다. 그것이 hot partition이고, 샤드를 아무리 늘려도 해결되지 않습니다.
- 운영 비용이 곱해집니다. 백업, 스키마 마이그레이션, 모니터링, 장애 조치 훈련, 온콜 문서가 전부 N개가 되고, 전부를 건드려야 하는 작업은 가장 느린 샤드의 속도를 따라갑니다.
- 자동 증가 식별자는 더 이상 유일하지 않습니다. 시퀀스는 샤드마다 따로 돌아가므로, 저장되기 전에 이미 유일한 식별자를 주세요. GUID, ULID, 또는 샤드 정보를 품은 키가 그렇습니다.

## .NET에서는

프레임워크가 대신 샤딩해 주지는 않고, 그 편이 맞는 모양입니다. 라우팅은 데이터 계층에 있어야 하고, 그 실체는 키를 연결 문자열로 옮기는 shard map입니다.

```csharp
// 샤드 지도: 연결을 정하는 것은 키뿐입니다.
public sealed class ShardMap(IReadOnlyList<string> connections)
{
    public int ShardOf(string shardKey)
    {
        // string.GetHashCode()가 아니라 안정적인 해시를 씁니다. 그쪽은 프로세스마다
        // 무작위로 바뀌어서, 재시작하면 같은 테넌트가 다른 샤드로 가 버립니다.
        // XxHash64는 System.IO.Hashing 패키지에 있습니다.
        var hash = XxHash64.HashToUInt64(Encoding.UTF8.GetBytes(shardKey));
        return (int)(hash % (ulong)connections.Count);
    }

    public string ConnectionFor(string shardKey) => connections[ShardOf(shardKey)];

    public IReadOnlyList<string> Connections => connections;
}

// 키를 쥔 조회는 샤드 하나를 건드립니다. 키가 없는 조회는 전부를 건드리고,
// 그 비용이 메서드 자체에 드러나 있어서 누구도 실수로 fan-out을 만들지 않습니다.
public sealed class OrderQueries(ShardMap map, IDbContextFactory<OrderDbContext> inner)
{
    public async Task<List<Order>> ForTenantAsync(string tenantId, CancellationToken token)
    {
        await using var context = Open(map.ConnectionFor(tenantId));
        return await context.Orders
            .Where(o => o.TenantId == tenantId)
            .ToListAsync(token);
    }

    public async Task<List<Order>> PlacedSinceAsync(DateTimeOffset cutoff, CancellationToken token)
    {
        var pages = await Task.WhenAll(map.Connections.Select(async connection =>
        {
            await using var context = Open(connection);
            return await context.Orders.Where(o => o.PlacedAt > cutoff).ToListAsync(token);
        }));

        return pages.SelectMany(page => page).OrderByDescending(o => o.PlacedAt).ToList();
    }

    // 풀은 연결 문자열마다 따로 잡힙니다. 샤드가 N개면 공용 풀 하나가 아니라
    // 풀이 N개라는 뜻이므로, 크기는 전체가 아니라 샤드 하나 기준으로 정합니다.
    private OrderDbContext Open(string connection)
    {
        var context = inner.CreateDbContext();
        context.Database.SetConnectionString(connection);
        return context;
    }
}
```

관리형 선택지는 라우팅을 코드 밖으로 옮겨 주지만 생각해야 할 것은 그대로입니다. Azure Cosmos DB는 컨테이너마다 파티션 키를 요구하고 그 키로 대신 나눠 주므로, 설계 작업은 그 키를 고르는 일과 조회를 논리 파티션 하나 안에 묶어 두는 일이 됩니다. Azure SQL Database는 탄력적 풀과 shard map manager를 제공합니다. 키에서 데이터베이스로 가는 지도를 카탈로그 데이터베이스에 두고, 주어진 키에 맞는 연결을 돌려줍니다. 캐시 계층에서는 같은 발상이 한 층 위에 나타납니다. 클라이언트 쪽에서 캐시 노드에 consistent hashing을 걸어 두면, 노드를 하나 추가해도 캐시 전체가 아니라 일부만 무효가 됩니다.
