---
title: "Ordering"
summary: "메시지 순서는 범위가 정해진 약속입니다. 소비가 병렬로 가는 순간 전역 순서는 사라지므로 시스템은 키 안에서만 순서를 보장하고, 그 키를 고르는 일이 곧 무엇을 순서대로 지킬지와 무엇을 확장할 수 있게 둘지를 함께 고르는 일입니다."
category: "메시징과 이벤트 처리"
scene: ordering
steps:
  - title: "발행 순서는 처리 순서가 아닙니다"
    text: "+100이 -30보다 먼저 떠났는데, 병렬 소비자 둘이 거꾸로 끝냈고, 한순간 잔액이 음수가 됐습니다. 잃은 것도 중복된 것도 없습니다. 순서만 뒤집혔습니다. 병렬성은 전역 순서가 죽으러 가는 곳입니다."
  - title: "순서는 키 안에서 삽니다"
    text: "같은 키, 같은 파티션, 붙이는 쪽 하나, 소비자 하나. 그 차선 안에서 순서는 희망이 아니라 물리입니다. 다른 키는 다른 차선을 달리고 둘 사이엔 약속이 없습니다. 그리고 그것으로 충분합니다. 두 계좌는 애초에 서로의 순서가 필요 없었습니다."
  - title: "순서를 보장해 주는 그 키가 부하도 모읍니다"
    text: "인기 키 하나면 핫 파티션 하나입니다. P0이 끓는 동안 P1은 놀고, 소비자를 늘려도 소용없습니다. 약속 자체가 그 키를 한 차선에 못 박기 때문입니다. 순서는 병렬성으로 사는 것이고, 청구서는 가장 뜨거운 키 앞으로 옵니다."
  - title: "약속의 범위는 그것이 필요한 가장 작은 단위로"
    text: "시스템 전체의 순서가 아니라 계좌 하나의 순서입니다. 키마다 제 차선을 지키고, 차선들은 파티션에 고르게 퍼지고, 두 성질이 동시에 성립합니다. 모든 계좌가 일관되고 모든 파티션이 바쁩니다. 전부에 순서를 걸면 전부가 직렬이 되고, 필요한 만큼만 걸면 확장됩니다."
related:
  - label: Event Stream
    slug: event-stream
  - label: Hot Partition
    slug: hot-partition
  - label: Publish/Subscribe
    slug: publish-subscribe
  - label: Competing Consumers
    slug: competing-consumers
  - label: Offset
    slug: offset
  - label: Sharding
    slug: sharding
  - label: Consistent Hashing
    slug: consistent-hashing
  - label: Event Sourcing
    slug: event-sourcing
  - label: Event Replay
    slug: event-replay
  - label: At-Least-Once
    slug: at-least-once
  - label: Dead Letter Queue
    slug: dead-letter-queue
references:
  - title: Message sequencing and timestamps
    url: https://learn.microsoft.com/en-us/azure/service-bus-messaging/message-sequencing
  - title: Message sessions (Service Bus)
    url: https://learn.microsoft.com/en-us/azure/service-bus-messaging/message-sessions
  - title: Features and terminology in Azure Event Hubs
    url: https://learn.microsoft.com/en-us/azure/event-hubs/event-hubs-features
---

## 언제 쓰나

순서는 켜고 끄는 기능이라기보다 다른 것을 고르기 전에 먼저 답해야 하는 질문입니다. 무엇을 기준으로 한 순서인가. 그 답이 키이고, 키를 고르는 일에는 처리량 청구서가 따라붙습니다.

- 소비자의 정확성이 순서에 달려 있을 때입니다. 입금을 처리하기 전에 출금을 먼저 반영하는 잔액, `paid`보다 `shipped`를 먼저 받는 상태 기계, 아직 넣지도 않은 행에 갱신을 적용하는 CDC 스트림. 세 경우 모두 이벤트는 다 도착했는데 결과만 틀립니다.
- 순서가 시스템 전체가 아니라 엔티티 단위일 때입니다. 계좌 둘, 주문 둘, 기기 둘. 각자 안에서는 순서가 필요하고 서로 사이에는 필요 없습니다. 순서 보장이 만들어진 자리가 바로 여기입니다. 약속과 병렬성을 함께 지킬 수 있는 유일한 경우이기 때문입니다.
- 밀린 큐를 소비자를 늘려 해결하려는 순간입니다. 늘어난 동시성이 무엇까지 뒤집어도 되는지 따져야 할 때가 바로 그때입니다. "소비자를 늘리자"와 "순서는 지키자"는 한 문장 안에서 서로 반대 방향으로 당깁니다.
- 재생이 원래 실행과 같은 결과를 내야 할 때입니다. 이력에서 다시 만든 프로젝션이 재현 가능하려면, 재생이 각 키의 이벤트를 로그에 담긴 순서 그대로 적용해야 합니다.

