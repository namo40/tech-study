---
title: "Publish/Subscribe"
summary: "발행-구독은 이벤트 하나를 구독마다 사본으로 배달합니다. 구독자는 각자 자기 위치에서 자기 속도로 읽고, 죽었다가 돌아오면 떠난 자리에서 다시 시작하며, 발행자는 그들이 존재한다는 사실조차 끝내 모릅니다."
category: "메시징과 이벤트 처리"
scene: publish-subscribe
steps:
  - title: "이벤트 하나, 구독마다 사본"
    text: "큐는 하나에게 일을 건네고, 토픽은 모두에게 사본을 건넵니다. 이벤트 셋이 나가고 각각 두 번씩 도착합니다. 구독마다 한 번씩입니다. 발행자는 발행하고 떠날 뿐, 몇이 듣고 있는지 끝내 모릅니다. 그 무지가 곧 결합의 제거입니다."
  - title: "구독마다 자기 속도"
    text: "모든 구독은 자기 위치에서 자기 속도로 읽습니다. A는 최신을 따라가고 B는 뒤처지지만, 서로의 존재를 모릅니다. offset은 공유 로그에 꽂아 둔 책갈피일 뿐이고, 책갈피를 쥔 느린 독자는 누구도 막지 않습니다."
  - title: "죽어도 기록에 남는 자리"
    text: "죽은 구독자가 잃는 것은 시간뿐입니다. B는 위치를 checkpoint로 기록해 두고 죽고, 이벤트 둘을 놓칩니다. 놓친 것은 B의 메모리가 아니라 로그에서 기다립니다. 재기동하면 checkpoint에서 재개해 밀린 것을 비워 냅니다. 로그가 안전망이고, checkpoint는 그 위에 내려서는 자리입니다."
  - title: "새 구독과 보존 기간"
    text: "새 구독자는 자기 시작점을 고릅니다. C는 한참 뒤에 합류해 처음부터 역사를 재생합니다. 로그가 보관해 준 같은 이벤트를 다시 받는 것입니다. C가 읽는 동안 창은 그 뒤에서 닫힙니다. 이벤트 1과 2가 밀려나고, 더 늦게 합류하면 그것들은 이미 없습니다."
related:
  - label: Competing Consumers
    slug: competing-consumers
  - label: Work Queue
    slug: work-queue
  - label: Event Stream
    slug: event-stream
  - label: Offset
    slug: offset
  - label: Checkpoint
    slug: checkpoint
  - label: Ordering
    slug: ordering
  - label: Event Replay
    slug: event-replay
  - label: Event Sourcing
    slug: event-sourcing
  - label: Transactional Outbox
    slug: transactional-outbox
  - label: At-Least-Once
    slug: at-least-once
  - label: Dead Letter Queue
    slug: dead-letter-queue
references:
  - title: Publisher-Subscriber pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/publisher-subscriber
  - title: Service Bus queues, topics, and subscriptions
    url: https://learn.microsoft.com/en-us/azure/service-bus-messaging/service-bus-queues-topics-subscriptions
  - title: EventPosition (Event Hubs)
    url: https://learn.microsoft.com/en-us/dotnet/api/azure.messaging.eventhubs.consumer.eventposition
---

## 언제 쓰나

- 사실 하나에 독립적인 반응이 여럿 붙을 때입니다. `OrderPlaced`는 메일, 분석, 재고, 감사 로그에 모두 닿아야 하는데, 그 넷 중 어느 것도 주문이 접수된 이유는 아닙니다.
- 소비자를 늘리는 일이 생산자를 건드리지 않아야 할 때입니다. 새 구독은 소비자 쪽 배포일 뿐이고 발행자 쪽에서는 아무 일도 아닙니다. 결합이 없다는 말의 실질이 이것입니다.
- 재생과 backfill이 중요할 때입니다. 로그 기반 브로커라면 새 소비자가 처음부터 시작해 역사에서 자기 뷰를 다시 만들 수 있습니다. 프로젝션을 마이그레이션하는 대신 버리고 다시 만들 수 있다는 뜻입니다.
- 소비자마다 속도가 다르고, 그래도 괜찮아야 할 때입니다. 야간 분석 작업과 실시간 알림 서비스가 스트림 하나를 함께 쓰면서도 느린 쪽이 빠른 쪽의 문제가 되지 않습니다.

## 주의점

- 발행-구독이 늘리는 것은 전달이지 이해가 아닙니다. 구독자마다 자기 재시도, 자기 데드 레터 큐, 이미 본 메시지를 다시 받아도 견디는 처리가 따로 필요합니다. 팬아웃은 같은 버그가 이제 N번 돈다는 뜻이기도 합니다.
- 아무도 비우지 않는 구독은 끝없이 자랍니다. Service Bus에서는 그 구독의 적체가 토픽의 크기 할당량(Standard는 1~5 GB, 파티션 토픽이나 Premium은 80 GB)에 산입되고, 토픽이 가득 차면 새 전송이 거부됩니다. Event Hubs에서는 보존 기간 밖으로 밀려난 소비자가 읽지 못한 이벤트를 조용히 잃습니다. 오류만이 아니라 지연에도 알림을 걸어 둡니다.
- 순서는 잘해야 파티션 단위이고, 그 파티션을 소비자 하나가 맡을 때만입니다. 토픽 전체에는 전역 순서가 없으므로 "생성이 수정보다 먼저"를 가정하는 핸들러에는 파티션 키나 Service Bus 세션, 아니면 이벤트에 실린 버전이 필요합니다.
- 전달은 최소 한 번입니다. 작업과 checkpoint 사이에서 죽으면 같은 사본이 두 번 도착하므로, 핸들러는 다시 실행해도 안전해야 합니다.
- 필터는 공짜가 아닙니다. Service Bus의 SQL 필터는 구독마다, 메시지마다 평가되므로 겹치는 규칙이 수십 개인 토픽은 값싼 팬아웃을 메시지별 규칙 엔진으로 바꿔 놓습니다. 일치 여부만 보면 되는 자리에는 correlation 필터를 씁니다.
- 발행자의 무지는 양날입니다. 구독이 지워졌는지, 잘못 설정됐는지, 모든 메시지에서 예외를 던지고 있는지 발행자에게 알려 주는 것은 아무것도 없습니다. 팬아웃의 건강은 소비자 쪽에서 지켜봐야 합니다.

