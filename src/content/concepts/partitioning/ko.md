---
title: "Partitioning"
summary: "Partitioning은 데이터를 어느 축으로 자를지 정하는 일입니다. 행을 갈라 각 파트가 부하의 몫을 지게 하거나, 열을 갈라 뜨거운 좁은 필드가 차갑고 넓은 필드를 끌고 다니지 않게 합니다. 그다음 파티션 키가 부하가 실제로 퍼질지 한 파트로 쏠릴지를 정합니다."
category: "데이터 분산과 일관성"
scene: partitioning
steps:
  - title: "모든 것을 담은 한 덩어리는 모든 비용을 함께 키웁니다"
    text: "고스트는 단 하나의 테이블을 보여 줍니다. 모든 쿼리가 전체를 훑고, 잠금은 그 훑기 뒤에 줄을 서고, 백업 창은 행 수를 따라 늘어집니다. 고장 난 것은 없습니다. 부분들이어야 할 자리에 하나가 있을 뿐입니다. 파티셔닝은 결정 하나로 시작합니다. 어느 축으로 자를 것인가."
  - title: "행을 가로질러 자르면 각 파트가 몫을 집니다"
    text: "모든 파트에 같은 스키마, 파트마다 다른 행. 키가 어느 행이 어디 사는지 말하고, 쓰기는 파트들 사이에서 갈라지고, 한 파트의 잠금과 캐시와 백업은 이제 세계 전체가 아니라 절반만 덮습니다. 용량을 사 오는 절단이 이것이고, 사람들이 샤딩이라고 부를 때 뜻하는 것이 이것입니다."
  - title: "열을 따라 자르면 뜨거운 필드가 차가운 필드를 끌고 다니기를 멈춥니다"
    text: "모든 요청이 읽는 좁은 열들은 이쪽으로, 한 달에 한 번 읽히는 넓은 덩어리들은 저쪽으로 갑니다. 잦은 읽기는 이제 캐시에 들어가는 홀쭉한 파트만 건드리고, 한 행의 두 반쪽은 둘 다 필요한 드문 날에 id로 다시 만납니다. 이 절단이 사 오는 것은 용량이 아니라 뜨거운 경로의 속도입니다."
  - title: "키가 파티셔닝의 성패를 통째로 정합니다"
    text: "날짜로 나누면 오늘의 쓰기는 전부 오늘의 파트에 내려앉습니다. 완벽한 설계가 뜨거운 한 덩어리로 도로 무너지는 것입니다. user처럼 요청이 고르게 퍼지는 것으로 나누면 부하도 따라 퍼집니다. 키는 모든 뜨거운 쿼리에 들어 있어야 하고, 고르게 퍼져야 하고, 바뀔 일이 없어야 합니다. 영구적인 것처럼 고르세요. 나중에 데이터를 옮기는 쪽이 비싼 이야기니까요."
related:
  - label: Sharding
    slug: sharding
  - label: Horizontal Partitioning
    slug: horizontal-partitioning
  - label: Vertical Partitioning
    slug: vertical-partitioning
  - label: Hot Partition
    slug: hot-partition
  - label: Cross-Shard Query
    slug: cross-shard-query
  - label: Rebalancing
    slug: rebalancing
  - label: Database Index
    slug: database-index
  - label: Replication
    slug: replication
  - label: Denormalization
    slug: denormalization
  - label: Cache-Aside
    slug: cache-aside
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

## 언제 쓰나

