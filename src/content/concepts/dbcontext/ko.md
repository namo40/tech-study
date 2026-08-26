---
title: "DbContext"
summary: "DbContext는 데이터베이스와의 세션 하나입니다. 빌려 쓰는 연결, 추적 중인 엔티티, 곧 커밋할 작업 단위가 여기에 담깁니다. 만드는 비용은 싸고, 스레드 안전하지 않으며, 요청 하나만큼 살도록 만들어졌습니다."
category: ".NET 데이터 접근"
scene: change-tracking
sceneStep: 3
related:
  - label: Change Tracking
    slug: change-tracking
  - label: Unit of Work
    slug: unit-of-work
  - label: No-Tracking Query
    slug: no-tracking-query
  - label: Database Connection Pool
    slug: database-connection-pool
  - label: Repository
    slug: repository
  - label: Transaction
    slug: transaction
references:
  - title: DbContext lifetime, configuration and initialization
    url: https://learn.microsoft.com/en-us/ef/core/dbcontext-configuration/
  - title: Change tracking in EF Core
    url: https://learn.microsoft.com/en-us/ef/core/change-tracking/
---

DbContext는 세 가지를 한꺼번에 맡고 있고, 이것에 관한 조언은 대부분 거기서 나옵니다. 쿼리를 거는 창구이므로 모델과 풀에서 빌린 연결을 들고 있습니다. 변경 추적기이므로 내어준 엔티티마다 스냅샷을 들고 있습니다. 그리고 작업 단위이므로 다음 SaveChanges에서 함께 커밋될 변경을 들고 있습니다. 여기에 담긴 것은 모두 자기 자신에게만 속하고, 두 인스턴스가 무언가를 나눠 갖는 일은 없습니다.

수명을 요청에 맞추는 이유가 이것입니다. `AddDbContext`는 기본적으로 그렇게 등록합니다. 요청마다 자기 컨텍스트를 얻고, 비어 있는 tracker로 시작하고, 쿼리가 도는 동안만 연결을 빌리고, 끝나면 폐기됩니다. 만드는 비용을 일부러 싸게 해 둔 것인데, 비싼 쪽은 한 번 만들어 캐시해 두는 모델과 풀에서 오는 연결이기 때문입니다.

수명을 늘렸을 때 나타나는 증상은 갑작스러운 실패가 아니라 천천히 새는 것입니다. 싱글턴으로 등록된 컨텍스트는 그것을 거쳐 간 모든 요청의 추적 엔티티를 쌓아 두므로 tracker가 끝없이 커지고, SaveChanges마다 점점 커지는 집합을 훑게 되며, 메모리는 끝내 반환되지 않습니다. 다른 증상은 동시성입니다. DbContext는 한 번에 한 작업만 지원하므로, 같은 인스턴스에 대한 `await` 두 개가 나란히 걸리면 서로 끼어드는 대신 예외가 납니다.

```csharp
// Scoped by default: one context per request, empty tracker, disposed at the end.
builder.Services.AddDbContext<ShopDbContext>(o => o.UseNpgsql(cs));

// Background work has no request to scope to, so make one per unit of work.
builder.Services.AddDbContextFactory<ShopDbContext>(o => o.UseNpgsql(cs));

public sealed class NightlyJob(IDbContextFactory<ShopDbContext> factory)
{
    public async Task RunAsync(CancellationToken ct)
    {
        await using var db = await factory.CreateDbContextAsync(ct);
        // ... one unit of work, then this context goes away
    }
}
```

건강하게 유지하는 습관이 둘 있습니다. 데이터베이스 호출이 아닌 느린 작업을 사이에 두고 컨텍스트를 붙들고 있지 마세요. 연결과 트랜잭션이 함께 묶여 갑니다. 그리고 오래 도는 반복문이 컨텍스트 하나를 수천 번 공유하게 두지 마세요. 배치마다 하나씩 만들거나, 배치 사이에 `ChangeTracker.Clear()`를 불러서 이미 끝난 일을 tracker가 계속 이고 가지 않게 합니다.
