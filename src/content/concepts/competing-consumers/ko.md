---
title: "Competing Consumers"
summary: "경쟁 소비자는 큐 하나를 여럿이 나눠 듭니다. 각 메시지는 그중 정확히 하나에게만 가므로 소비자를 늘리면 처리량이 늘고, 대신 전달은 최소 한 번이 되고 전체 순서는 사라지는데, 반복해도 결과가 같은 핸들러와 키 단위 분할이 그 대가를 되찾아 줍니다."
category: "메시징과 이벤트 처리"
scene: competing-consumers
steps:
  - title: "소비자 하나"
    text: "메시지가 소비자 하나가 처리하는 속도보다 빨리 도착합니다. 큐가 쌓이고, 메시지가 큐에서 기다리는 시간도 함께 늘어납니다."
  - title: "경쟁 소비자"
    text: "소비자 셋이 같은 큐에서 가져갑니다. 각 메시지는 그중 정확히 하나에게만 가고, 처리량은 세 배가 되며, 도착도 조금 뜸해진 덕에 밀린 메시지가 빠져나갑니다."
  - title: "최소 한 번"
    text: "ack하기 전에 죽은 소비자는 메시지를 큐에 돌려줍니다. 다른 소비자가 마무리하고, 때로는 사본이 두 번 도착합니다. 핸들러는 반복해도 결과가 같아야 하고, 계속 실패하는 메시지는 데드 레터 큐로 보냅니다."
  - title: "키 단위의 순서"
    text: "경쟁 소비자는 전체 순서를 포기합니다. 한 고객이나 한 주문 안에서 순서가 중요하면 그 키로 나누어, 그 키는 한 소비자가 차례대로 처리하고 나머지는 병렬로 돌게 합니다."
related:
  - label: Work Queue
    slug: work-queue
  - label: Web Queue Worker
    slug: web-queue-worker
  - label: Consumer Acknowledgement
    slug: consumer-acknowledgement
  - label: Idempotent Consumer
    slug: idempotent-consumer
  - label: Consumer Group
    slug: consumer-group
  - label: Deduplication
    slug: deduplication
  - label: At-Least-Once
    slug: at-least-once
  - label: Dead Letter Queue
    slug: dead-letter-queue
  - label: Background Job
    slug: background-job
references:
  - title: Competing Consumers pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/competing-consumers
  - title: RabbitMQ reliability guide
    url: https://www.rabbitmq.com/docs/reliability
  - title: MassTransit consumers
    url: https://masstransit.massient.com/concepts/consumers
---

## 언제 쓰나

- 순서와 상관없이 처리해도 되는 독립적인 작업 단위. 메일 발송, 썸네일 생성, 웹훅 전달, 레코드 하나씩 하는 동기화가 그렇습니다.
- 프로세스 하나를 빠르게 만드는 대신 프로세스를 늘려서 처리량을 키워야 할 때. 작업이 I/O 위주이고 큐가 이미 차 있다면 이쪽입니다.
- 도착이 몰렸다 말았다 할 때. 큐가 몰린 양을 받아 두면 소비자는 감당할 수 있는 속도로 비워 나가면 됩니다.

## 주의점

- 전달은 정확히 한 번이 아니라 최소 한 번입니다. 메시지 id로 중복을 걸러 내거나, 두 번 실행돼도 작업이 두 번 일어나지 않는 핸들러를 씁니다.
- ack는 작업과 그 부수 효과가 저장된 뒤에 보냅니다. 먼저 보내면 죽었을 때 메시지가 재전달되는 대신 그냥 사라집니다.
- 재시도 횟수를 정해 두고, 계속 실패하는 메시지는 데드 레터 큐로 보냅니다. 재처리 절차도 함께 적어 둡니다. 그러지 않으면 그 메시지는 돌아올 때마다 소비자를 하나씩 물고 늘어집니다.
- 소비자가 둘 이상이 되는 순간 전체 순서는 사라집니다. 한 고객이나 한 주문 안에서 순서가 중요하다면 그 키로 나눕니다. Kafka 파티션, Azure Service Bus 세션, RabbitMQ consistent-hash exchange가 그 수단입니다.
- prefetch를 조정합니다. prefetch를 크게 잡으면 놀고 있는 소비자가 가져갈 수 있었던 메시지가 한 소비자의 버퍼에 쌓이고, 그 소비자가 죽으면 버퍼에 있던 것이 전부 재전달됩니다.
- 병목이 다른 곳으로 옮겨 가면 소비자를 늘려도 더는 나아지지 않습니다. 작은 커넥션 풀 하나에 소비자 다섯을 붙이면, 앞에 대기줄이 하나 더 생긴 소비자 하나와 다를 바 없습니다.