## .NET에서는

Azure Service Bus는 이 경계를 토픽과 구독으로 긋습니다. 한 번 보내면 구독마다 사본 하나가 생기고, 각 구독은 자기 프로세서가 자기 동시성과 자기 데드 레터 큐를 가지고 비웁니다.

```csharp
var client = new ServiceBusClient(connectionString);

// 구독 하나에 프로세서 하나. 여기 어디에도 발행자의 이름은 없고,
// 발행자가 하는 일 어디에도 이 코드의 이름은 없다.
var processor = client.CreateProcessor("orders", "inventory", new ServiceBusProcessorOptions
{
    MaxConcurrentCalls = 4,
    PrefetchCount = 20,
    AutoCompleteMessages = false,        // 작업이 내구성 있게 저장된 다음에 complete
    MaxAutoLockRenewalDuration = TimeSpan.FromMinutes(5),
});

processor.ProcessMessageAsync += async args =>
{
    var placed = args.Message.Body.ToObjectFromJson<OrderPlaced>();

    // 최소 한 번: 이 사본은 전에 온 적이 있을 수 있다. id와 예약은 한 트랜잭션으로
    // 쓰이므로, ReserveAsync 안에서 실패하면 선점도 함께 되돌아간다. 재전달이 id만
    // 알아보고 일어난 적 없는 작업을 건너뛰는 일이 없다.
    await processed.RunOnceAsync(
        args.Message.MessageId,
        ct => inventory.ReserveAsync(placed, ct),
        args.CancellationToken);

    await args.CompleteMessageAsync(args.Message, args.CancellationToken);
};

processor.ProcessErrorAsync += args => { logger.LogError(args.Exception, "inventory subscription"); return Task.CompletedTask; };
await processor.StartProcessingAsync();
```

같은 토픽에 `analytics` 구독을 붙이는 일은 다른 서비스에서 `CreateProcessor`를 한 번 더 부르는 것뿐입니다. 발행자의 `SendMessageAsync`는 바뀌지 않고, 그 사실을 알게 되지도 않고, 느려지지도 않습니다. 어떤 구독까지 메시지가 닿을지는 규칙과 필터가 정합니다. `Subject`나 애플리케이션 속성을 보는 correlation 필터는 색인 조회에 가깝고, SQL 필터는 메시지마다 평가되는 식이므로 기본값은 값싼 쪽으로 두는 편이 좋습니다.

Azure Event Hubs는 같은 경계를 다르게 긋고, 장면의 3단계와 4단계가 말하는 모양이 바로 이쪽입니다. 파티션으로 나뉜 로그가 하나 있고, 컨슈머 그룹이 곧 구독이며, 그 위치는 브로커가 쥔 잠금이 아니라 blob 저장소에 기록되는 checkpoint입니다.

```csharp
var storage = new BlobContainerClient(storageConnectionString, "checkpoints");
var processor = new EventProcessorClient(storage, "analytics", eventHubConnectionString, "orders");

processor.ProcessEventAsync += async args =>
{
    if (!args.HasEvent) return;
    await projection.ApplyAsync(args.Data, args.CancellationToken);

    // checkpoint는 재기동이 내려서는 자리다. 작업 뒤에 쓰되,
    // 이벤트마다 쓰지는 않는다. 한 번이 곧 blob 쓰기 한 번이다.
    if (args.Data.SequenceNumber % 100 == 0)
    {
        await args.UpdateCheckpointAsync(args.CancellationToken);
    }
};

// 두 핸들러 모두 필수다. 오류 핸들러가 없으면 StartProcessingAsync가 예외를 던진다.
processor.ProcessErrorAsync += args =>
{
    logger.LogError(args.Exception, "{Operation} on partition {Partition}", args.Operation, args.PartitionId);
    return Task.CompletedTask;
};
```

`EventProcessorClient`는 저장된 checkpoint에서 컨슈머 그룹을 시작하고, checkpoint가 없으면 `EventPosition`에서 시작합니다. `EventPosition.Earliest`는 보존 기간이 아직 쥐고 있는 것을 전부 재생하고, `EventPosition.Latest`는 지금부터 오는 것만 받습니다. 4단계에서 C가 한 선택이 이것이고, 한 줄짜리 결정치고 결과의 차이가 큽니다. checkpoint를 직접 쓴다는 사실에서 두 가지가 따라 나옵니다. 부수 효과가 내구성 있게 저장된 다음에 checkpoint를 쓰지 않으면, 중간에 죽었을 때 작업이 반복되는 대신 사라집니다. 그리고 우리가 원하는 실패는 반복되는 쪽입니다. 또 이벤트마다가 아니라 일정 간격으로 씁니다. `UpdateCheckpointAsync` 한 번이 blob 저장소 왕복 한 번이므로, 실제로 정할 것은 죽고 난 뒤 몇 건까지 다시 처리할 각오가 되어 있는지입니다.
