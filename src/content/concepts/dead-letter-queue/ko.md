---
title: "Dead Letter Queue"
summary: "dead-letter queue는 브로커가 너무 여러 번 전달을 시도한 메시지를 옆으로 치워 두는 자리입니다. 독 메시지 하나가 처리량을 갉아먹는 대신 사람을 기다리게 되고, 잃는 것은 없습니다. 이력을 단 채 세워 둔 것뿐입니다."
category: "메시징과 이벤트 처리"
scene: dead-letter-queue
steps:
  - title: "독 메시지 하나가 줄 전체의 비용이 됩니다"
    text: "처리가 실패하면 브로커는 다시 전달하고, 횟수가 올라갑니다. 약속대로 최소 한 번입니다. 그동안 뒤에 선 모든 것이 기다리고, 큐의 깊이가 그 청구서입니다."
  - title: "한도는 자비입니다"
    text: "세 번째 실패에서 브로커는 고집을 멈춥니다. 메시지는 이력을 단 채 옆길로 옮겨지고, 소비자는 풀려납니다. 독이 줄을 떠나는 순간 처리량이 제자리로 돌아옵니다. 잃은 것은 없습니다. 세워 둔 것입니다."
  - title: "거기 놓인 것들이 이유를 말해 줍니다"
    text: "끝내 해석되지 않는 메시지, 재시도가 바닥난 메시지, 누가 닿기 전에 만료된 메시지가 저마다 이유를 달고 도착합니다. dead-letter queue는 쓰레기통이 아니라 이름표가 붙은 선반입니다."
  - title: "깊이는 경보이고, 재투입이 수리입니다"
    text: "선반을 지켜봅니다. 늘어나는 개수는 지금 상류의 무언가가 잘못됐다는 뜻입니다. 원인을 고치고, 다시 돌 수 있는 것은 재투입하고, 정말 죽은 것은 기록을 남기고 일부러 버립니다. 썩게 두지 않습니다."
related:
  - label: Competing Consumers
    slug: competing-consumers
  - label: Consumer Acknowledgement
    slug: consumer-acknowledgement
  - label: Work Queue
    slug: work-queue
  - label: Web Queue Worker
    slug: web-queue-worker
  - label: Idempotent Consumer
    slug: idempotent-consumer
  - label: At-Least-Once
    slug: at-least-once
  - label: Message ID
    slug: message-id
  - label: Deduplication
    slug: deduplication
  - label: Retry
    slug: retry
  - label: Transactional Outbox
    slug: transactional-outbox
references:
  - title: Service Bus dead-letter queues
    url: https://learn.microsoft.com/en-us/azure/service-bus-messaging/service-bus-dead-letter-queues
  - title: Message expiration and time to live
    url: https://learn.microsoft.com/en-us/azure/service-bus-messaging/message-expiration
  - title: RabbitMQ dead letter exchanges
    url: https://www.rabbitmq.com/docs/dlx
---

## 언제 쓰나

- 재시도가 있는 큐라면 전부 필요합니다. 없으면 결말은 둘뿐입니다. 독 메시지가 일감 앞에서 영원히 돌거나, 브로커가 조용히 버리거나입니다. 선반을 두는 편이 둘 다보다 낫습니다.
- 재시도로는 절대 고쳐지지 않는 이유로 실패하는 메시지. 역직렬화되지 않는 본문, 누군가 지워 버린 행을 가리키는 참조, 이 소비자가 본 적 없는 계약 버전이 그렇습니다.
- 기한이 있는 일감. 너무 오래 기다린 메시지는 늦게 실행하는 대신 옆으로 치워 두는 편이 낫습니다. TTL과 dead-letter 처리는 같은 장치를 양쪽에서 본 것입니다.
- 그러지 않으면 무엇이 실패했는지 알아내려고 로그를 뒤져야 하는 모든 파이프라인. dead-letter queue는 "어젯밤에 뭔가 잘못됐다"를 셀 수 있고 걸러 볼 수 있고 다시 돌릴 수 있는 목록으로 바꿔 줍니다.

## 주의점

