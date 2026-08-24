---
title: "Replication Lag"
summary: "Replication lag은 쓰기가 primary에 반영된 시점과 같은 변경이 replica에 나타나는 시점 사이의 지연입니다. 그 사이에 replica가 답한 읽기는 과거를 보게 되며, 해결책은 지연이 작기를 바라는 것이 아니라 읽기를 어디로 보낼지 정하는 것입니다."
category: "데이터 분산과 일관성"
scene: replication-lag
steps:
  - title: "primary와 replica"
    text: "쓰기는 primary로 가고, 읽기는 모든 변경을 조금 늦게 받는 replica로 갑니다. 대개는 그 조금 늦음이 문제가 되지 않습니다."
  - title: "방금 쓴 것을 읽으면"
    text: "부하가 걸리면 지연이 몇 초로 늘어납니다. 사용자가 변경을 저장하고 새로고침하면 옛 값이 보입니다. 읽기가 아직 따라오지 못한 replica로 갔기 때문입니다. 그러다 따라잡으면 변경이 나타납니다."
  - title: "세션에 필요한 만큼 라우팅합니다"
    text: "쓰기 뒤 몇 초 동안은 그 세션의 읽기를 primary로 보내거나, replica가 그 쓰기 위치에 도달할 때까지 기다리게 합니다. 다른 사용자는 계속 replica를 읽습니다."
  - title: "재고, 값을 알아 둡니다"
    text: "사용자보다 먼저 지연에 경보를 겁니다. primary가 죽으면 replica가 승격되고, 아직 전송 중이던 변경은 사라집니다. 그것이 RPO입니다. 동기 복제는 그 손실을 없애는 대신 모든 쓰기의 지연에 비용을 더합니다."
related:
  - label: Replication
    slug: replication
  - label: Read Replica
    slug: read-replica
  - label: Read-Your-Writes
    slug: read-your-writes
  - label: Session Consistency
    slug: session-consistency
  - label: Eventual Consistency
    slug: eventual-consistency
  - label: Bounded Staleness
    slug: bounded-staleness
  - label: Failover
    slug: failover
  - label: RPO
    slug: rpo
  - label: Materialized View
    slug: materialized-view
  - label: Read Model
    slug: read-model
references:
  - title: Distributed data in cloud-native applications
    url: https://learn.microsoft.com/en-us/dotnet/architecture/cloud-native/distributed-data
  - title: Consistency levels in Azure Cosmos DB
    url: https://learn.microsoft.com/en-us/azure/cosmos-db/consistency-levels
  - title: Data store selection (Azure Architecture Center)
    url: https://learn.microsoft.com/en-us/azure/architecture/guide/technology-choices/data-stores-getting-started
---

## 언제 쓰나

- read replica를 두는 구성에는 언제나 지연이 있습니다. 기계 사이로 데이터를 복사하는 일의 성질이지 한 번 고치면 사라지는 결함이 아니므로, 질문은 지연을 어떻게 없앨지가 아니라 어떤 읽기가 그 지연을 견딜 수 있는지입니다.
- replica는 구조상 최종 일관성(eventual consistency)을 가집니다. 모든 변경을 결국 갖게 되지만 물어본 그 순간에는 아직 아닙니다. 그 문장을 거스르지 말고 전제로 삼아 설계합니다.
- 엔드포인트마다 따로 정합니다. 어떤 읽기는 조금 옛 값이어도 되고, 어떤 읽기는 호출한 사용자 자신의 쓰기는 반드시 보아야 하며, 어떤 읽기는 모두에게 최신이어야 합니다. 셋은 서로 다른 경로이고 공짜인 것은 첫 번째뿐입니다.
- 읽기가 쓰기보다 훨씬 많고 그 읽기의 대부분이 화면에 뜰 때 이미 몇 초 지난 데이터라면 replica가 잘 맞습니다. 대시보드, 목록, 리포트, 검색 결과처럼 사람이 훑어보는 화면이 여기에 해당합니다.
- 결과가 곧바로 쓰기로 이어지는 읽기는 primary에 남깁니다. 출금 전 잔액 확인, 예약 전 재고 확인, 삽입 전 중복 확인이 그런 읽기입니다.

## 주의점

