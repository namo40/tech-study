---
title: "Domain-Driven Design"
summary: "도메인 주도 설계는 언어가 달라지는 곳에 국경을 긋습니다. bounded context 안에서 한 단어는 한 가지를 뜻하고, aggregate root가 문 앞에서 불변식을 지키며, 컨텍스트끼리는 모델을 공유하지 않고 번역으로 대화합니다."
category: "애플리케이션 아키텍처"
scene: domain-driven-design
steps:
  - title: "모두가 공유하는 모델은 누구의 것도 아닌 모델입니다"
    text: "고스트는 판매와 배송을 한꺼번에 섬길 때까지 필드 하나씩 자라난 Order 객체 하나를 보여 줍니다. 모든 변경이 협상입니다. DDD는 고백에서 시작합니다. 비즈니스에는 모델이 하나가 아닙니다. 언어가 달라지는 곳에 국경을 긋습니다."
  - title: "bounded context 안에서 한 단어는 한 가지를 뜻합니다"
    text: "Sales의 Order는 가격과 합계를 알고, Shipping의 Order는 주소와 품목 수를 압니다. 같은 단어, 두 모델이고, 둘 다 작고 둘 다 옳습니다. 각자가 자기 컨텍스트가 던지는 질문으로 정의되기 때문입니다. 국경은 의미에 대한 약속입니다."
  - title: "aggregate root는 일관성을 지키는 국경의 문지기입니다"
    text: "주문 라인은 Order를 통해서만 바뀝니다. 루트가 변경마다 불변식(합계가 맞아야 한다)을 검사하므로, 어떤 쓰기도 몰래 지나가 그것을 깰 수 없습니다. 바깥의 참조는 라인이 아니라 루트의 id만 쥡니다. 문 하나, 경비 하나, 언제나 참인 규칙 하나입니다."
  - title: "컨텍스트는 공유가 아니라 번역으로 대화합니다"
    text: "Sales는 자기 언어로 이벤트를 발행하고, Shipping은 그것을 듣고 자기 Order를 새로 짓습니다. 어느 쪽도 상대의 클래스를 가져오지 않으니 각 모델은 바뀔 자유를 지킵니다. 컨텍스트와 번역의 지도가 곧 아키텍처이고, 코드는 그 지도에 동의할 뿐입니다."
related:
  - label: Bounded Context
    slug: bounded-context
  - label: Aggregate Root
    slug: aggregate-root
  - label: Aggregate
    slug: aggregate
  - label: Anti-Corruption Layer
    slug: anti-corruption-layer
  - label: Event Sourcing
    slug: event-sourcing
  - label: CQRS
    slug: command-query-responsibility-segregation
  - label: Repository
    slug: repository
  - label: Entity
    slug: entity
  - label: Value Object
    slug: value-object
  - label: Hexagonal Architecture
    slug: hexagonal-architecture
  - label: Unit of Work
    slug: unit-of-work
  - label: Saga
    slug: saga
  - label: Transactional Outbox
    slug: transactional-outbox
references:
  - title: "Domain-Driven Design Reference"
    url: https://www.domainlanguage.com/ddd/reference/
  - title: "Design a DDD-oriented microservice"
    url: https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/ddd-oriented-microservice
  - title: "Using domain analysis to model microservices"
    url: https://learn.microsoft.com/en-us/azure/architecture/microservices/model/domain-analysis
  - title: "Designing a microservice domain model"
    url: https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/microservice-domain-model
---

## 언제 쓰나

