---
title: "Repository"
summary: "repository는 도메인에 컬렉션처럼 생긴 저장 출입문을 내줍니다. 도메인은 신원으로 엔티티를 달라고 말할 뿐 SQL은 보지 않고, 엔티티는 id로 같고 값 객체는 내용으로 같으며, 저장 기술은 가장자리에 사는 세부가 됩니다."
category: ".NET 데이터 접근"
scene: repository
steps:
  - title: "저장이 도메인으로 새는 것은 느린 침수입니다"
    text: "고스트는 서비스 안에 박히는 SQL 조각들을 보여 줍니다. 쿼리마다 복사되고, 사본마다 어긋나고, 데이터베이스 없이는 아무것도 테스트할 수 없습니다. repository는 문입니다. 도메인은 Find와 Add로만 말하고, 저장에 관한 모든 것은 그 문 뒤에 삽니다."
  - title: "repository는 컬렉션처럼 보이고 엔진을 숨깁니다"
    text: "도메인은 메모리 집합에 말하듯 Find와 Add를 부르고, 구현이 문 뒤에서 SQL로 번역합니다. 그 구현을 가짜로 바꿔도 도메인은 눈치채지 못합니다. 그것이 정확히 테스트의 이음새이고, 정확히 요점입니다."
  - title: "엔티티는 겉모습이 아니라 신원으로 같습니다"
    text: "두 카드가 모두 id 7이라면 필드가 달라도 한 존재의 두 시점입니다. 필드가 똑같아도 id가 다른 두 카드는 남남입니다. repository가 찾고 추적하고 갱신하는 기준이 신원이고, 속성은 오늘의 상태일 뿐입니다."
  - title: "값 객체는 내용으로 같고, 그것이 전부입니다"
    text: "10 USD 칩 두 개는 같은 돈입니다. id도 이력도 repository도 없습니다. 값 객체는 고치지 않고 새 칩으로 교체하는데, 내용이 같으면 같은 돈입니다. 공유해도 안전하고, 테스트는 사소합니다."
related:
  - label: Domain-Driven Design
    slug: domain-driven-design
  - label: Entity
    slug: entity
  - label: Value Object
    slug: value-object
  - label: Aggregate Root
    slug: aggregate-root
  - label: Aggregate
    slug: aggregate
  - label: Bounded Context
    slug: bounded-context
  - label: Unit of Work
    slug: unit-of-work
  - label: CQRS
    slug: command-query-responsibility-segregation
  - label: Hexagonal Architecture
    slug: hexagonal-architecture
  - label: N+1 Query
    slug: n-plus-1-query
  - label: Database Index
    slug: database-index
references:
  - title: "Design the infrastructure persistence layer"
    url: https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/infrastructure-persistence-layer-design
  - title: "Implement the infrastructure persistence layer with EF Core"
    url: https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/infrastructure-persistence-layer-implementation-entity-framework-core
  - title: "Testing EF Core applications"
    url: https://learn.microsoft.com/en-us/ef/core/testing/
---

## 언제 쓰나

- 도메인에 저장과 떼어 놓을 만한 행위가 있을 때입니다. 통째로 불러와 불변식을 검사하고 통째로 저장해야 하는 애그리거트가 바로 repository가 맡을 모양입니다. 객체를 건네주는 메서드 하나, 새 객체를 받는 메서드 하나면 되고, 도메인 안에는 둘 중 어느 쪽이 어디서 왔는지 아는 코드가 없습니다. 그러면 흥미로운 코드가 데이터베이스에 관한 문장이 아니라 업무에 관한 문장으로 읽힙니다.
- 테스트가 데이터베이스 없이 돌아야 할 때입니다. 이 하나만으로도 추상화 비용을 갚습니다. 도메인이 의존하는 것이 인터페이스라면 테스트 프로젝트의 사전 하나로도 만족시킬 수 있으니, "결제가 확정되기 전에는 주문을 배송할 수 없다" 같은 규칙에 1밀리초 만에 끝나고 딱 한 가지 이유로만 실패하는 테스트가 생깁니다. 그렇지 않으면 셋 중 어느 것과도 상관없는 사실을 확인하려고 서버와 스키마와 정리 단계가 필요한 테스트 묶음을 떠안습니다.
- 저장 기술이 바뀔 수 있거나 이미 하나가 아닐 때입니다. 읽기는 캐시에서, 쓰기는 SQL로, 검색 색인은 그 옆에 따로 두는 구성에서 문고리만 잡은 호출자는 셋 중 누가 답했는지 신경 쓰지 않습니다. 그중 하나를 갈아 끼우는 날 변경은 구현에서 멈춥니다. 도메인이 `DbContext`와 직접 말하는 시스템에서는 그 결정이 모든 호출 지점에 흩어져 있습니다.
- 여러 호출 지점이 같은 적재를 필요로 할 때입니다. 문 뒤에 한 번 쓴 `FindActiveByCustomer`는 include 구성이 정해진 쿼리 하나입니다. 같은 적재를 여섯 서비스에 풀어 쓰면 서로 어긋나는 쿼리 여섯 개가 되고, 그중 여섯 번째가 include를 빠뜨려 N+1이 됩니다.
- 모든 테이블에 필요하지는 **않습니다.** CRUD 화면에도 필요 없습니다. `DbSet<T>`는 이미 repository이고 `DbContext`는 이미 작업 단위입니다. 여섯 메서드를 여섯 `DbSet` 호출로 그대로 넘기는 `IProductRepository`로 감싸면 파일 하나 말고는 얻는 것이 없습니다. 화면이 테이블 위의 입력 양식이고 지킬 불변식도 없다면 컨텍스트에 쿼리하고 DTO로 프로젝션한 다음 넘어갑니다.