## 주의점

- 전역 FIFO와 병렬 소비자는 튜닝 문제가 아니라 모순입니다. 큐 하나를 작업자 넷이 나눠 들면 순서는 아예 없고, 어떤 설정으로도 되살아나지 않습니다. 둘 다 가지려면 약속을 스트림 전체보다 작게 만드는 방법뿐입니다.
- 재시도와 데드 레터 큐는 순서를 소리 없이 깨는데, 깨지는 자리는 예상과 다릅니다. 세션이나 파티션은 실패한 메시지를 같은 자리에 되돌려 주므로 재시도 자체는 순서에 아무 대가도 치르지 않습니다. 순서가 깨지는 것은 재시도 예산이 끝나는 순간, 브로커가 그 메시지를 옆으로 치우고 차선의 나머지를 계속 흘려보낼 때입니다. 나중에 되돌린 데드 레터는 원래 자리가 아니라 새 시퀀스 번호를 달고 도착하므로, 잃은 순서는 되찾을 수 없습니다. 그래서 키 단위 순서에는 키 단위 오류 처리가 필요합니다. 그 키를 멈출지, 구멍을 기록할지, 사람에게 넘길지를 미리 정해 둡니다.
- 타임스탬프는 순서가 아닙니다. 생산자 시계는 어긋나고, 1밀리초 차이로 찍힌 두 이벤트가 실제로는 반대 순서로 나갔을 수도 있습니다. 시스템이 실제로 아는 순서는 한 파티션 안의 시퀀스뿐입니다. 타임스탬프는 언제였는지에 대한 힌트이지 무엇 다음이었는지에 대한 진술이 아닙니다.
- 핫 키 하나가 처리량을 못 박습니다. 유명인 계좌, 물류 창고 하나, 유독 바쁜 테넌트 하나. 그 키의 이벤트는 구조상 전부 한 파티션에 한 소비자로 갑니다. 소비자를 아무리 늘려도 그 키의 상한은 소비자 하나의 속도입니다.
- 소비자는 키 단위로 단일 스레드여야 합니다. 파티션의 이벤트를 스레드 풀에 넘기면 다시 병렬이 되고, 파티션이 풀어 주던 문제가 그대로 돌아옵니다. 소비자 안에서 동시성이 필요하면 배치 단위가 아니라 키 단위로 직렬화합니다. 채널 하나, 작업자 하나, 키 하나입니다.
- 파티션 수를 바꾸면 키가 옮겨 갑니다. 파티션 개수가 달라지면 키가 떨어지는 차선이 달라지고, 변경이 자리 잡는 동안 한 키의 이벤트가 두 차선에 동시에 있을 수 있습니다. 슬라이더가 아니라 드레인을 포함한 마이그레이션으로 다룹니다.

## .NET에서는

Azure Service Bus는 키를 세션이라고 부릅니다. 메시지의 `SessionId`가 키이고, 브로커는 한 세션을 한 번에 한 프로세서에게만 넘기며 잠금을 잡습니다. "키마다 소비자 하나"가 코드의 관례가 아니라 브로커의 성질이 되는 이유입니다.

```csharp
var client = new ServiceBusClient(connectionString);

// 세션이 장치의 전부입니다. 동시 세션 수가 소비자를 확장하고,
// 세션마다 호출 하나라는 점이 키별 순서를 지킵니다.
var processor = client.CreateSessionProcessor("ledger", new ServiceBusSessionProcessorOptions
{
    MaxConcurrentSessions = 8,           // 한 번에 키 여덟 개
    MaxConcurrentCallsPerSession = 1,    // 한 키 안에서는 한 번에 메시지 하나
    AutoCompleteMessages = false,
    SessionIdleTimeout = TimeSpan.FromSeconds(30),
});

processor.ProcessMessageAsync += async args =>
{
    var entry = args.Message.Body.ToObjectFromJson<LedgerEntry>();
    try
    {
        await ledger.ApplyAsync(args.SessionId, entry, args.CancellationToken);
        await args.CompleteMessageAsync(args.Message, args.CancellationToken);
    }
    catch (Exception ex) when (args.Message.DeliveryCount >= 5)
    {
        // 세션은 실패한 메시지를 같은 자리에 돌려주므로 재시도는 순서에
        // 아무 값도 치르지 않습니다. 이것을 깨는 것은 예산의 끝입니다. 브로커가
        // 메시지를 데드 레터로 보내고 세션의 나머지를 계속 처리합니다.
        // 그렇게 되기 전에 세션 상태에 그 구멍을 기록해 둡니다.
        await args.SetSessionStateAsync(
            new BinaryData($"poisoned at {args.Message.SequenceNumber}"), args.CancellationToken);
        await args.DeadLetterMessageAsync(
            args.Message, "SessionPoisoned", ex.Message, args.CancellationToken);
    }
};

// 오류 핸들러는 펌프 자체의 결함만 봅니다. 세션에 대한 판단이
// 실패한 메시지 옆인 위쪽에 있어야 하는 이유가 그것입니다.
processor.ProcessErrorAsync += args =>
{
    logger.LogError(args.Exception, "ledger pump: {Source}", args.ErrorSource);
    return Task.CompletedTask;
};

await processor.StartProcessingAsync();
```