- 도메인에 진짜 비즈니스 복잡도가 있고 언어를 두고 다툼이 있을 때 씁니다. 커머스, 물류, 청구, 보험, 의료처럼 "주문", "고객", "계정"이 부서마다 눈에 띄게 다른 것을 뜻하고, 그 차이를 잘못 잡으면 취향이 아니라 돈이 걸리는 곳입니다. 회의에서 두 사람이 한 단어의 뜻을 놓고 10분을 다툴 수 있다면, 그 단어는 아직 긋지 않은 국경입니다.
- 여러 팀이 시스템을 각자 발전시켜야 할 때 씁니다. 컨텍스트 경계는 팀 경계가 되고, 그다음에 서비스 경계가 됩니다. 순서가 반대가 되면 잘 되지 않습니다. 컨텍스트를 소유한 팀은 그 모델과 스키마와 배포 주기를 함께 소유하고, 팀을 가로지르는 마이그레이션 없이 셋 다 바꿀 수 있습니다. 바깥의 누구도 그 팀의 클래스를 쥐고 있지 않기 때문입니다.
- "공유 모델에 필드 하나만 더 넣자"가 기본 동작이 되었을 때 씁니다. 그 문장은 아무의 것도 아닌 모델이 내는 소리입니다. 한 부서를 위해 더한 필드는 나머지 네 부서가 무시하거나 잘못 채우거나 방어해야 하는 필드이고, 객체는 그것이 무엇을 위한 것인지 아무도 한마디로 말할 수 없을 때까지 자랍니다. 장면의 1단계가 바로 그 객체입니다.
- 규칙이 흥미롭고 지킬 가치가 있을 때 씁니다. 도메인에서 재미있는 문장이 "합계는 라인의 합과 같아야 한다"나 "결제가 확정되기 전에는 출하할 수 없다" 같은 모양이라면, 그것이 불변식이고 불변식에는 주인이 필요합니다. 그 주인이 aggregate root이며, 문 하나를 만들어 주는 일은 얻을 수 있는 가장 값싼 정확성입니다.
- 테이블 위의 CRUD에는 **쓰지 않습니다**. 폼 생성기, 관리 화면, 참조 데이터 편집기에는 다툴 언어도, 이름 붙일 불변식도 없습니다. DDD의 비용은 실재합니다. 모델링 대화, 번역 계층, 참조에 대한 규율이 모두 비용이고, 지킬 것이 없는 시스템은 그 비용만 다 치르고 돌려받는 것이 없습니다.

## 주의점

- bounded context는 배포가 아니라 언어에 관한 것입니다. 서로의 테이블을 건드리지 않는 두 컨텍스트를 가진 modular monolith는 경계를 지키고, `Entities.dll` 하나를 함께 쓰는 마이크로서비스 무리는 현대적으로 보이면서 경계를 어깁니다. 질문은 "서비스가 몇 개인가"가 아니라 "모델이 몇 개이고 각각의 주인이 누구인가"입니다. 배포 구조는 지도를 따라 나중에 정하면 되고, 따라가지 않는 편이 나은 경우도 많습니다.
- 공유된 정본 모델은 DDD가 없애려고 존재하는 안티패턴입니다. 진실은 하나, 중복은 없음, 고칠 곳도 한 곳이라는 좋은 의도로 제안되지만 결과는 정반대입니다. 모든 팀이 합의해야 하고 아무도 단순하게 만들 수 없는 스키마가 생기고, 그 앞에 변경 대기열이 늘어섭니다. 번역을 사이에 둔 두 모델이 주인 다섯인 한 모델보다 쌉니다. 사람들이 두려워하는 중복은 결함이 아니라 독립성의 대가입니다.
- Aggregate는 객체 그래프가 아니라 일관성 경계입니다. 규칙 하나가 예 또는 아니오를 말하기 위해 읽어야 하는 데이터만 정확히 감싸고 그 이상은 넘어가지 않습니다. 규칙이 주문의 합계에 관한 것이라면 자기 라인을 소유하는 `Order`가 맞고, 고객과 그 주소록과 적립금까지 소유하는 `Order`는 누가 무엇을 사든 고객에 잠금을 겁니다. 다른 aggregate는 id로 참조하고, 그들 사이의 일관성은 조금 뒤에 도착한다는 것을 받아들입니다.
- 불변식이 없으면 aggregate도 없습니다. 트랜잭션이 끝날 때마다 엔티티 묶음을 가로질러 참이어야 하는 것이 없다면, 그 묶음은 aggregate가 아니고 루트는 형식적인 절차일 뿐입니다. 경계를 정의하는 것은 불변식 목록입니다. 목록을 적어 내려갈 수 없다면 아직 경계를 찾은 것이 아니라 폴더를 하나 찾은 것입니다.
- 다른 팀의 모델이 들어오는 경계마다 번역 계층을 둡니다. anti-corruption layer는 그들의 모양을 우리 모양으로 바꾸는 작고 지루하고 전혀 멋있지 않은 클래스이지만, 우리 모델과 남의 릴리스 일정 사이에 서 있는 유일한 것입니다. 이것을 건너뛰면 남의 모델이 조용히 우리 모델이 됩니다.
- 보편 언어(ubiquitous language)는 관리하지 않으면 죽습니다. 용어집은 문서가 아니라 코드 리뷰 자료입니다. 도메인 전문가가 "탁송"이라고 말하는데 클래스가 `Shipment`라면 둘 중 하나가 틀린 것이고, 값싸게 알아낼 수 있는 순간은 지금입니다. 아무도 고쳐 주지 않는 언어는 1년 안에 네 개의 사적인 방언으로 되돌아가고, 그 언어에서 그은 국경도 더는 무엇과도 맞지 않게 됩니다.

