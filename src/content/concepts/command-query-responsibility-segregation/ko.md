---
title: "CQRS"
summary: "CQRS는 데이터를 바꾸는 모델과 데이터에 관한 질문에 답하는 모델을 나눕니다. Command는 규칙을 거치고, Query는 화면에 맞춰 만들어 둔 모양을 읽습니다. 저장소까지 나누는 것은 읽기와 쓰기의 확장이 정말로 갈라져야 할 때이며, 그때는 지연도 함께 받아들여야 합니다."
category: "애플리케이션 아키텍처"
scene: command-query-responsibility-segregation
steps:
  - title: "모델 하나로 전부"
    text: "규칙을 지켜야 하는 쓰기와 JOIN 세 번이 필요한 읽기가 같은 코드 경로와 같은 데이터베이스를 씁니다. 느린 읽기가 1초 넘게 계층을 붙잡고 있어서, command 두 개는 꽉 찬 박스 밖에 서 있다가 늦게 돌아옵니다."
  - title: "데이터는 아직, 코드부터 나눕니다"
    text: "Command는 규칙을 실행하고 성공 여부만 돌려줍니다. Query는 화면에 맞춰 둔 행을 뷰에서 읽어 그대로 돌려줍니다. 데이터베이스는 여전히 하나지만 어느 쪽도 상대를 기다리지 않고, 두 미터 모두 낮게 유지됩니다."
  - title: "저장소를 나눕니다"
    text: "쓰기는 한 저장소에 닿고, projection이 변경마다 조회용 read store에 복사합니다. 이제 읽기는 따로 확장됩니다. projection보다 먼저 도착한 읽기는 아직 옛 행을 보게 되는데, 맞는 답인 척하지 않고 stale로 표시됩니다."
  - title: "read model은 버려도 됩니다"
    text: "모양을 바꾸고, 쓰기 쪽에서 다시 만들고, query를 거기에 다시 붙이면 됩니다. 비어 있는 동안 query는 write store를 거치는 느린 길로 돌아갑니다. CQRS에 Event Sourcing이 꼭 필요한 것은 아니며, 읽기와 쓰기가 정말 다를 때만 나눕니다."
related:
  - label: Read Model
    slug: read-model
  - label: Projection
    slug: projection
  - label: Event Sourcing
    slug: event-sourcing
  - label: Domain-Driven Design
    slug: domain-driven-design
  - label: Aggregate
    slug: aggregate
  - label: Eventual Consistency
    slug: eventual-consistency
  - label: Materialized View
    slug: materialized-view
  - label: Transactional Outbox
    slug: transactional-outbox
  - label: Vertical Slice Architecture
    slug: vertical-slice-architecture
references:
  - title: CQRS pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/cqrs
  - title: Event Sourcing pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/event-sourcing
  - title: Apply simplified CQRS and DDD patterns in a microservice
    url: https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/apply-simplified-microservice-cqrs-ddd-patterns
---

## 언제 쓰나

- 읽기와 쓰기의 모양이 다를 때입니다. 쓰기 쪽에는 도메인 규칙이 촘촘하게 들어가고, 읽기 쪽에는 화면 모양 그대로의 납작한 행만 있으면 됩니다.
- 읽기가 쓰기보다 훨씬 많거나, 쓰기 모델이 짊어지면 안 되는 인덱스와 비정규화가 읽기 쪽에 필요할 때입니다.
- 쓰기보다 projection이 걸리는 시간만큼 뒤처진 읽기를 감당할 수 있을 때입니다.

## 주의점

- 데이터베이스 하나 위에서 핸들러만 나누는 것으로 시작합니다. 그것만으로도 얻을 수 있는 명확함이 대부분이고, 일관성 면에서 잃는 것은 없습니다. 저장소는 읽기가 따로 확장되어야 한다고 측정 결과가 말할 때만 나눕니다.
- 저장소를 나누면 최종 일관성(eventual consistency)이 따라옵니다. 화면을 거기에 맞춰 설계해야 합니다. Command 자신이 만들어 낸 결과를 보여 주거나, 새 값을 폴링하거나, 구독하면 됩니다. 쓰기 직후에 조회 쪽을 읽고 그 답을 확정된 값으로 취급하는 것만은 하지 말아야 합니다.
- Projection에는 모니터링과 재구축 경로가 필요합니다. 읽기 쪽이 따라오고 있는지 알려 주는 지표가 지연(lag)이고, 버리고 다시 만들 수 없는 read model은 자산이 아니라 부담입니다.
- Projection 핸들러는 같은 변경을 두 번 이상 보게 됩니다. 갱신하는 행을 키로 삼아 두 번 적용해도 안전하게 만들어 두면, 재생은 아무 일도 일어나지 않는 호출이 되고 값이 두 번 더해지는 일도 없습니다.
- CQRS와 Event Sourcing은 서로 독립적입니다. 어느 한쪽만으로도 동작하며, 앞의 것을 골랐으니 뒤의 것도 따라와야 한다고 생각하는 순간 작은 리팩터링이 전면 재작성으로 바뀝니다.

## .NET에서는

```csharp
public interface ICommandHandler<in TCommand> { Task HandleAsync(TCommand command, CancellationToken ct); }
public interface IQueryHandler<in TQuery, TResult> { Task<TResult> HandleAsync(TQuery query, CancellationToken ct); }

// Write side: rules, then persist. Returns nothing the screen needs.
public sealed class PlaceOrderHandler(ShopDbContext db) : ICommandHandler<PlaceOrder>
{
    public async Task HandleAsync(PlaceOrder command, CancellationToken ct)
    {
        var order = Order.Place(command.CustomerId, command.Lines);   // domain rules live here
        db.Orders.Add(order);
        await db.SaveChangesAsync(ct);
    }
}

// Read side: a flat row from a view or read table, no tracking, no domain objects.
public sealed class OrderSummaryHandler(ShopDbContext db) : IQueryHandler<GetOrderSummary, OrderSummary?>
{
    public Task<OrderSummary?> HandleAsync(GetOrderSummary query, CancellationToken ct) =>
        db.OrderSummaries.AsNoTracking()
          .Where(s => s.OrderId == query.OrderId)
          .Select(s => new OrderSummary(s.OrderId, s.CustomerName, s.Total, s.Status))
          .SingleOrDefaultAsync(ct);
}
```

핸들러 인터페이스 두 개와 `AsNoTracking()` 쿼리 하나가 첫 단계의 전부입니다. 쓰기 쪽은 변경 추적과 애그리게이트와 검증을 그대로 가져가고, 읽기 쪽은 도메인 객체를 아예 만들지 않습니다. 화면에 필요한 것 중에 도메인 객체인 것은 하나도 없기 때문입니다.

저장소를 나눈 뒤에는 `BackgroundService` 프로젝터가 outbox나 이벤트 스트림을 읽어 read store를 갱신합니다. 방금 적용한 변경이 얼마나 오래된 것인지를 메트릭으로 내보내게 하면 지연이 짐작이 아니라 경보를 걸 수 있는 숫자가 되고, 처음부터 다시 재생하는 명령을 함께 만들어 두면 read model의 모양을 바꾸는 일이 마이그레이션이 아니라 배포가 됩니다.
