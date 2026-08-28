---
title: "Two-Phase Commit"
summary: "2단계 커밋은 여러 저장소를 하나의 트랜잭션처럼 움직이게 합니다. 코디네이터가 prepare 투표를 모으고, 모든 참여자가 약속한 뒤에야 비로소 누군가 커밋합니다. 원자성을 얻는 대가로, 모두가 모두를 기다리는 동안 잠금을 붙들고 있어야 합니다."
category: "트랜잭션과 동시성"
scene: two-phase-commit
steps:
  - title: "저장소는 둘, 약속은 하나"
    text: "주문과 결제는 둘 다 일어나거나 둘 다 일어나지 않아야 합니다. 따로 커밋하면 한쪽은 예라고 했는데 다른 쪽은 아니라고 한 순간이 생기고, 그 반쪽 상태가 바로 고객이 보는 화면입니다. 누군가는 두 데이터베이스를 하나처럼 움직이게 만들어야 합니다."
  - title: "먼저 전원의 약속을 받습니다"
    text: "prepare는 각 저장소에 묻습니다. 이것을 커밋할 수 있는가, 준비된 채로 붙들고 있겠는가. 각자가 검증하고, 잠금을 잡고, 예라고 투표합니다. 2분의 2. 그런데도 아직 아무것도 커밋되지 않았습니다. 약속은 실행이 아니라, 실행을 요구할 권리입니다."
  - title: "전원이 커밋하거나, 아무도 하지 않습니다"
    text: "표를 다 모은 코디네이터가 commit을 말하면 두 저장소가 함께 뒤집힙니다. 한 저장소가 아니라고 투표하면 같은 장치가 반대로 돕니다. 모두 abort, 잠금 해제, 반쪽짜리 없음. 고객은 실패를 볼 수는 있어도 거짓을 보지는 않습니다."
  - title: "약속의 값은 기다림입니다"
    text: "prepared는 잠겼다는 뜻입니다. 그 순간 코디네이터가 죽으면 두 저장소는 뒤에 선 모두를 막으면서 잠금을 쥔 채 기다립니다. 혼자 약속을 깨면 원자성이 깨지기 때문입니다. 이 미결 구간이야말로 현대 시스템이 사가와 아웃박스를 먼저 찾는 이유입니다. 2PC가 틀려서가 아니라, 이 기다림이 그것의 가격이기 때문입니다."
related:
  - label: Distributed Transaction
    slug: distributed-transaction
  - label: Saga
    slug: saga
  - label: Compensating Transaction
    slug: compensating-transaction
  - label: Transactional Outbox
    slug: transactional-outbox
  - label: Local Transaction
    slug: local-transaction
  - label: Isolation Level
    slug: isolation-level
  - label: Deadlock
    slug: deadlock
  - label: Eventual Consistency
    slug: eventual-consistency
  - label: Distributed Lock
    slug: distributed-lock
  - label: Idempotency Key
    slug: idempotency-key
references:
  - title: "TransactionScope Class"
    url: https://learn.microsoft.com/en-us/dotnet/api/system.transactions.transactionscope
  - title: "Saga distributed transactions pattern"
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/saga
  - title: "Compensating Transaction pattern"
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/compensating-transaction
---

## 언제 쓰나