## .NET에서는

Aggregate는 평범한 클래스입니다. 기반 클래스도, 프레임워크도, 특성도 없습니다. 바깥에서 대입하지 못하도록 setter를 private으로 두고, 바깥에서 추가하지 못하도록 컬렉션을 private으로 두고, 안으로 들어오는 유일한 통로인 행위 메서드를 둡니다.

```csharp
public class Order
{
    private const int MaxLines = 500;
    private readonly List<OrderLine> _lines = new();

    public Guid Id { get; private set; } = Guid.NewGuid();
    public Guid CustomerId { get; private set; }          // Customer가 아니라 id
    public OrderStatus Status { get; private set; } = OrderStatus.Draft;
    public decimal Total { get; private set; }
    public Address ShipTo { get; private set; } = null!;  // 값 객체. 생성 시 정해진다
    public IReadOnlyCollection<OrderLine> Lines => _lines;

    // 문은 하나. 불변식이 의존하는 것이 모두 이 클래스 안에 있으므로,
    // 라인에 직접 써서 검사를 건너뛸 수는 없다.
    public void AddLine(string sku, int quantity, decimal price)
    {
        if (quantity <= 0) throw new DomainException("a line needs a quantity");
        _lines.Add(new OrderLine(sku, quantity, price));
        Total = _lines.Sum(l => l.Quantity * l.Price);
        CheckInvariants();
    }

    // 변경이 끝날 때마다 성립해야 하는 규칙을 한곳에 둔다.
    private void CheckInvariants()
    {
        if (Status != OrderStatus.Draft)
            throw new DomainException("a placed order cannot change its lines");
        if (_lines.Count > MaxLines)
            throw new DomainException($"an order may not have more than {MaxLines} lines");
    }
}
```

`order.Lines.Add(...)`가 아니라 `order.AddLine(...)`이라는 한 줄에 설계 전체가 들어 있습니다. 뒤쪽 표기는 문지기를 우회한 쓰기이고, `Lines`가 private 리스트 위의 `IReadOnlyCollection`이므로 타입 시스템이 그것을 거절합니다.

EF Core는 이 모양을 새어 나가게 하지 않고 저장합니다. 관례에 따라 private `_lines` 필드를 찾아내 프로퍼티를 거치지 않고 직접 읽고 쓰므로 아무 설정 없이도 컬렉션은 private으로 남고, 소유 타입 덕분에 값 객체는 자기 테이블 대신 부모 테이블의 컬럼이 됩니다.

```csharp
protected override void OnModelCreating(ModelBuilder model)
{
    model.Entity<Order>(order =>
    {
        order.OwnsMany(o => o.Lines);              // 라인은 스스로의 생명이 없다
        order.OwnsOne(o => o.ShipTo);              // 엔티티가 아니라 값 객체
        order.Property(o => o.Total).HasPrecision(18, 2);
    });
}
```

