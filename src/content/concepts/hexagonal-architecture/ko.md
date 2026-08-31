---
title: "Hexagonal Architecture"
summary: "헥사고날 아키텍처는 모든 의존이 안쪽을 향하게 합니다. domain은 가운데에서 바깥 이름을 하나도 모른 채 앉아 있고, port는 그 domain이 말하는 계약이며, adapter는 세상을 그 계약으로 번역합니다. 계약이 곧 경계이기 때문에 웹도 데이터베이스도 테스트 하네스도 갈아 끼울 수 있는 세부 사항이 됩니다."
category: "애플리케이션 아키텍처"
scene: hexagonal-architecture
steps:
  - title: "방향이 없으면 바깥이 안쪽에 금을 냅니다"
    text: "고스트는 데이터베이스에 곧바로 배선된 domain을 보여 줍니다. 컬럼 이름 하나가 바뀌자 domain에 금이 가고, 그 금은 웹 계층까지 이어집니다. 누가 이렇게 고른 것이 아닙니다. 아무도 방향을 정해 주지 않을 때 의존성이 하는 일이 이것일 뿐입니다. 이 아키텍처 전체가 규칙 하나입니다. 모든 의존은 안쪽을 향한다."
  - title: "안쪽은 계약만 말합니다"
    text: "port는 domain이 소유한 인터페이스입니다. 요청은 이쪽 포트로 들어오고, domain의 필요는 저쪽 포트로 나가며, 둘 다 domain 자신의 언어로 적혀 있습니다. \"이 주문을 저장하라\"이지 \"INSERT INTO\"가 아닙니다. 안쪽을 들여다보면 웹도, SQL도, 벤더 이름도 어디에도 없습니다. 그 부재가 곧 설계입니다."
  - title: "어댑터는 세상을 계약으로 번역합니다"
    text: "한쪽 면으로는 HTTP나 SQL을 말하고, 다른 면으로는 오직 포트만 말합니다. 데이터베이스 어댑터를 메모리 어댑터로 갈아 끼워도 domain은 알아차리지 못합니다. 이 장면의 테스트가 데이터베이스 없이 진짜 domain을 전속력으로 돌리는 이유입니다. 갈아 끼울 수 있었다면 그것은 세부 사항이었던 것입니다. 어댑터는 모든 세부 사항이 가서 사는 곳입니다."
  - title: "같은 규칙, 다른 그림들입니다"
    text: "헥사고날은 육각형 위에 포트를 그리고, 클린 아키텍처는 엔터티를 가운데 둔 동심원을 그리고, 어니언은 심 둘레의 층을 그립니다. 셋 모두 같은 규칙입니다. 의존은 안쪽을 향하고, 가운데는 바깥 이름을 모릅니다. 팀이 좋아하는 그림을 고르고, 규칙을 지키고, 논쟁은 다른 곳에 쓰세요."
related:
  - label: Domain-Driven Design
    slug: domain-driven-design
  - label: Repository
    slug: repository
  - label: Anti-Corruption Layer
    slug: anti-corruption-layer
  - label: Adapter
    slug: adapter
  - label: Clean Architecture
    slug: clean-architecture
  - label: Onion Architecture
    slug: onion-architecture
  - label: Dependency Injection
    slug: dependency-injection
  - label: Facade
    slug: facade
  - label: Entity
    slug: entity
  - label: Value Object
    slug: value-object
references:
  - title: "Hexagonal architecture"
    url: https://alistair.cockburn.us/hexagonal-architecture/
  - title: "Common web application architectures"
    url: https://learn.microsoft.com/en-us/dotnet/architecture/modern-web-apps-azure/common-web-application-architectures
  - title: "Architectural principles"
    url: https://learn.microsoft.com/en-us/dotnet/architecture/modern-web-apps-azure/architectural-principles
---

## 언제 쓰나