- 이 프로토콜을 말할 줄 아는 두 리소스 관리자에 걸쳐 쓰기가 정말로 원자적이어야 할 때입니다. SQL Server 데이터베이스 두 개, 트랜잭션에 참여할 수 있는 데이터베이스와 메시지 큐, XA를 지원하는 저장소 한 쌍. 이런 경우가 프로토콜이 설계된 대로 동작하는 자리입니다. 판단 기준은 "여기에 원자성이 있으면 좋을까"가 아닙니다. 그건 언제나 좋습니다. 기준은 "절반만 끝난 쓰기의 대가가 잠금과 왕복 비용보다 큰가"입니다.
- 참여자들이 하나의 신뢰 경계와 하나의 네트워크 안에 있을 때입니다. 1밀리초 만에 닿을 수 있고, 같은 운영자가 재시작할 수 있고, 같은 팀이 읽을 수 있는 로그를 가진 코디네이터라면 그 장애는 대치 상황이 아니라 하나의 사고로 끝납니다. 조직 경계를 넘어가면 그중 무엇도 성립하지 않고, 하필 프로토콜의 복구 이야기가 가장 먼저 무너집니다.
- 트랜잭션이 짧고 참여자 수가 적을 때입니다. 참여자 둘에 잠금을 몇 밀리초 쥐는 정도는 대부분의 시스템이 눈치채지 못하고 흡수합니다. 참여자 다섯에 prepare와 commit 사이에 1초짜리 작업이 있으면 이야기가 달라지고, 그 잠금 뒤에 늘어선 줄에서 실체를 확인하게 됩니다.
- 이미 암묵적으로 여기에 기대고 있을 때입니다. 두 번째 커넥션이 참여하는 바람에 조용히 승격된 `TransactionScope`는, 누가 결정했든 아니든 분산 트랜잭션입니다. 내 코드가 그런 일을 하고 있다는 사실을 발견했다면 프로토콜을 이해할 이유가 생긴 것입니다. 그대로 둘지는 별개의 질문입니다.
- 대안이 아무도 보상하지 않는 반쪽 세계일 때입니다. 서비스를 넘나드는 원자성에는 사가가 대체로 맞는 답이지만, 그건 누군가 보상 로직을 실제로 작성하고 시험했을 때의 이야기입니다. 내가 소유한 데이터베이스 두 개에 2단계 커밋을 쓰는 쪽이, 다이어그램으로만 존재하는 사가보다 정당한 선택일 수 있습니다.

## 주의점

- prepared는 잠겼다는 뜻이고, 그것이 비용의 전부입니다. 예라고 투표한 참여자는 무엇을 할지 들을 때까지 잠금을 쥐고 있으며, 혼자 결정할 수 없습니다. 잠금을 놓으면 아직 롤백될 수 있는 값을 다른 트랜잭션이 보게 되고, 변경을 되돌리면 코디네이터가 믿어도 된다고 여긴 약속이 깨집니다. 그 행을 건드리는 모든 트랜잭션이 이 기다림 뒤에 줄을 섭니다.
- 코디네이터는 남의 잠금을 쥐고 있는 단일 지점입니다. 결정을 기록한 뒤 그것을 전파하기 전에 죽으면 참여자들은 미결 상태가 됩니다. 자기가 무엇을 약속했는지는 알지만 무엇으로 결정되었는지는 모릅니다. 복구는 코디네이터가 돌아와 자기 로그에서 다시 전송하는 것이므로 로그는 반드시 내구성이 있어야 하고, 재시작에 걸리는 시간이 곧 그 잠금 뒤의 모든 것이 멈춰 있는 시간입니다. 재시작할 수 없는 코디네이터는 운영 데이터를 손으로 만지는 작업으로 바뀝니다.
- 처리량 비용은 왕복 두 번에 동기 대기이고, 실패한 트랜잭션만이 아니라 모든 트랜잭션이 이것을 지불합니다. 데이터베이스 잠금을 쥔 채 네트워크 호출을 기다리는 것은 이 사이트의 다른 모든 페이지가 피하라고 말하는 패턴인데, 여기서는 그것이 곧 작동 원리입니다.
- 참여시키고 싶은 것들은 대부분 참여시킬 수 없습니다. 호스팅 큐, 오브젝트 스토리지, 모든 HTTP API가 참여를 거부하고, 그것을 우회할 방법도 없습니다. 예외는 좁고 같은 벤더 안에서만 성립합니다. Azure SQL 데이터베이스 사이의 탄력적 트랜잭션처럼, MSDTC가 아니라 서비스 자신이 조율하는 경우입니다. 사가와 트랜잭셔널 아웃박스가 마이크로서비스 세계를 차지한 이유가 이것입니다. 보상이 우아해서가 아니라, 프로토콜이 말을 걸 참여자가 없기 때문입니다.
- .NET에서는 지원 범위가 보이는 것보다 좁습니다. 분산 트랜잭션에는 MSDTC가 필요하고, 그것은 Windows를 뜻하며, 결국 Linux와 대부분의 컨테이너, 대부분의 PaaS 호스트에서는 쓸 수 없습니다. .NET 7 이후로는 승격 자체를 명시적으로 켜 주어야 합니다.
- 아무도 계획하지 않는 실패 방식은 휴리스틱 결정입니다. 너무 오래 미결로 남은 참여자는 사람 손으로, 또는 자체 타임아웃으로 정리될 수 있습니다. 그때 옆 참여자와 다르게 추측하면, 프로토콜을 사서 막으려던 바로 그 반쪽 상태가 생깁니다. 이번에는 그런 일이 생길 수 없다고 적힌 감사 기록까지 함께 남습니다.