- 전달 한도는 진짜 거래입니다. 크게 잡으면 절대 성공하지 못할 메시지에 소비자가 처리량을 태우고, 작게 잡으면 느린 의존 하나 때문에 멀쩡한 일감 한 묶음이 통째로 dead-letter로 갑니다. 한도는 백오프와 짝지어 둡니다. 그래야 재시도가 1초 안에 다 소모되지 않고 넓게 퍼집니다.
- 아무도 보지 않는 dead-letter queue는 단계만 늘어난 조용한 유실입니다. 깊이와 가장 오래된 메시지의 나이에 경보를 걸고, 둘 다 디버그 출력이 아니라 일급 신호로 다룹니다. 개수가 늘고 있다면 지금 상류의 무언가가 망가졌다는 뜻입니다.
- 재투입은 설계상 중복입니다. 그 메시지는 앞선 시도에서 이미 일부 효과를 남겼을 수 있습니다. 같은 메시지를 두 번 받아도 결과가 달라지지 않는 소비자여야 재생을 안전하게 제공할 수 있고, 보통은 메시지 id와 이미 처리한 것의 기록이 그 조건입니다.
- 각 메시지가 왜 dead-letter로 갔는지 기록하고, 왜 버렸는지도 기록합니다. 이유가 선반의 가치 전부이며, 메모 없는 폐기는 그냥 사라진 메시지와 구분되지 않습니다.
- 재생 전에 원인을 고칩니다. 망가진 그 의존으로 다시 넣으면 선반만 또 채워지고, 두 번째 이력이 첫 번째 이력까지 읽기 어렵게 만듭니다.
- dead-letter queue도 다른 큐와 같아서 자기 할당량과 자기 만료가 있습니다. 차도록 놔두면 더는 받지 않고, 그때는 실패 기록마저 정말로 사라집니다.

## .NET에서는

Azure Service Bus는 모든 큐와 구독에 dead-letter 하위 큐를 기본으로 붙여 줍니다. `MaxDeliveryCount`가 브로커 스스로 메시지를 그쪽으로 옮기는 시점을 정하고, `DeadLetterMessageAsync`는 재시도가 소용없다는 것을 이미 알 수 있을 때 소비자가 바로 옮기게 해 줍니다.

```csharp
// Entity setup: three deliveries, then the broker sets the message aside itself.
await admin.CreateQueueAsync(new CreateQueueOptions("orders")
{
    MaxDeliveryCount = 3,
    DefaultMessageTimeToLive = TimeSpan.FromMinutes(30),
    DeadLetteringOnMessageExpiration = true,
});

processor.ProcessMessageAsync += async args =>
{
    OrderPlaced order;
    try
    {
        order = args.Message.Body.ToObjectFromJson<OrderPlaced>();
    }
    catch (JsonException ex)
    {
        // A retry cannot fix a payload that does not parse: shelve it now, with the reason.
        await args.DeadLetterMessageAsync(args.Message, "DeserializationFailed", ex.Message);
        return;
    }

    await handler.HandleAsync(order, args.CancellationToken);   // throwing here just abandons the lock
};

// Reading the shelf, and putting a message back once the cause is fixed.
var dead = client.CreateReceiver("orders", new ServiceBusReceiverOptions
{
    SubQueue = SubQueue.DeadLetter,
});

await foreach (var message in dead.ReceiveMessagesAsync())
{
    var reason = message.DeadLetterReason;               // MaxDeliveryCountExceeded, TTLExpired, or yours
    var detail = message.DeadLetterErrorDescription;

    if (!CanRunAgain(reason)) { await dead.CompleteMessageAsync(message); continue; }   // discarded, on purpose

    await sender.SendMessageAsync(new ServiceBusMessage(message)); // resubmit: a fresh delivery count
    await dead.CompleteMessageAsync(message);
}
```

알아 둘 것이 두 가지 있습니다. `DeadLetterMessageAsync`는 이유와 설명을 받고, 그 값들은 메시지에 `DeadLetterReason`과 `DeadLetterErrorDescription`으로 도착합니다. 분류할 수 있는 선반과 하나씩 열어 봐야 하는 더미의 차이가 여기서 갈립니다. 그리고 재투입은 새 메시지입니다. `new ServiceBusMessage(message)`로 옛 메시지를 복사하면 본문과 애플리케이션 속성이 그대로 따라오고 직접 붙인 `MessageId`도 함께 오므로, 그 값으로 중복을 걸러 내는 소비자는 반복을 알아봅니다. RabbitMQ는 같은 일을 다르게 짭니다. 큐의 `x-dead-letter-exchange` 인자에 이름을 적은 dead letter exchange를 쓰고, 그 exchange가 보내는 큐는 평범한 큐입니다. 그래서 거기서는 재생이 그냥 또 한 번의 발행입니다.
