---
title: "Unit of Work"
summary: "작업 단위는 함께 성공하거나 함께 실패해야 하는 변경 묶음입니다. 메모리에서 한 일을 모아 두었다가 트랜잭션 하나로 커밋하므로, 절반만 끝난 작업이 데이터베이스에 닿는 일이 없습니다."
category: ".NET 데이터 접근"
scene: change-tracking
sceneStep: 2
related:
  - label: Change Tracking
    slug: change-tracking
  - label: Local Transaction
    slug: local-transaction
  - label: Repository
    slug: repository
  - label: DbContext
    slug: dbcontext
  - label: Saga
    slug: saga
  - label: Compensating Transaction
    slug: compensating-transaction
references:
  - title: Saving data (EF Core)
    url: https://learn.microsoft.com/en-us/ef/core/saving/
  - title: Using transactions (EF Core)
    url: https://learn.microsoft.com/en-us/ef/core/saving/transactions
---

작업 단위는 데이터베이스가 계속 던지는 질문에 대한 답입니다. 이 변경들 중 어디까지가 한 묶음인가? 주문이 배송 상태로 넘어가고, 줄 하나가 추가되고, 다른 줄 하나가 지워지는 것은 문장 세 개지만, 그중 하나만 반영되고 나머지는 반영되지 않은 세상은 쓸모가 없습니다. 이 셋을 묶는 것이 곧 이 작업을 원자적으로 만드는 일이고, 그렇게 하지 않으면 그저 비슷한 시각에 실행된 작은 작업 세 개일 뿐입니다.

EF Core에서는 DbContext가 작업 단위여서 따로 만들 일이 거의 없습니다. 우리가 한 변경은 모두 변경 추적기에 담기고, SaveChanges를 부르기 전에는 아무것도 전송되지 않으며, 보낼 문장이 둘 이상이면 SaveChanges가 트랜잭션을 엽니다. 두 번째 문장이 제약 조건을 어기면 트랜잭션이 롤백되어 첫 문장도 없던 일이 되고, 변경 추적기는 아직 반영되지 않은 변경을 그대로 갖고 있으므로 문제를 고쳐서 다시 시도할 수 있습니다.

이것을 잘못 다뤘을 때 잃는 것은 평상시의 정확성이 아니라 실패했을 때의 정확성입니다. 속성 하나 바꿀 때마다 SaveChanges를 부르면 원자적인 작업 하나가 독립적인 작업 셋으로 쪼개지고, 각각이 자기 트랜잭션과 자기 왕복을 갖습니다. 두 번째와 세 번째 사이에서 프로세스가 죽으면 데이터베이스는 코드가 이름조차 붙여 두지 않은 상태로 남습니다. 속도도 손해입니다. 함께 보낸 문장 묶음은 왕복 한 번이지만, 따로 부른 저장 세 번은 왕복 세 번입니다.

```csharp
// 작업 단위 하나: 변경 셋, SaveChanges 한 번, 트랜잭션 하나.
var order = await db.Orders.Include(o => o.Lines).SingleAsync(o => o.Id == id, ct);
order.Status = OrderStatus.Shipped;
order.Lines.Add(new OrderLine { Sku = sku, Quantity = 1 });
db.OrderLines.Remove(order.Lines.Single(l => l.Id == staleLineId));

await db.SaveChangesAsync(ct);   // INSERT와 DELETE와 UPDATE가 트랜잭션 하나 안에서
```

SaveChanges 한 번보다 범위를 넓혀야 하는 경우가 둘 있습니다. 작업이 여러 호출에 걸쳐 있거나 같은 연결에서 EF Core와 순수 ADO.NET을 섞어 쓸 때는 `BeginTransactionAsync`로 직접 트랜잭션을 열고 마지막에 한 번 커밋합니다. 그리고 교착 상태처럼 일시적인 실패를 재시도할 때는 실패한 문장 하나가 아니라 작업 단위 전체를 실행 전략으로 감쌉니다. 롤백이 나머지까지 함께 되돌렸기 때문입니다.

작업 단위의 경계는 기술이 아니라 설계가 정합니다. 사용자가 요청한 그 동작이 곧 경계여야 합니다. 주문 넣기, 요청 승인, 티켓 닫기 같은 것입니다. 이보다 넓히면 한 호흡에 있을 필요가 없던 작업까지 잠금을 붙든 채 끌고 가게 되고, 이보다 좁히면 애초에 묶을 이유였던 보장을 스스로 포기하게 됩니다.
