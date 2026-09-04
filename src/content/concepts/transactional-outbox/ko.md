---
title: "Transactional Outbox"
summary: "Transactional Outbox는 업무 변경과 그 변경이 뜻하는 메시지를 하나의 로컬 트랜잭션으로 함께 쓰고, 발행은 릴레이가 나중에 맡는 방식입니다. 브로커가 죽어 있어도 되고 릴레이가 죽었다 재시도해도 됩니다. 메시지는 사라지지도, 없는 일이 지어내지지도 않고, 다만 가끔 한 번 더 갈 뿐입니다."
category: "분산 트랜잭션과 메시지 일관성"
scene: transactional-outbox
steps:
  - title: "트랜잭션 없는 두 번의 쓰기"
    text: "주문을 커밋한 다음 이벤트를 발행하려는데 브로커가 죽어 있습니다. 데이터베이스는 Paid라고 말하는데 바깥은 그 소식을 영영 듣지 못합니다. 순서를 뒤집으면, 커밋이 실패했는데 존재하지 않는 주문의 이벤트만 남습니다."
  - title: "한 트랜잭션, 두 행"
    text: "변경과 그 변경이 뜻하는 메시지를 함께 씁니다. 주문은 주문 테이블에, 이벤트는 outbox에, 커밋은 한 번입니다. 실패하면 주문도 메시지도 없습니다. 성공하면 메시지는 이미 존재하고, 브로커가 죽어 있어도 더는 문제가 되지 않습니다."
  - title: "릴레이가 재시도하므로 전달은 최소 한 번입니다"
    text: "릴레이는 pending 행을 읽어 발행하고 sent로 표시합니다. 발행과 표시 사이에 죽으면, 재시작한 뒤 같은 id의 같은 메시지가 한 번 더 나갑니다. 소비자는 중복을 볼 수는 있어도 구멍을 보지는 않습니다."
  - title: "순서대로, 묶어서, 치우면서"
    text: "outbox는 로그입니다. 행은 넣은 순서대로 묶여 나가고, 보낸 행은 정리합니다. 폴링이 부담스러워지면 change data capture가 데이터베이스 로그를 대신 읽고, 릴레이는 인프라 속으로 사라집니다."
related:
  - label: Saga
    slug: saga
  - label: Choreography
    slug: choreography
  - label: Orchestration
    slug: orchestration
  - label: Idempotency Key
    slug: idempotency-key
  - label: Idempotent Consumer
    slug: idempotent-consumer
  - label: Deduplication
    slug: deduplication
  - label: Message ID
    slug: message-id
  - label: Change Data Capture
    slug: change-data-capture
  - label: Competing Consumers
    slug: competing-consumers
  - label: Consumer Acknowledgement
    slug: consumer-acknowledgement
  - label: Dead Letter Queue
    slug: dead-letter-queue
  - label: Local Transaction
    slug: local-transaction
references:
  - title: Transactional Outbox pattern with Azure Cosmos DB
    url: https://learn.microsoft.com/en-us/azure/architecture/databases/guide/transactional-out-box-cosmos
  - title: Using transactions (EF Core)
    url: https://learn.microsoft.com/en-us/ef/core/saving/transactions
  - title: Transactional Outbox (MassTransit)
    url: https://masstransit.massient.com/concepts/outbox
  - title: Implementing event-based communication between microservices
    url: https://learn.microsoft.com/en-us/dotnet/architecture/microservices/multi-container-microservice-net-applications/subscribe-events
---

## 언제 쓰나