- 한 저장소의 부하나 크기나 사고 반경을 줄여야 하는데 더 싼 수단이 남지 않았을 때 씁니다. 파티셔닝은 인덱스로 감당이 안 되는 쿼리가 아니라 한 대의 기계를 넘어선 테이블에 대한 답입니다. 이 구별이 중요한 이유는, 둘 중 하나만이 두 번째 연결 문자열을 들일 만한 문제이기 때문입니다.
- **가로로, 용량을 위해.** 모든 파트에 같은 스키마, 파트마다 다른 행입니다. 각 파트가 행의 몫, 쓰기의 몫, 그리고 행 수를 따라 커지는 모든 것의 몫을 집니다. 잠금은 테이블 전체가 아니라 한 파트 안에서만 다투고, 캐시는 한 파트의 의미 있는 비율을 담고, 백업이나 인덱스 재구축은 주어진 창 안에 끝낼 수 있는 조각만 덮습니다. 사람들이 샤딩이라고 부를 때 뜻하는 절단이 이것입니다.
- **세로로, 뜨거운 경로의 속도를 위해.** 모든 요청이 읽는 좁은 열들을, 거의 아무도 읽지 않는 넓은 열들에서 떼어 냅니다. 설명 덩어리, 직렬화된 페이로드, 감사 기록, 이미지 같은 것들입니다. 그러면 잦은 읽기는 캐시 페이지마다 자신을 더 많이 담을 수 있는 홀쭉한 행만 건드리고, 넓은 반쪽은 정말로 그것을 원하는 드문 순간에만 가져옵니다.
- **기능별로, 독립을 위해.** 키가 아니라 서비스 경계를 따라 그은 선으로, 테이블마다 다른 저장소에 둡니다. 세 번째 축이고 파티셔닝이라고 가장 덜 불리는 축이지만, 주문과 분석을 별개의 데이터베이스로 나누는 일은 행이 아니라 테이블을 두고 내리는 같은 결정입니다.
- 백업이나 복원이나 인덱스 유지보수가 주어진 시간을 넘어섰을 때 씁니다. 테이블 하나를 네 시간 복원하는 것은 네 시간 장애입니다. 같은 하드웨어로 네 파트를 동시에 복원하는 것은 다른 이야기이고, 망가지지 않은 파트들은 애초에 내려가지도 않습니다.
- 성능과 무관한 이유로 한 테넌트나 한 지역이나 한 고객을 격리해야 할 때 씁니다. 테넌트마다 파트를 두면 "이 고객에게 속한 것을 전부 지운다"가 삭제가 아니라 드롭이 되고, 데이터 소재 요건이 쿼리 조건이 아니라 배포 결정이 됩니다.
- **첫 수단으로는 쓰지 마세요.** 인덱스, 캐시, 읽기 복제본, 더 큰 기계, 그리고 더는 필요 없는 데이터를 지우는 일은 언제나 두 번째 파트보다 쌉니다. 그리고 그 전부는 화요일 하루에 되돌릴 수 있습니다. 파티셔닝은 여기서 유일하게, 오래 잘 굴러갈수록 되돌리기 어려워지는 구조 결정입니다.

## 주의점