## .NET에서는

`TransactionScope`는 주변 트랜잭션이고, 여기서 이해할 가치가 있는 것은 승격입니다. 스코프 안의 커넥션이 하나면 로컬 트랜잭션입니다. 두 번째 내구성 리소스가 참여하는 순간 `System.Transactions`가 이것을 분산 트랜잭션으로 승격시키고 MSDTC가 코디네이터를 맡습니다. 같은 코드인데 런타임의 모습은 전혀 다릅니다.

```csharp
using var scope = new TransactionScope(TransactionScopeAsyncFlowOption.Enabled);

await using (var orders = new SqlConnection(ordersConnectionString))
{
    await orders.OpenAsync();          // still a local transaction here
    await orders.ExecuteAsync(InsertOrder, order);
}

await using (var payments = new SqlConnection(paymentsConnectionString))
{
    // A second durable resource enlists, and this is the promotion: from here
    // on there is a coordinator, a prepare round, and locks held across both.
    await payments.OpenAsync();
    await payments.ExecuteAsync(InsertCharge, charge);
}

scope.Complete();                       // the vote to commit, not the commit
```

`scope.Complete()`는 커밋이 아닙니다. 이 스코프가 반대하지 않는다고 말하는 것뿐입니다. 커밋은 `Dispose`가 실행되고 코디네이터가 전원에게서 같은 답을 들었을 때 일어납니다. 이것을 호출하지 않고 스코프를 벗어나면 중단이며, 그래서 `using` 블록 하나가 오류 처리의 전부가 됩니다.

.NET 7부터는 승격이 기본으로 꺼져 있고, 요청하지 않으면 예외를 던집니다. 지원 범위가 그만큼 좁다는 사실을 런타임이 솔직하게 말해 주는 셈입니다.

```csharp
// Windows only, MSDTC only. On Linux or in most containers this is not a
// configuration problem you can solve; the transaction manager is not there.
TransactionManager.ImplicitDistributedTransactions = true;
```

두 쓰기가 같은 데이터베이스 안에 있다면 이 중 아무것도 필요하지 않고, 아무것도 쓰지 않는 편이 낫습니다. 커넥션 하나, 트랜잭션 하나, 커밋 하나면 됩니다. 로컬 트랜잭션은 그 자체로 원자적이며, 같은 서버의 커넥션 두 개에 `TransactionScope`를 두르면 그것도 승격됩니다.

```csharp
await using var connection = new SqlConnection(connectionString);
await connection.OpenAsync();
await using var tx = await connection.BeginTransactionAsync();

await connection.ExecuteAsync(InsertOrder, order, tx);
await connection.ExecuteAsync(InsertOutboxMessage, message, tx);

await tx.CommitAsync();
```

두 번째 문장이 사람들이 2단계 커밋에 바라는 것 대부분에 대한 현대적인 답입니다. 무슨 일이 있었는지 다른 서비스에 알리는 메시지를 변경 자체와 같은 로컬 트랜잭션 안에서 기록하므로, 둘이 어긋날 수가 없습니다. 별도 프로세스가 아웃박스를 읽어 나중에 발행합니다. 네트워크 호출을 사이에 두고 붙들고 있는 것이 없고, 반대편은 원자적이 아니라 최종적으로 일관되게 됩니다. 이것이 정직한 거래이며, 의식적으로 선택할 만한 거래입니다.

```csharp
// The far side does the other half: a step that can run twice without harm,
// because at-least-once delivery is what the outbox buys you.
public async Task HandleAsync(OrderPlaced message, CancellationToken token)
{
    if (await db.Charges.AnyAsync(c => c.OrderId == message.OrderId, token)) return;
    await payments.ChargeAsync(message.OrderId, message.Amount, token);
}
```

작업이 정말로 여러 서비스에 걸쳐 있고 정말로 전부 아니면 전무여야 한다면, 그 모양은 사가입니다. 각 단계는 로컬로 커밋하고, 나중 단계가 실패하면 보상을 따라 거꾸로 걸어 나옵니다. 어떤 관찰자도 반쯤 바뀐 세계를 보지 않는다는 보장을 포기하는 대신, 2단계 커밋이 잠금에 쓰는 비용을 전부 되찾습니다. 그 창을 감수하겠다고 판단해서 고르세요. 프로토콜을 설정하기가 번거로워서 고르는 것이 아닙니다.