## 주의점

- EF Core의 `DbSet`이 곧 repository 패턴이고 `DbContext`가 곧 작업 단위입니다. 그러니 그 위에 얹는 repository는 도메인 쪽 이유로 스스로를 정당화해야 합니다. 강제하고 싶은 애그리거트 경계, 테스트가 끼어들 이음새, 한 번만 쓰고 싶은 쿼리 어휘 같은 것 말입니다. "책에서 그러라고 했다"는 이유가 되지 않고, 그대로 넘기기만 하는 껍데기가 이 패턴이 욕먹는 가장 흔한 경로입니다.
- `IQueryable`이 아니라 애그리거트를 돌려줍니다. 인터페이스 밖으로 나간 `IQueryable<Order>`는 호출자에게 문 열쇠를 쥐여 줍니다. 아무 필터나 조인이나 프로젝션을 붙일 수 있으니, repository는 무엇이 적재되는지도, 언제 실행되는지도, 커넥션이 아직 살아 있는지도 통제하지 못합니다. 호출자에게 정말 임의 쿼리가 필요하다면 그것은 별도의 읽기 경로를 만들라는 신호이지, 인터페이스를 더 헐겁게 만들라는 신호가 아닙니다.
- repository는 애그리거트 루트마다 하나이고 테이블마다 하나가 아닙니다. `IOrderLineRepository`는 없습니다. 라인은 자신을 소유한 주문 밖에서는 살지 못하기 때문입니다. 그런 것을 만들면, 루트를 한 번도 건드리지 않은 사람이 루트가 지키려던 불변식을 깰 수 있게 됩니다. 시스템 안 repository 개수는 적어야 하고, 한 단위로 일관성을 유지해야 하는 것들의 개수와 맞아야 합니다.
- 화면용 쿼리는 여기 있을 자리가 아닙니다. repository에 `GetOrderSummariesForDashboard`가 자라나는 순간, 그것은 도메인 컬렉션이기를 그만두고 화면 계층이 됩니다. 읽기 모델은 도메인을 통째로 건너뛰어도 됩니다. Dapper 쿼리나 추적 없는 프로젝션으로 DTO를 바로 만드는 쪽이 빠르고 단순하며, 보고서를 만들자고 애그리거트를 끌고 들어오지 않습니다.
- 끝까지 비동기로 가고 `CancellationToken`을 받습니다. repository는 입출력 경계이므로 그 위의 모든 메서드는 본성상 비동기입니다. 비동기 공급자 위에 동기 `Find`를 얹는 것은 스레드 풀 고갈 사고로 가는 가장 짧은 길이고, 그 사고는 데이터베이스 탓으로 돌아갑니다.
- 메모리 가짜 구현이 같은 신원 규칙을 지키지 않으면 테스트가 거짓말을 합니다. 실제 구현은 같은 id로 두 번째 `Find`를 하면 추적 중인 인스턴스를 돌려주는데 가짜는 새 사본을 돌려준다면, 통과한 테스트가 운영에 대해 증명하는 것은 없습니다. 가짜 안에 id로 키를 잡은 사전 하나를 두고 거기 있는 것을 그대로 돌려주면 됩니다.
- 모든 메서드 안에 `SaveChanges`를 넣지 않습니다. `Add`마다 커밋하는 repository는 트랜잭션 경계를 호출자에게서 조용히 빼앗은 것이고, 함께 성공해야 하는 두 쓰기가 더는 그럴 수 없게 됩니다. 컬렉션에 넣는 일과 작업 단위를 커밋하는 일은 서로 다른 결정이며, 두 번째 결정은 그 작업이 무엇이었는지 아는 쪽의 몫입니다.

## .NET에서는

인터페이스는 도메인 프로젝트에 둡니다. 그래야 의존 방향이 제대로 섭니다. 도메인이 필요한 것을 선언하고, 가장자리가 그것을 공급합니다.

```csharp
// 도메인 프로젝트입니다. 이 어셈블리 어디에도 EF Core 참조가 없습니다.
public interface IOrderRepository
{
    Task<Order?> FindAsync(OrderId id, CancellationToken ct);
    void Add(Order order);
    // Update도 Save도 없습니다. aggregate가 한 일은 unit of work가 커밋합니다.
}
```