- 파티션 키가 결정이고 나머지는 전부 수단입니다. 키는 모든 뜨거운 쿼리에 들어 있어야 하고, 그렇지 않으면 그 쿼리들은 모든 파트를 방문해야 합니다. 키는 부하를 고르게 퍼뜨려야 하고, 그렇지 않으면 한 파트가 시스템을 짊어집니다. 키는 절대로 바뀌지 않아야 하고, 그렇지 않으면 값 하나를 고치는 일이 저장소를 넘나드는 행 이동이 됩니다. 영구적인 것처럼 고르세요. 실제로도 그렇습니다.
- 날짜나 시간 키는 오늘을 뜨거운 파트로 만듭니다. 새 행은 전부 오늘을 지니고 있으니 모든 쓰기가 같은 파트에 내려앉고 나머지는 놀게 됩니다. 종이 위에서 균형 잡혀 보이던 설계가 바쁜 테이블 하나로 도로 무너지는 것입니다. 시간 기반 파티셔닝은 접근 패턴도 시간 기반일 때, 그러니까 보존과 아카이빙, 범위로 읽는 추가 전용 텔레메트리에 맞습니다. 워크로드가 "최근 것을 끊임없이"인 순간 틀린 선택이 됩니다.
- 카디널리티가 낮으면 파트 개수에 상한이 생깁니다. 서로 다른 값이 여섯 개인 키는 기계를 아무리 사도 여섯 파트를 넘길 수 없고, 원본에서부터 분포가 치우친 키는 그 치우침 그대로 크기가 치우친 파트를 만듭니다. 기계를 세기 전에 서로 다른 값이 몇 개인지부터 확인합니다.
- 키를 지니지 않은 쿼리는 모든 파트를 방문해서 답을 합쳐야 합니다. 그것은 실제 비용이 드는 실제 작업이고, 싼 조회 하나를 가장 느린 파트가 지연을 정하는 fan-out으로 바꿔 놓습니다. 빨라야만 하는 쿼리를 중심으로 키를 설계하고, 느려도 되는 쿼리는 fan-out을 감수합니다. 아니면 그 쿼리들을 위해 다른 키로 잡은 사본을 따로 둡니다.
- 트랜잭션과 유일성 제약은 파트 경계에서 멈춥니다. 두 파트에 있는 두 행을 데이터베이스가 원자적으로 갱신해 줄 수는 없고, 유일 인덱스는 파트를 가로지를 수 없습니다. 그래서 유일성은 애플리케이션이나 별도 저장소가 지켜야 하는 것이 됩니다. 파트를 넘는 외래 키는 아예 강제할 수 없게 됩니다.
- 세로 분할은 행 전체를 원하는 읽기마다 조인이나 두 번째 조회를 지불합니다. 그것이 의도적으로 맺은 거래입니다. 드문 읽기가 비용을 내서 흔한 읽기가 내지 않게 하는 것이니까요. 다만 뜨거운 경로에서 두 반쪽을 다 읽기 시작하는 순간, 그 거래는 더 이상 좋은 거래가 아닙니다.
- 세어야 하는 것은 상상할 수 있는 파트가 아니라 운영할 수 있는 파트입니다. 파트 하나하나가 감시하고, 백업하고, 패치하고, 장애 조치하고, 새벽 세 시에 머리로 따라가야 하는 대상입니다. 팀이 실제로 굴릴 수 있는 네 파트가 대체로 다이어그램에만 있는 예순네 파트를 이깁니다.
- 나중에 데이터를 옮기는 쪽이 비싼 이야기입니다. 키나 파트 개수를 바꾸는 일은 시스템이 트래픽을 받는 중에 저장소를 넘나들며 행을 다시 쓰는 일이고, 이동 중에 읽는 쪽이 무엇을 보게 될지까지 정해 두어야 합니다. 키를 영구적인 것처럼 고르는 이유가 이것이고, consistent hashing과 rebalancing이 각자의 주제로 따로 있는 이유도 이것입니다.

## .NET에서는

세로 파티셔닝은 EF Core에 직접적인 지원이 있습니다. 두 엔터티가 서로의 존재를 모르는 채로 한 테이블과 한 행을 나눠 쓸 수 있기 때문입니다. 테이블 분할은 이 장면 3단계의 모델 수준 판본입니다.

```csharp
// 넓은 반쪽은 같은 테이블과 같은 키를 공유하는 별개의 엔터티입니다. 그래서
// Product를 조회해도 요청하지 않는 한 덩어리는 절대 실리지 않습니다.
modelBuilder.Entity<Product>(b =>
{
    b.ToTable("Products");
    b.HasOne(p => p.Details).WithOne()
        .HasForeignKey<ProductDetails>(d => d.Id);
});

modelBuilder.Entity<ProductDetails>().ToTable("Products");
```

그러면 좁은 반쪽을 읽는 것이 기본이 되고, 넓은 반쪽은 명시적으로 요청해야 하는 것이 됩니다.

```csharp
// 뜨거운 경로: 덩어리도, 설명도, 감사 페이로드도 없습니다.
var summary = await db.Products
    .Where(p => p.CategoryId == categoryId)
    .Select(p => new ProductSummary(p.Id, p.Name, p.Price))
    .ToListAsync(ct);

// 드문 경로: 누군가 실제로 그것을 열어 볼 때만.
var full = await db.Products
    .Include(p => p.Details)
    .SingleAsync(p => p.Id == id, ct);
```