- 사용자가 신고하는 문제는 거의 언제나 자기 쓰기를 읽지 못하는 경우입니다. 방금 저장한 사람이 몇 초 뒤 새로고침하고 옛 값을 봅니다. 그 세션의 읽기를 몇 초 동안 primary로 보내거나, 그 쓰기가 받은 위치에 replica가 도달할 때까지 붙잡아 둡니다.
- 지연은 쓰기 폭주, 긴 트랜잭션, replica의 CPU 부하, 스키마 마이그레이션에서 커지고, replica가 변경을 한 스레드로 적용할 때 가장 빠르게 벌어집니다. 사용자보다 먼저 경보를 걸되 한 번의 뾰족한 값이 아니라 추세에 겁니다.
- 비동기 복제는 내구성을 내주고 지연을 얻습니다. failover 때 승격된 replica는 자기가 적용해 둔 것까지만 가지고 있으므로 전송 중이던 변경은 사라집니다. RPO가 0이 아니라는 뜻이고, 이는 데이터베이스 설정이라기보다 사업상의 결정입니다.
- 동기 복제는 그 손실을 없애는 대신 비용을 모든 쓰기로 옮깁니다. commit이 두 번째 기계를 기다리기 때문입니다. 가용성도 함께 묶입니다. 응답하지 않는 replica 하나가 primary의 commit을 막을 수 있습니다.
- 결과가 쓰기로 이어지는 읽기에는 replica를 쓰지 않습니다. 낡은 값을 읽고 계산해 다시 쓰면 아직 아무도 보지 못한 변경을 덮어쓰게 되고, 오류는 나지 않습니다.
- 쓰기와 그 쓰기에 의존하는 이벤트 사이의 지연도 살펴봅니다. commit 시점에 발행한 메시지가 replica를 읽는 소비자에게 변경보다 먼저 도착하면, 아직 존재하지 않는 행에 대한 메시지처럼 보입니다.

## .NET에서는

할 일은 결국 라우팅입니다. 같은 모델 위에 컨텍스트 두 개를 두고, 이 세션이 방금 무엇을 썼는지 기억하고, 읽기에 규칙을 하나 정합니다.

```csharp
// Two contexts over the same model: one to the primary, one to the read-only replica.
builder.Services.AddDbContext<PrimaryDbContext>(o => o.UseSqlServer(primaryConnection));
builder.Services.AddDbContext<ReplicaDbContext>(o =>
    o.UseSqlServer(replicaConnection + ";ApplicationIntent=ReadOnly"));

// Remember a recent write per session, in a cookie or a distributed cache, then route by it.
public sealed class ReadRouter(
    PrimaryDbContext primary,
    ReplicaDbContext replica,
    IHttpContextAccessor http)
{
    private const string Cookie = "recently-wrote";
    private static readonly TimeSpan Window = TimeSpan.FromSeconds(5);

    public DbContext ForRead()
    {
        var wrote = http.HttpContext?.Request.Cookies[Cookie];
        if (wrote is not null
            && DateTimeOffset.TryParse(wrote, out var at)
            && DateTimeOffset.UtcNow - at < Window)
        {
            return primary;                       // read your own write
        }

        return replica;
    }

    public void MarkWrote() =>
        http.HttpContext?.Response.Cookies.Append(
            Cookie,
            DateTimeOffset.UtcNow.ToString("O"),
            new CookieOptions { HttpOnly = true, MaxAge = Window });
}
```

SQL Server에서는 연결 문자열에 `ApplicationIntent=ReadOnly`만 넣으면 가용성 그룹이 라우팅을 대신해 줍니다. 리스너가 그 연결을 읽기 가능한 보조 복제본으로 보내므로 분리가 코드가 아니라 설정으로 끝납니다. PostgreSQL에서는 `pg_last_wal_replay_lsn()`이 replica가 어디까지 왔는지 알려 주며, "replica가 이 위치에 도달할 때까지 기다린다" 방식은 여기에서 만들어집니다. 쓰기가 돌려준 위치를 들고 있다가 비교하고, 기다림이 요청이 감당할 수 있는 시간을 넘기면 primary로 넘어가면 됩니다. 어느 쪽을 쓰든 지연은 요청 지연 옆에 지표로 내놓습니다. 장애를 들여다볼 때 두 숫자가 서로를 설명해 줍니다.