- 도메인 로직을 인프라의 변덕에서 지켜 낼 값어치가 있을 때입니다. 가격 규칙, 자격 규칙, 정산 규칙처럼 지금 쓰는 웹 프레임워크가 생기기 전에도 참이었고 그것이 교체된 뒤에도 참일 문장들입니다. 시스템에서 흥미로운 부분이 종이에 적어 놓아도 여전히 흥미롭다면, 그 부분은 어떤 ORM 릴리스 노트도 닿지 못하는 곳에 살 자격이 있습니다.
- 아무것도 띄우지 않고 핵심을 테스트하고 싶을 때입니다. 포트에 가짜 어댑터를 꽂으면 진짜 규칙을 메서드 호출 속도로 검증하는 테스트가 됩니다. 데이터베이스도, HTTP 호스트도, 컨테이너도 필요 없습니다. 장면의 3단계가 바로 그 거래입니다. 같은 domain, 같은 소켓에 꽂힌 다른 물건, 그리고 몇 분의 일로 줄어든 응답 시간입니다.
- 한 애플리케이션이 여러 바깥을 동시에 마주할 때입니다. 같은 일을 해야 하는 HTTP 엔드포인트와 큐 컨슈머와 야간 스케줄러는 하나의 포트 위에 놓인 어댑터 셋이지, 서로 다른 버그를 하나씩 품은 로직 사본 셋이 아닙니다. 들어오는 길이 둘째로 늘어나는 순간 이 구조는 값을 합니다.
- 세부 사항 교체가 이미 로드맵에 있을 때입니다. 데이터베이스 마이그레이션, 결제 대행사 변경, 파일 공유에서 블롭 스토리지로의 이전 같은 일들입니다. 벤더 이름이 정확히 한 클래스에만 등장한다면 각각은 버틸 만한 일이고, 사백 곳에 등장한다면 각각은 재작성입니다. 포트는 마이그레이션이 잡히는 중이 아니라 잡히기 전에 그어 둡니다.
- **아닌 경우**는 CRUD만 얇게 하는 서비스입니다. 요청이 "이 필드들을 저 테이블에 쓰라"이고 도메인에 지킬 규칙이 없다면, 포트와 어댑터는 지켜 주는 것 하나 없이 홉과 인터페이스와 매핑만 더합니다. 통과만 하는 도메인이 얻는 것은 격식뿐입니다. 그럴 때는 프레임워크를 직접 쓰고, 지켜 낼 것이 있는 곳에 노력을 쓰는 편이 낫습니다.

## 주의점

- 이 규칙의 품질은 포트의 언어만큼입니다. `IQueryable<T>`를 돌려주거나 `DbContext`를 받거나 벤더의 예외 타입을 그대로 던지는 인터페이스는 인터페이스 옷을 입은 배선입니다. 바깥은 여전히 안쪽에 있고, 다만 타입 파라미터를 읽어야 발견될 뿐입니다. 포트는 스토리지 엔진 이름을 한 번도 들어 본 적 없는 사람이 읽어도 뜻이 통해야 합니다.
- 포트의 소유권은 안쪽에 둡니다. 인터페이스는 도메인 프로젝트에 선언하고 인프라 프로젝트에서 구현합니다. 그래야 화살표가 원하는 방향을 가리킵니다. 도메인 프로젝트가 인터페이스를 보려고 인프라 프로젝트를 참조한다면 방향은 이미 조용히 뒤집힌 것이고, 빌드는 아무 불평도 하지 않습니다.
- 어댑터는 얇게 유지합니다. 어댑터 안으로 스며든 판단 하나하나가 빠른 테스트의 사각지대가 됩니다. 빠른 테스트는 가짜를 상대로 돌기 때문입니다. 번역과 매핑, 재시도 정책, 커넥션 관리는 어댑터의 몫이지만 비즈니스 규칙은 아닙니다. 어댑터를 단위 테스트하고 싶어지는 순간이 바로 그 신호입니다.
- 계층을 계층 자체를 위해 늘리지 마세요. 가치는 의존의 방향에 있지 고리의 개수에 있지 않습니다. 규칙 하나가 분명한 프로젝트 넷이 아무도 다시 말하지 못하는 규칙을 가진 프로젝트 아홉보다 낫고, 호출을 그냥 넘기기만 하는 계층은 누군가 급해지는 첫 순간에 건너뛰어집니다.
- 경계마다 붙는 매핑이 눈에 보이는 비용입니다. 요청 모델에서 커맨드로, 커맨드에서 도메인 객체로, 도메인 객체에서 영속 모델로, 그리고 다시 되돌리는 코드는 데이터베이스에 직접 붙는 설계라면 없었을 진짜 코드입니다. 보호가 실재하는 곳에서는 그 값을 치르고, 그렇지 않은 곳에서는 거절합니다. CRUD 서비스가 이 구조를 채택하면 안 되는 정직한 이유가 여기에 있습니다.
- 컴포지션 루트는 모든 화살표가 마침내 만나는 자리이고, 전부를 알아도 되는 유일한 곳입니다. 작게 유지하고 가장 바깥 프로젝트에 두며, 핵심 안쪽에서 서비스 로케이터에 손을 뻗고 싶은 유혹은 물리치세요. 컨테이너에 물건을 달라고 할 수 있는 안쪽은 다시 바깥 의존을 가진 것이고, 그것도 눈에 보이지 않는 형태로 가진 것입니다.

## .NET에서는

이 구조는 다른 무엇보다 먼저 프로젝트 참조로 강제됩니다. 프로젝트 셋과 규칙 하나입니다. 화살표는 안쪽을 향하고, 도메인은 프로젝트 참조를 하나도 갖지 않습니다.

```
Shop.Domain           <- 참조 없음. 엔터티, 값 객체, 그리고 포트들
Shop.Infrastructure   -> Shop.Domain          (EF Core, HTTP 클라이언트, 어댑터)
Shop.Web              -> Shop.Domain, Shop.Infrastructure   (컴포지션 루트)
```