가로 파티셔닝에는 프레임워크 기능이 없습니다. 프레임워크가 당신의 키를 알 수 없기 때문입니다. 필요한 것은 키에서 연결 문자열로 가는 지도와 파트마다 하나씩인 컨텍스트입니다.

```csharp
public sealed class ShardMap(IReadOnlyList<string> connections)
{
    // 키 규칙은 한 곳에 삽니다. 나머지 전부가 그것을 읽기만 하고 아무것도
    // 스스로 정하지 않아서, 규칙을 바꾸는 일이 한정된 변경이 됩니다.
    public string ConnectionFor(Guid tenantId) =>
        connections[(int)((uint)tenantId.GetHashCode() % connections.Count)];
}

public sealed class OrdersContextFactory(ShardMap map)
{
    public OrdersContext For(Guid tenantId)
    {
        var options = new DbContextOptionsBuilder<OrdersContext>()
            .UseSqlServer(map.ConnectionFor(tenantId))
            .Options;
        return new OrdersContext(options);
    }
}
```

위 규칙은 키에 범위를 잡지 않고 해시를 씁니다. 그 차이가 퍼뜨리는 것과 쌓는 것의 차이입니다. 날짜에 범위를 잡으면 새 행이 전부 마지막 파트로 가지만, 테넌트에 해시를 걸면 흩어집니다. 그리고 `GetHashCode`는 프로세스나 런타임 판본을 넘어 안정적이지 않다는 점도 함께 짚어 둡니다. 실제 샤드 지도는 문자열 형태의 해시처럼 자기가 소유한 해시를 써서, 같은 키가 내년에도 같은 파트로 풀리게 합니다.

관리형 플랫폼은 배관이 아니라 모양을 줍니다. Azure SQL Database는 키 범위와 그 데이터베이스를 관리하는 shard map manager를 갖춘 elastic database tools를 제공합니다. Azure Cosmos DB는 파티션 키를 컨테이너 정의의 일부로 만들어서, 그 선택이 생성 시점에 선언되고 나중에는 고칠 수 없게 합니다.

```csharp
await database.CreateContainerIfNotExistsAsync(new ContainerProperties(
    id: "orders",
    // 퍼짐을 위해, 그리고 모든 뜨거운 쿼리에 들어 있기 때문에 고른 키입니다.
    // 영구적이기도 합니다. 바꾸려면 새 컨테이너와 이관이 필요합니다.
    partitionKeyPath: "/tenantId"));

// 단일 파티션 읽기: 키를 주었으니 파티션 하나가 답합니다.
var order = await container.ReadItemAsync<Order>(
    id, new PartitionKey(tenantId), cancellationToken: ct);
```

접근 패턴이 정말로 시간 모양인 시간 모양 데이터라면, SQL Server 자체의 파티션 테이블이 하나의 논리 테이블을 범위 함수로 파티션에 나눠 둡니다. 그러면 아카이빙이 삭제가 아니라 메타데이터 작업이 됩니다.

```sql
-- 로그를 채우는 DELETE가 아니라 스위치로 처리하는 보존 정책입니다.
ALTER TABLE Telemetry SWITCH PARTITION 1 TO TelemetryArchive PARTITION 1;
```

목표로 삼을 모양은 장면이 끝나는 자리의 모양입니다. 규칙 하나가 행이 어디 사는지 정하고, 그 규칙은 한 곳에서 읽을 수 있고, 이미 모든 뜨거운 쿼리가 지니고 다니는 것을 가리킵니다. 파트들은 같은 스키마에 다른 행을 담거나 같은 정체성에 다른 열을 담고, 둘 중 어느 쪽인지는 흘러간 결과가 아니라 결정이었습니다. 그리고 돌아가는 시스템의 어느 부분도 파트 개수가 오늘 그대로일 것에 기대지 않습니다. 파티셔닝된 저장소에 대해 확실한 한 가지는, 지금 가진 것보다 더 많은 파트가 필요해지리라는 것이니까요.
