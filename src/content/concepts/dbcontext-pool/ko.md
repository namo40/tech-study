---
title: "DbContext Pool"
summary: "AddDbContextPool은 빌리고 돌려주는 규율을 연결이 아니라 DbContext 인스턴스에 적용합니다. 연결 풀 위에 얹히는 두 번째 풀이고 다른 비용, 즉 컨텍스트 하나를 만드는 비용을 아껴 줍니다. 대가는 풀에 드는 컨텍스트가 자기 상태를 하나도 지니지 말아야 한다는 것입니다."
category: "Pool과 자원 관리"
scene: database-connection-pool
sceneStep: 2
related:
  - label: Database Connection Pool
    slug: database-connection-pool
  - label: Entity Framework Core
    slug: entity-framework-core
  - label: ADO.NET Connection Pooling
    slug: ado-net-connection-pooling
  - label: Compiled Query
    slug: compiled-query
  - label: Object Pool
    slug: object-pool
references:
  - title: Advanced Performance Topics
    url: https://learn.microsoft.com/en-us/ef/core/performance/advanced-performance-topics
---

만들기 비싼 것을 빌려 쓰고 돌려주는 규율, 그것이 장면의 두 번째 단계 전부이고 거기서 빌리는 대상은 열린 연결입니다. `AddDbContextPool`은 같은 규율을 다른 객체, 즉 `DbContext` 인스턴스 자체에 적용합니다. 연결 풀을 대체하는 것이 아니라 그 위에 서는 두 번째 풀이고, 가장 먼저 분명히 해 둘 것은 두 풀이 아끼는 비용이 다르다는 점입니다. 연결 풀은 핸드셰이크와 TLS 협상과 로그인을 아끼고, 그것이 장면의 전부입니다. 컨텍스트 풀은 컨텍스트 객체를 만드는 일을 아끼며, 연결이 개입하든 말든 그 일을 합니다. 컨텍스트는 실제로 무언가를 실행하는 동안에만 아래 풀에서 연결을 빌리기 때문입니다. 한쪽을 켠다고 다른 쪽이 달라지지 않으니, 컨텍스트 풀링을 켜고 로그인이 줄기를 기대했다면 두 계층을 섞어 본 것입니다.

```csharp
builder.Services.AddDbContextPool<OrdersContext>(
    options => options.UseSqlServer(connectionString),
    poolSize: 128);   // 보관하는 것은 컨텍스트이지 연결이 아닙니다
```

절약이 실제로 무엇으로 이루어져 있는지는 크지 않아서, 짐작하기보다 재 보는 편이 좋습니다. `DbContext` 하나를 만든다는 것은 옵션을 해석하고 내부 서비스 공급자를 엮고 변경 추적기와 그에 딸린 상태를 할당한다는 뜻입니다. 정말로 비싼 산출물인 모델은 이미 애플리케이션의 모든 컨텍스트에 걸쳐 캐시되어 있고 인스턴스마다 다시 만들어지지 않으므로, 풀링이 피하는 것은 인스턴스마다의 나머지입니다. 그 나머지는 절대량으로는 작고, 주변의 일도 작을 때에만 의미 있는 비율로 드러납니다. 짧은 쿼리 하나를 도는 고처리량 엔드포인트, 바로 같은 이유로 compiled query가 값어치를 하는 그런 경로입니다. 무게 있는 일을 하는 요청에서는 이 설정 비용이 잡음이고, 풀은 아무것도 벌지 못한 채 제약만 얹습니다.

그 제약이 이 기능의 본체입니다. 풀에 든 컨텍스트는 폐기될 때 파괴되지 않습니다. EF Core가 초기화해서 변경 추적기를 비우고 다음 호출자에게 알맞은 상태로 되돌린 뒤 도로 넣습니다. 초기화가 포괄하는 것은 EF 자신의 상태이고, 포괄하지 않는 것은 여러분이 더한 것입니다. 그래서 풀에 드는 컨텍스트는 지니고 다닐 자기 것이 없어야 한다는 규칙이 나옵니다. 풀링 대상 컨텍스트 타입은 `DbContextOptions` 하나만 받는 생성자를 갖도록 요구되는데, 이 제약은 구현상의 한계라기보다 기능이 사실을 말해 주는 쪽에 가깝습니다. 인스턴스가 요청보다 오래 살 것이므로 요청 단위로 주입할 것이 애초에 없습니다. 필드에 붙잡아 둔 테넌트 id, 생성 시점에 읽은 사용자 신원, `SavingChanges`에 엮어 둔 이벤트 처리기, 한 요청이 바꿔 놓은 가변 속성은 다음 요청까지 살아남고, 그 결과는 오류가 아니라 조용한 요청 간 상태 누출입니다. 요청 단위 상태가 정말로 필요하다면 `IDbContextFactory`나 평범한 `AddDbContext`가 정직한 답입니다.

실무 사항 둘로 마무리합니다. 풀에는 크기가 있고 그것을 넘어서는 것은 실패가 아닙니다. `poolSize`를 넘는 인스턴스는 공급자가 그냥 평소대로 만들고 폐기 시 버리므로, 이 설정은 동시성 한계가 아니라 보관량의 상한입니다. 풀이 작을 때의 증상은 무언가 망가지는 것이 아니라 이득이 조용히 사라지는 것입니다. 그리고 이 전체 모양에 EF에만 있는 것은 없습니다. 만드는 값이 초기화하는 값보다 비싼 객체라면 무엇에든 object pool이 적용하는 그 빌림과 돌려줌이고, 채택하는 이유도 같고 조심할 점도 같습니다. 풀에 드는 객체는 돌아올 때 깨끗해야 합니다.