EF Core 구현은 가장자리에 살면서 `DbContext`를 주입받고, 시스템 안에서 "SQL"이라는 단어를 아는 유일한 자리가 됩니다.

```csharp
public sealed class OrderRepository(ShopDbContext db) : IOrderRepository
{
    public Task<Order?> FindAsync(OrderId id, CancellationToken ct) =>
        db.Orders
          .Include(o => o.Lines)          // aggregate는 통째로 불러옵니다
          .SingleOrDefaultAsync(o => o.Id == id, ct);

    public void Add(Order order) => db.Orders.Add(order);
}
```

`DbSet`의 `FindAsync`는 알아 둘 만합니다. 데이터베이스로 가기 전에 변경 추적기를 먼저 확인하므로, 한 작업 단위 안에서 같은 id를 두 번 물으면 서로 어긋나는 객체 두 개가 아니라 같은 인스턴스를 받습니다. 그 동작이 곧 신원이 일하는 모습이고, 가짜 구현도 똑같이 해야 하는 이유입니다.

엔티티는 신원으로 같으므로 기반 클래스에 한 번 적어 두고 다시는 `Equals`를 쓰지 않습니다.

```csharp
public abstract class Entity<TId> where TId : notnull
{
    public TId Id { get; protected set; } = default!;

    public override bool Equals(object? other) =>
        other is Entity<TId> e && e.GetType() == GetType() && Id.Equals(e.Id);

    public override int GetHashCode() => Id.GetHashCode();
}
```

값 객체는 내용으로 같고 제자리에서 고쳐지지 않습니다. `record`가 둘 다 공짜로 줍니다. 구조적 동등성이 딸려 오고, `with`는 들고 있던 인스턴스를 바꾸는 대신 새 인스턴스를 돌려줍니다.

```csharp
public readonly record struct Money(decimal Amount, string Currency)
{
    public Money Add(Money other) =>
        other.Currency == Currency
            ? this with { Amount = Amount + other.Amount }   // 변경이 아니라 새 값입니다
            : throw new InvalidOperationException("mixed currencies");
}
```

EF Core는 `ComplexProperty`로 값 객체를 소유자 테이블의 컬럼들로 저장합니다. "신원도 없고 제 repository도 없다"를 모델링으로 옮긴 것과 같습니다. `Money` 테이블도 없고 그것만 따로 불러올 방법도 없습니다. `OwnsOne`은 같은 도구처럼 보이지만 아닙니다. 소유 타입은 여전히 엔티티라서 자기 키와 자기 추적 신원을 가지며, 참조 타입만 소유 타입이 될 수 있습니다.

```csharp
protected override void OnModelCreating(ModelBuilder model)
{
    model.Entity<Order>(order =>
    {
        order.HasKey(o => o.Id);
        order.ComplexProperty(o => o.Total);   // Orders의 Total_Amount, Total_Currency
        order.OwnsMany(o => o.Lines);          // 라인은 자기만의 생명이 없습니다
    });
}
```

작업 단위는 `DbContext`입니다. 그래서 커밋은 추가와 별개의 결정이고, 작업 전체가 한 트랜잭션에 담깁니다.

```csharp
public async Task<OrderId> PlaceAsync(Cart cart, CancellationToken ct)
{
    var order = Order.From(cart);         // 데이터베이스가 보이지 않는 곳에서 도메인이 정합니다
    orders.Add(order);
    await db.SaveChangesAsync(ct);        // 트랜잭션 하나, 커밋 하나
    return order.Id;
}
```

도메인 테스트를 빠르게 만드는 가짜 구현은 사전 하나입니다. 같은 id에 같은 인스턴스를 돌려준다는 점으로 제 몫을 합니다.

```csharp
public sealed class InMemoryOrderRepository : IOrderRepository
{
    private readonly Dictionary<OrderId, Order> _orders = new();

    public Task<Order?> FindAsync(OrderId id, CancellationToken ct) =>
        Task.FromResult(_orders.GetValueOrDefault(id));

    public void Add(Order order) => _orders[order.Id] = order;
}
```

읽기 쪽은 이 모두를 건너뜁니다. 대시보드에는 애그리거트가 필요 없으니 컨텍스트에 바로 쿼리해 화면이 원하는 모양으로 곧장 프로젝션합니다. 추적도, include도, 다시 납작하게 펴려고 만드는 도메인 객체도 없습니다.

```csharp
var summaries = await db.Orders
    .AsNoTracking()
    .Where(o => o.CustomerId == customerId)
    .Select(o => new OrderSummary(o.Id, o.PlacedAt, o.Total.Amount))
    .ToListAsync(ct);
```

그 갈라짐이 이 설계의 전부입니다. 규칙이 있는 쓰기에는 작고 심심한 인터페이스를, 규칙이 없는 읽기에는 직접 쿼리를 씁니다.