리포지토리는 테이블마다가 아니라 aggregate마다 두고, 루트를 돌려줍니다. `IOrderLineRepository`는 없습니다. 라인은 그것을 소유한 주문을 거치지 않고는 닿을 수 없기 때문입니다.

```csharp
public interface IOrderRepository
{
    Task<Order?> FindAsync(Guid id, CancellationToken ct);
    void Add(Order order);
    // Update는 없다. aggregate가 한 일은 unit of work가 커밋한다.
}
```

도메인 이벤트가 경계 너머로 번역을 실어 나릅니다. Aggregate는 이벤트를 기록해 두고, 트랜잭션이 커밋되기 전에는 아무것도 발행하지 않습니다. 그래서 구독자는 되돌려진 변경 소식을 듣지 않습니다.

```csharp
public class Order
{
    private readonly List<IDomainEvent> _events = new();
    public IReadOnlyCollection<IDomainEvent> Events => _events;

    public void Place()
    {
        Status = OrderStatus.Placed;
        _events.Add(new OrderPlaced(Id, CustomerId, _lines.Count));
    }

    public void ClearEvents() => _events.Clear();
}

// 컨텍스트마다 DbContext 하나, 이벤트는 커밋과 함께 나간다. `mediator`는
// 이 컨텍스트의 생성자로 주입된다.
public override async Task<int> SaveChangesAsync(CancellationToken ct = default)
{
    var roots = ChangeTracker.Entries<Order>().Select(e => e.Entity).ToList();
    var events = roots.SelectMany(r => r.Events).ToList();
    var saved = await base.SaveChangesAsync(ct);
    foreach (var e in events) await mediator.Publish(e, ct);   // 커밋 이후
    roots.ForEach(r => r.ClearEvents());                       // 비우지 않으면 다음 저장에서 다시 발행된다
    return saved;
}
```

커밋 뒤에 프로세스 안에서 발행하는 방식은 최대 한 번(at-most-once)입니다. 커밋과 발행 사이에 프로세스가 죽으면 이벤트는 그냥 사라집니다. 같은 배포물 안의 구독자라면 데이터에서 다시 만들 수 있으니 받아들일 만하고, 서비스 경계를 넘어야 하는 것은 변경과 같은 트랜잭션에 기록되는 transactional outbox를 거칩니다.

Shipping은 `OrderPlaced`를 구독하고, 자기가 신경 쓰는 필드만으로 자기 `Shipment`를 짓습니다. Sales 어셈블리를 참조하지도 않고 Sales의 클래스를 역직렬화하지도 않습니다. 이벤트는 이름과 기본 자료형으로 된 계약이고, 핸들러가 곧 번역입니다.

```csharp
public class OrderPlacedHandler : INotificationHandler<OrderPlaced>
{
    public Task Handle(OrderPlaced e, CancellationToken ct)
    {
        var shipment = Shipment.For(e.OrderId, e.LineCount);   // 우리 단어, 우리 모델
        return repository.AddAsync(shipment, ct);
    }
}
```

위의 `INotificationHandler<T>`와 `mediator.Publish`는 MediatR이고, 라이선스가 바뀌었기 때문에 이름을 적어 둘 만합니다. 13.0 이후 버전은 상용이며 소규모 조직에는 무료 커뮤니티 티어가 있고, 그 이전 버전은 원래의 오픈 소스 라이선스로 남아 있습니다. 의존성을 들이기 전에 어느 쪽에 해당하는지 확인하거나, 컴포지션 루트의 몇 줄로 직접 만든 `IDomainEventHandler<T>`에 디스패치해서 패키지 없이 개념만 가져가면 됩니다.

bounded context마다 `DbContext` 하나, 어셈블리 하나를 두고, 공유 `Entities` 프로젝트는 두지 않습니다. 두 컨텍스트가 언젠가 두 서비스가 될 때 달라지는 것은 이벤트가 한쪽에서 다른 쪽으로 건너가는 방법뿐입니다. 국경을 먼저 그어 둔 이유가 여기에 있습니다.