## .NET에서는

MassTransit에서는 수신 엔드포인트가 곧 경쟁 소비자입니다. 서비스 인스턴스가 모두 같은 큐에 붙고, 브로커는 각 메시지를 그중 정확히 하나에게 넘깁니다.

```csharp
builder.Services.AddMassTransit(x =>
{
    x.AddConsumer<OrderPlacedConsumer>();
    x.UsingRabbitMq((context, cfg) =>
    {
        cfg.Host("rabbitmq");
        cfg.ReceiveEndpoint("orders", e =>
        {
            e.PrefetchCount = 1;                 // 소비자마다 동시에 하나씩
            e.ConcurrentMessageLimit = 1;
            e.UseMessageRetry(r => r.Exponential(3, TimeSpan.FromSeconds(1), TimeSpan.FromSeconds(30), TimeSpan.FromSeconds(2)));
            e.ConfigureConsumer<OrderPlacedConsumer>(context);
            // 재시도를 다 쓰고 나면 MassTransit이 메시지를 orders_error(데드 레터 큐)로 옮깁니다.
        });
    });
});

public sealed class OrderPlacedConsumer(IProcessedMessages processed, IOrderProjector projector)
    : IConsumer<OrderPlaced>
{
    public async Task Consume(ConsumeContext<OrderPlaced> context)
    {
        var messageId = context.MessageId ?? throw new InvalidOperationException("MessageId is required");

        // 트랜잭션 하나가 유일 제약 위에 메시지 id를 넣고
        // projection을 씁니다. id를 먼저 표시하고 나중에 적용하는 것이
        // 메시지를 잃는 방식입니다. ApplyAsync가 던지면 프로세스 안의 재시도가
        // 이미 기록된 id를 발견하고 건너뛴 뒤 예외 없이 반환하며,
        // 그것은 한 번도 쓰이지 않은 projection을 확인 응답한 셈이 됩니다.
        var claimed = await processed.RunOnceAsync(
            messageId,
            ct => projector.ApplyAsync(context.Message, ct),
            context.CancellationToken);

        if (!claimed) return;   // 중복: 유일 제약이 삽입을 거절했습니다
        // 예외 없이 반환하면 메시지를 확인 응답한 것이 됩니다.
    }
}
```

`PrefetchCount`와 `ConcurrentMessageLimit`은 인스턴스 하나가 동시에 들고 있는 작업의 양을 정합니다. 둘 다 1로 두고 시작하는 것이 정직한 출발점입니다. 작업이 기다리는 곳을 큐 한 군데로 유지해 주기 때문입니다. 재시도 정책은 소비자 프로세스 안에서 돌기 때문에 일시적인 실패에 브로커를 한 번 더 다녀올 필요가 없고, 정책이 소진되면 MassTransit이 메시지를 계속 돌리는 대신 `orders_error`로 옮깁니다. 그다음 확장은 배포의 문제가 됩니다. 같은 서비스의 레플리카를 늘리고, 각 레플리카가 같은 `orders` 큐에 붙으면 됩니다. 한 키 안에서 순서가 중요하다면 경쟁 소비자는 그대로 두고 라우팅만 바꿉니다. consistent-hash exchange, Service Bus 세션, Kafka 파티션 키 가운데 하나를 쓰면 그 키는 한 소비자에게 모이고 나머지는 여전히 병렬로 돕니다.