포트는 도메인 안에 살고 도메인의 언어로 적힙니다. 도메인이 무엇을 필요로 하는지를 말할 뿐, 그것을 누가 어떻게 제공하는지는 말하지 않습니다.

```csharp
namespace Shop.Domain;

// 포트. 테이블이 아니라 Order를 이름으로 부르고, 호출자가 스토리지 엔진을
// 알아야만 잡을 수 있는 예외는 하나도 던지지 않는다.
public interface IOrderStore
{
    Task<Order?> FindAsync(OrderId id, CancellationToken ct);
    Task SaveAsync(Order order, CancellationToken ct);
}

public sealed class PlaceOrder(IOrderStore orders, IClock clock)
{
    public async Task<OrderId> HandleAsync(PlaceOrderCommand command, CancellationToken ct)
    {
        var order = Order.Place(command.CustomerId, command.Lines, clock.UtcNow);
        await orders.SaveAsync(order, ct);
        return order.Id;
    }
}
```

EF Core 어댑터는 같은 인터페이스 뒤에 스토리지 엔진을 둔 것입니다. 솔루션 전체에서 테이블의 존재를 아는 유일한 파일입니다.

```csharp
namespace Shop.Infrastructure;

internal sealed class EfOrderStore(ShopDbContext db) : IOrderStore
{
    public async Task<Order?> FindAsync(OrderId id, CancellationToken ct) =>
        await db.Orders.Include(o => o.Lines).FirstOrDefaultAsync(o => o.Id == id, ct);

    public async Task SaveAsync(Order order, CancellationToken ct)
    {
        if (db.Entry(order).State == EntityState.Detached) db.Orders.Add(order);
        await db.SaveChangesAsync(ct);       // SQL이 발화되는 유일한 자리
    }
}
```

메모리 어댑터는 같은 인터페이스 뒤에 딕셔너리를 둔 것이고, 인프라 없이 핵심을 테스트할 수 있게 해 주는 물건입니다. 장면의 3단계가 수행하는 교체가 바로 이것입니다.

```csharp
public sealed class InMemoryOrderStore : IOrderStore
{
    private readonly Dictionary<OrderId, Order> _saved = new();

    public Task<Order?> FindAsync(OrderId id, CancellationToken ct) =>
        Task.FromResult(_saved.GetValueOrDefault(id));

    public Task SaveAsync(Order order, CancellationToken ct)
    {
        _saved[order.Id] = order;
        return Task.CompletedTask;
    }
}
```

컴포지션 루트는 양쪽 이름을 함께 부르는 유일한 곳입니다. 그 위의 모든 코드는 인터페이스를 상대로 쓰였고, 그 인터페이스에 마침내 몸이 주어지는 자리가 여기입니다.

```csharp
// Shop.Web의 Program.cs
builder.Services.AddDbContext<ShopDbContext>(o => o.UseNpgsql(connectionString));
builder.Services.AddScoped<IOrderStore, EfOrderStore>();   // 구동되는 쪽 어댑터
builder.Services.AddSingleton<IClock, SystemClock>();
builder.Services.AddScoped<PlaceOrder>();

// 구동하는 쪽 어댑터. HTTP를 받아 포트를 호출하고, 그 외에는 아무것도 하지 않는다.
app.MapPost("/orders", async (PlaceOrderRequest body, PlaceOrder handler, CancellationToken ct) =>
{
    var id = await handler.HandleAsync(body.ToCommand(), ct);
    return Results.Created($"/orders/{id.Value}", new { id = id.Value });
});
```

테스트는 두 가지 크기로 나뉘고, 수백 개를 쓰게 되는 쪽은 싼 크기입니다. 핵심 테스트는 진짜 핸들러를 포트를 통해 구동하고 그 뒤에 가짜 어댑터를 두며, 나머지는 아무것도 건드리지 않습니다.

```csharp
[Fact]
public async Task placing_an_order_stores_it()
{
    var store = new InMemoryOrderStore();
    var id = await new PlaceOrder(store, new FixedClock(...)).HandleAsync(command, default);

    Assert.NotNull(await store.FindAsync(id, default));
}
```

다른 크기는 `WebApplicationFactory`로 진짜 호스트를 띄우고 테스트에 두고 싶지 않은 어댑터만 갈아 끼웁니다. 이것이 되는 이유는 어댑터 교체가 도메인이 볼 수 있는 무언가의 변경이 아니라 등록 한 줄의 변경이기 때문입니다.

```csharp
public sealed class Harness : WebApplicationFactory<Program>
{
    protected override void ConfigureWebHost(IWebHostBuilder builder) =>
        builder.ConfigureServices(services =>
        {
            services.RemoveAll<IOrderStore>();
            services.AddSingleton<IOrderStore, InMemoryOrderStore>();
        });
}
```

그 마지막 교체가 한 줄이면 방향이 맞은 것입니다. 그것이 오전 내내 얽힌 것을 푸는 일이 된다면, 안쪽 어딘가가 결코 알아서는 안 될 이름을 쥐고 있는 것입니다.