- 하나의 작업이 상태도 바꾸고 바깥에도 알려야 할 때 씁니다. 주문이 들어오고, 계정이 만들어지고, 결제가 확정되고, 문서가 승인되는 순간이 그렇습니다. 이 두 번의 쓰기는 떨어져서는 안 되고, 브로커 앞에서 아무리 재시도해도 둘을 묶어 주지는 못합니다.
- 이 패턴이 답하는 문제는 이중 쓰기이지 느린 메시징이 아닙니다. 이벤트가 있으면 편한 정도이거나 받는 쪽이 물어봐서 다시 만들 수 있다면, 테이블 하나와 그것을 비우는 릴레이는 그냥 유지 비용입니다.
- outbox는 변경과 같은 데이터베이스에 있어야 하고 같은 트랜잭션이 써야 합니다. 데이터베이스를 따로 두거나, 커넥션을 따로 잡거나, 저장 콜백에서 발행을 호출하면 테이블만 하나 늘어난 채 원래 자리로 돌아옵니다.
- 두 가지 숫자를 봅니다. 아직 pending인 행이 몇 개인지, 그중 가장 오래된 것이 얼마나 기다렸는지입니다. pending이 늘기만 하고 줄지 않는다면 파이프라인이 멈췄다는 가장 이른 신호이고, 이벤트가 안 온다는 말이 아래쪽에서 올라오기 한참 전에 보입니다.
- 보낸 행을 어떻게 치울지는 필요해지기 전에 정해 둡니다. outbox는 테이블의 모습을 한 큐이고, 아무도 정리하지 않는 테이블은 결국 그 데이터베이스에서 가장 큰 테이블이 됩니다.

## 주의점

- 이 패턴이 사 주는 것은 최소 한 번 전달이지 정확히 한 번이 아닙니다. 릴레이는 메시지를 발행하고 그 사실을 기록하기 전에 죽을 수 있고, 뒤를 이은 릴레이는 같은 id로 한 번 더 발행합니다. 소비자 쪽을 먼저 설계합니다. 변하지 않는 메시지 id, 이미 처리한 것을 적어 두는 기록, 그리고 같은 메시지가 다시 왔을 때 무엇을 해도 되는지에 대한 규칙이 필요합니다.
- 순서를 지켜 발행하면 처리량을 내줍니다. 소비자가 한 주문이나 한 계정 안에서의 이벤트 순서를 신경 쓴다면 그 단위의 행은 한 번에 하나씩 나가야 하고, 신경 쓰지 않는다면 릴레이가 묶어서 여러 개를 동시에 보내게 둡니다.
- 릴레이 두 대가 같은 테이블을 폴링하면, 집는 동작이 잠금이 아닌 한 같은 행을 함께 집습니다. `SELECT ... FOR UPDATE SKIP LOCKED`, 짧은 임대 기간을 담는 소유자 컬럼, 리더 한 대를 뽑는 방식이 흔한 세 가지 답이고, 여러 대로 늘릴 서비스라면 첫날부터 그중 하나가 있어야 합니다.
- 행은 트랜잭션이 쓰므로 그 코드의 모양을 그대로 담습니다. 본문은 도메인 엔터티를 직렬화한 결과가 아니라 명시적인 계약으로 유지합니다. 그러지 않으면 배포 한 번이 소비자에게 읽을 수 없는 모양을 건네게 됩니다.
- 폴링에는 바닥이 있습니다. 1초마다 깨어나는 릴레이는 지연을 1초 얹고 인스턴스마다 초당 한 번의 조회를 얹습니다. 간격을 줄이면 한쪽 비용을 다른 쪽 비용으로 바꿀 뿐입니다. 어느 쪽도 받아들일 수 없게 되면 change data capture가 데이터베이스 로그를 대신 읽고, 테이블은 더 이상 폴링되지 않습니다.

## .NET에서는

EF Core라면 엔터티와 outbox 행을 같은 `DbContext`에 넣고 `SaveChanges` 한 번으로 커밋하거나, 여러 호출이 함께 확정되어야 할 때는 `BeginTransaction`으로 명시적으로 감쌉니다. 릴레이는 보통 `BackgroundService`로 두고, pending 행을 배치로 집어 발행한 뒤 sent로 표시합니다. 이때 PostgreSQL에서는 `FOR UPDATE SKIP LOCKED`, SQL Server에서는 `READPAST`를 써서 두 인스턴스가 같은 행을 집지 않게 합니다. MassTransit은 이 흐름을 여러분의 `DbContext` 위에서 처리하는 outbox를 제공하니, 직접 만들 생각이더라도 한 번 읽어 볼 만합니다. 폴링 비용이 너무 커지면 SQL Server의 change data capture나 Debezium 커넥터가 로그를 대신 읽고, 릴레이는 서비스의 일부가 아니라 인프라의 일부가 됩니다.