보내는 쪽은 속성 하나이고, 이 페이지 전체가 다루는 설계 결정이 바로 그 한 줄입니다.

```csharp
await sender.SendMessageAsync(new ServiceBusMessage(payload)
{
    SessionId = accountId,   // 약속의 범위를 여기서 고릅니다
});
```

Azure Event Hubs는 같은 선을 파티션으로 긋습니다. `PartitionKey`가 해시되어 파티션 하나로 배정되고, 그 키를 가진 모든 이벤트는 그 파티션의 로그에 순서대로 append되며, `EventProcessorClient`는 컨슈머 그룹 안에서 파티션 하나를 정확히 한 인스턴스에게만 맡깁니다.

```csharp
await using var producer = new EventHubProducerClient(connectionString, "ledger");

// 같은 키, 같은 파티션, 같은 순서. 크기가 아니라 키로 배치를 묶는 것이
// 그것을 참으로 유지합니다.
using var batch = await producer.CreateBatchAsync(new CreateBatchOptions { PartitionKey = accountId });
batch.TryAdd(new EventData(payload));
await producer.SendAsync(batch);
```

소비하는 쪽에서 정확히 짚어 둘 것이 둘 있습니다. `ProcessEventAsync`는 한 파티션 안에서는 이벤트를 하나씩 호출하고 파티션끼리는 동시에 돌므로, 핸들러를 끝까지 `await` 하는 동안에는 그 파티션의 순서가 유지됩니다. 그런데 `await` 없이 작업을 던지거나 이벤트를 백그라운드 큐에 넘기는 순간 보장은 사라지고, 아무도 알려 주지 않습니다. 그리고 체크포인트는 파티션 단위라서 그 차선이 어디까지 처리됐는지만 기록합니다. 실패한 이벤트를 건너뛰고 그 너머에 체크포인트를 찍은 파티션은 순서 보장을 최선 노력으로 조용히 바꿔 버린 셈입니다.

프로세스 안에서는 같은 모양이 키마다 `Channel` 하나가 됩니다. 채널의 사전, 채널마다 리더 태스크 하나, 그리고 키로 채널을 고르는 라우터입니다. 이 페이지 전체를 가장 작게 옮긴 정직한 모형입니다. 라우터가 파티셔너이고, 채널이 파티션이고, 단일 리더가 약속이고, 트래픽 대부분을 가져가는 키 하나가 리더 중 정확히 하나를 병목으로 만듭니다.

```csharp
// 키마다 채널 하나, 채널마다 읽는 쪽 하나. 키를 건너서는 동시에,
// 키 안에서는 엄격한 순서로.
private readonly ConcurrentDictionary<string, Lazy<Channel<LedgerEntry>>> lanes = new();

private ChannelWriter<LedgerEntry> LaneFor(string key) =>
    // GetOrAdd는 같은 키에 대해 팩토리를 두 번 이상 돌리고 진 쪽을 버릴 수
    // 있으므로, 읽는 쪽 task는 정확히 한 번만 도는 Lazy 안에서 시작합니다.
    lanes.GetOrAdd(key, k => new Lazy<Channel<LedgerEntry>>(() =>
    {
        var channel = Channel.CreateBounded<LedgerEntry>(new BoundedChannelOptions(256)
        {
            SingleReader = true,   // 옵션으로 적어 둔 그 약속
            SingleWriter = false,
        });
        _ = Task.Run(() => DrainAsync(k, channel.Reader));
        return channel;
    })).Value.Writer;
```
