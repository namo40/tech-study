---
title: "Value Object"
summary: "내용으로 같음이 정의되는 불변 객체입니다. id도 이력도 repository도 없습니다. 고치는 대신 새 값으로 교체하고, 그것을 실어 나르는 엔티티의 칼럼으로 저장됩니다."
category: ".NET 데이터 접근"
scene: repository
sceneStep: 4
related:
  - label: Repository
    slug: repository
  - label: Entity
    slug: entity
  - label: Aggregate
    slug: aggregate
  - label: Aggregate Root
    slug: aggregate-root
  - label: Domain-Driven Design
    slug: domain-driven-design
  - label: Bounded Context
    slug: bounded-context
  - label: Unit of Work
    slug: unit-of-work
  - label: Change Tracking
    slug: change-tracking
references:
  - title: "Implement value objects"
    url: https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/implement-value-objects
  - title: "Complex types in EF Core"
    url: https://learn.microsoft.com/en-us/ef/core/modeling/complex-types
  - title: "Owned entity types in EF Core"
    url: https://learn.microsoft.com/en-us/ef/core/modeling/owned-entities
  - title: "Value conversions in EF Core"
    url: https://learn.microsoft.com/en-us/ef/core/modeling/value-conversions
---

장면의 4단계는 `10 USD` 칩 두 개를 판에 올리고 `same` 판정을 냅니다. 이어서 누군가 하나를 고치려 하는데, 칩이 수정되는 대신 버려지고 그 자리에 여전히 `10 USD`를 든 새 칩이 나타나며, 판정은 그대로 `same`입니다. 이 두 비트가 정의의 전부입니다. 같음은 내용이고, 변경은 교체입니다.

차이를 체감하는 가장 쉬운 길은 반대쪽이 왜 이상한지 물어보는 것입니다. 10달러 두 개는 "우연히 같은 값을 가진 서로 다른 10달러 둘"이 아닙니다. 어느 쪽이 어느 쪽인지에 대한 사실 자체가 없습니다. 값에는 그것이 무엇인지 말고는 아무것도 없기 때문입니다. 특정한 10달러의 이력을 묻는 것은 범주 착오이지만, 특정한 고객의 이력을 묻는 것은 그렇지 않습니다. 값 객체에 id가 없는 이유가 이것입니다. id가 가리킬 대상이 애초에 없습니다.

나머지는 전부 여기서 따라 나옵니다. 값이 내용 그 자체라면, 내용을 바꾸는 순간 다른 값이 되므로 제자리에서 바꾸면 안 됩니다. 수정처럼 보이는 연산은 대신 새 인스턴스를 돌려줍니다. 이 불변성은 안전을 위해 얹은 규율이 아니라 개념이 이미 뜻하던 바이고, 안전은 그 부산물입니다. 값은 두 애그리거트가 나눠 가져도 되고, 필드에 담아도 되고, 사전의 키로 써도 되고, 스레드 경계를 넘겨도 아무도 신경 쓸 필요가 없습니다. 테스트도 같이 납작해집니다. 값을 받는 함수에는 준비도 정리도 없고, 단언은 그저 같은지 보는 일이 됩니다.

값 객체는 작은 것에 관한 도메인 규칙이 사는 자리이기도 합니다. `Money`, `EmailAddress`, `DateRange`, `PostalCode` 하나하나가 아무 코드나 엉뚱한 값을 넣을 수 있던 원시 타입을 대신하고, 각자 엉뚱한 값을 한 번만, 모두를 대신해 거절하는 생성자를 갖습니다. 실무에서는 대개 이쪽이 동등성 규칙보다 더 큰 이득입니다. 클래스 어딘가에 `decimal` 금액과 `string` 통화가 따로 놓여 있으면 언젠가 터질 덧셈 버그이고, `Money`는 그것을 불가능하게 만드는 자리입니다.

.NET에서는 `record`나 `readonly record struct`가 구조적 동등성과 알맞은 `GetHashCode`, 그리고 교체용 `with`를 줍니다. 키워드 하나에 계약 전체가 들어 있습니다.

```csharp
public readonly record struct Money(decimal Amount, string Currency)
{
    public static Money Of(decimal amount, string currency) =>
        currency.Length == 3 ? new(amount, currency.ToUpperInvariant())
                             : throw new ArgumentException("a currency is three letters");

    public Money Add(Money other) =>
        other.Currency == Currency
            ? this with { Amount = Amount + other.Amount }   // a new value, not a change
            : throw new InvalidOperationException("mixed currencies");
}
```

저장도 같은 규칙을 따릅니다. 신원이 없으니 값을 걸어 둘 자리가 없고, 그래서 그것을 실어 나르는 엔티티의 일부로 저장됩니다. `OwnsOne`은 소유자 테이블의 칼럼들로 넣어 주며, `Money` 테이블도 없고 그것만 따로 불러올 방법도 없습니다. "repository가 없다"를 모델링으로 옮기면 이 모습입니다.

```csharp
model.Entity<Order>(order =>
{
    order.OwnsOne(o => o.Total);      // Total_Amount, Total_Currency on Orders
    order.OwnsMany(o => o.Lines);     // lines have no life outside the order
});
```

값이 정말 칼럼 하나라면 소유 타입보다 값 변환이 가볍습니다. 도메인은 타입을 지키고 데이터베이스는 원시 값을 지킵니다.

```csharp
model.Entity<Customer>()
     .Property(c => c.Email)
     .HasConversion(email => email.Value, text => EmailAddress.Of(text));
```

두 가지는 챙겨 두면 좋습니다. 첫째, EF Core는 소유된 값을 소유자를 통해 추적하므로 새 인스턴스를 통째로 대입하는 것(`order.Total = order.Total.Add(line.Amount)`)이 곧 갱신입니다. 바꿀 것도 따로 저장할 것도 없습니다. 둘째, `record`는 값에는 옳고 엔티티에는 그릅니다. 두 페이지의 경계가 정확히 거기입니다. 엔티티에 구조적 동등성을 주면 오늘 이름이 같은 서로 다른 두 고객이 같은 고객이 되고, 이사한 뒤의 같은 고객은 남남이 됩니다.
