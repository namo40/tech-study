---
title: "Entity"
summary: "속성이 아니라 신원으로 같음이 정의되는 도메인 객체입니다. id가 같은 두 엔티티는 한 존재의 두 시점이고, 속성은 오늘의 상태일 뿐입니다."
category: ".NET 데이터 접근"
scene: repository
sceneStep: 3
related:
  - label: Repository
    slug: repository
  - label: Value Object
    slug: value-object
  - label: Aggregate Root
    slug: aggregate-root
  - label: Aggregate
    slug: aggregate
  - label: Domain-Driven Design
    slug: domain-driven-design
  - label: Bounded Context
    slug: bounded-context
  - label: Unit of Work
    slug: unit-of-work
  - label: Change Tracking
    slug: change-tracking
  - label: Concurrency Token
    slug: concurrency-token
references:
  - title: "Creating and configuring a model in EF Core"
    url: https://learn.microsoft.com/en-us/ef/core/modeling/
  - title: "Change tracking in EF Core"
    url: https://learn.microsoft.com/en-us/ef/core/change-tracking/
  - title: "Design the infrastructure persistence layer"
    url: https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/infrastructure-persistence-layer-design
---

장면의 3단계는 카드 두 장을 판에 올려 놓고 이 둘이 같은 것이냐고 묻습니다. 둘 다 id 7이고 필드는 눈에 띄게 다른데, 판정은 `same`입니다. 이어서 필드가 똑같고 id만 다른 두 장이 올라가고, 판정은 `not same`입니다. 이것이 정의의 전부입니다. 굳이 또박또박 적는 이유는, 대부분의 코드베이스에서 기본값이 정반대이기 때문입니다. 보통 객체는 안에 무엇이 들었는지를 보고 비교합니다.

엔티티는 생애가 있는 존재입니다. 만들어졌고, 바뀌었고, 또 바뀔 텐데, 그 모든 과정을 거쳐도 자기 자신으로 남습니다. 이사한 고객은 같은 고객입니다. 라인이 하나 늘고 하나 줄고 할인이 붙은 주문도 같은 주문입니다. 어느 순간의 내용물도 그것을 그 주문으로 만들어 주지 않습니다. 그것을 그 주문으로 만드는 것은 그 id 아래 철해져 있다는 사실입니다. 두 객체를 필드로 비교하면 할인 전 주문과 할인 후 주문이 서로 다른 주문이라고 말하게 되는데, 이는 불편한 정도가 아니라 도메인에 대해 틀린 말입니다.

이 하나의 결정이 repository를 가능하게 합니다. `FindAsync(id)`는 신원이 물어볼 수 있는 대상이고 그 답이 안정적일 때에만 뜻이 통하고, 추적은 저장소가 지금 돌려받은 객체가 자기가 준 그 객체임을 알아볼 수 있을 때에만 뜻이 통합니다. EF Core는 정확히 이 위에 서 있습니다. 변경 추적기는 엔티티 타입과 기본 키로 키를 잡은 지도이므로, 한 컨텍스트 안에서 같은 id를 두 번 물으면 서로 어긋나는 객체 두 개가 아니라 같은 인스턴스가 돌아옵니다. `Update`를 쓸 때도 공급자는 객체 그래프를 값으로 비교하지 않습니다. 키로 찾아내고, 보관해 둔 스냅숏과 현재 값을 견주어, 움직인 칼럼만 씁니다.

.NET에서는 한 번만 적어 두고 `Equals` 쓰기를 그만둡니다. 타입과 id를 비교하는 작은 기반 클래스 하나면 모든 엔티티가 옳게 동작하고, 그 동작이 `Contains`에도, `Distinct`에도, `HashSet`에도, 모든 테스트 단언에도 한꺼번에 적용됩니다. 대안처럼 보이는 구조적 동등성을 가진 `record`는 여기서는 정확히 틀린 도구입니다. record로 만든 엔티티는 오늘 이름이 같다는 이유로 서로 다른 두 고객을 같다고 하고, 주소가 바뀐 뒤의 같은 고객을 다르다고 합니다. record는 한 쪽 너머의 값 객체에 쓰기 좋은 도구입니다.

```csharp
public abstract class Entity<TId> where TId : notnull
{
    public TId Id { get; protected set; } = default!;

    public override bool Equals(object? other) =>
        other is Entity<TId> e && e.GetType() == GetType() && Id.Equals(e.Id);

    public override int GetHashCode() => Id.GetHashCode();
}
```

두 가지는 제대로 짚어야 합니다. 첫째, id뿐 아니라 런타임 타입도 비교해야 합니다. 그러지 않으면 id 7인 `Customer`와 id 7인 `Order`가 같아집니다. 둘째, 아직 저장되지 않은 엔티티가 무엇인지 정해야 합니다. id를 데이터베이스가 만들어 준다면 갓 만든 두 객체가 모두 기본값 id를 들고 있어 서로 같다고 나오고, 그 둘을 집합에 넣는 순간 진짜 버그가 됩니다. 깔끔한 답은 id를 도메인에서 만드는 것입니다. `Guid`를 쓰거나 그것을 감싼 `OrderId` 같은 타입을 쓰면, 객체는 존재하는 순간부터 신원을 갖고 특별 취급이 필요 없어집니다.

동시성을 말할 수 있게 해 주는 것도 신원입니다. id로 행을 찾고 버전을 견주어 그사이 다른 누군가가 움직였는지 판단하는데, 안정된 신원이 없으면 버전을 견줄 행 자체가 없습니다. 애그리거트 경계를 넘는 모든 참조도 마찬가지입니다. 그런 참조는 객체가 아니라 id를 들고 있고, 그것이 통하는 이유는 id가 엔티티에 관해 바뀌지 않는다고 보장된 유일한 것이기 때문입니다.
