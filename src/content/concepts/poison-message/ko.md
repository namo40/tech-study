---
title: "Poison Message"
summary: "독 메시지는 처리할 때마다 실패하고, 최소 한 번 전달이 그것을 계속 다시 데려옵니다. 대책이 없으면 큐를 막고 소비자를 태우므로, 대책은 지연과 재시도 예산, 그리고 마지막에 데드 레터 서랍입니다."
category: "메시징과 이벤트 처리"
scene: poison-message
steps:
  - title: "나쁜 메시지 하나에 줄 전체가 기다립니다"
    text: "두 건은 잘 처리되고, 셋째가 실패하고, 곧장 돌아와서 또 실패합니다. 최소 한 번 전달은 제 일, 즉 재전달을 하고 있을 뿐인데, 그 일이 큐의 선두를 벽으로 만들었습니다. 그 뒤의 모든 것은 그저 나이를 먹습니다."
  - title: "자꾸 돌아오는 것은 시스템이 약속을 지키기 때문입니다"
    text: "끝내 확인되지 않은 메시지는 다시 전달되어야 합니다. 최소 한 번이 뜻하는 바가 그것입니다. 정확히 한 번은 좁은 경계 안에서만 성립하고, 그 밖에서는 재전달이 곧 보장입니다. 감당하지 못하는 핸들러 쪽이 버그입니다."
  - title: "실패를 옆으로 옮기고, 재시도는 시간에게 맡깁니다"
    text: "나쁜 메시지는 지연을 두는 재시도 큐로 가고, 본류는 즉시 다시 흐릅니다. 타이머가 울리면 줄 뒤로 다시 합류하고, 또 실패하면 더 긴 지연을 받습니다. 백오프는 그 메시지를 향한 자비가 아니라 그 뒤의 모두를 위한 보호입니다."
  - title: "재시도 예산이 있어야 서랍이 생깁니다"
    text: "여덟 번째 시도가 끝나면 메시지는 이력을 매단 채 데드 레터 큐로 옮겨지고 경보가 울립니다. 격리는 폐기가 아닙니다. 재시도가 멈추고 조사가 시작되는 순간이고, 그동안 뒤의 줄은 계속 흐릅니다."
related:
  - label: Dead Letter Queue
    slug: dead-letter-queue
  - label: Retry Queue
    slug: retry-queue
  - label: Exactly-Once
    slug: exactly-once
  - label: At-Least-Once
    slug: at-least-once
  - label: Retry
    slug: retry
  - label: Idempotent Consumer
    slug: idempotent-consumer
  - label: Idempotency Key
    slug: idempotency-key
  - label: Competing Consumers
    slug: competing-consumers
  - label: Work Queue
    slug: work-queue
  - label: Backpressure
    slug: backpressure
  - label: Ordering
    slug: ordering
references:
  - title: Service Bus dead-letter queues
    url: https://learn.microsoft.com/en-us/azure/service-bus-messaging/service-bus-dead-letter-queues
  - title: Retry pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/retry
  - title: Service Bus message sequencing and scheduled delivery
    url: https://learn.microsoft.com/en-us/azure/service-bus-messaging/message-sequencing
---

## 언제 쓰나

이것은 고르는 패턴이 아니라 대비해야 하는 고장입니다. 최소 한 번 전달을 쓰는 소비자라면 언젠가 반드시 만납니다.

- 핸들러가 해석하지 못하는 페이로드. 생산자가 스키마를 바꿨거나, 숫자였던 필드가 문자열이 됐거나, 아무도 예상하지 못한 null이 들어온 경우입니다.
- 특정 입력 하나만 싫어하는 버그. 나머지 만 건은 잘 지나가는데 이 한 건만 매번 같은 분기로 들어가서 같은 자리에서 예외를 던집니다.
- 지금만이 아니라 앞으로도 영원히 그 레코드를 거절할 하위 시스템. 절대 생기지 않을 외래 키, 이미 삭제된 계정, 가격 서비스가 모르는 통화 같은 것들입니다.
- 보낼 때는 유효했지만 가리키던 대상이 사라져서 더 이상 유효하지 않은 메시지.

공통점은 언제 시도하든 결과가 같다는 것입니다. 그 점이 일시적 오류가 아니라 독인 이유이고, 다음에 무엇을 할지 정할 때 실제로 중요한 구분은 이것 하나뿐입니다.

## 주의점

- 재시도를 걸기 전에 독과 일시적 오류를 먼저 나눕니다. 타임아웃은 한 번 더 해볼 값어치가 있지만 역직렬화 오류는 아닙니다. 독을 더 세게 재시도하는 것은 순수한 낭비이므로, 예외를 분류하고 두 종류가 서로 다른 길을 가게 합니다.
- 대부분의 브로커에서 기본값은 즉시 재전달인데, 항상 실패하는 메시지에게는 최악의 정책입니다. 피해를 최대로 키웁니다. 소비자는 끝내 못 끝낼 그 한 건에 시간을 다 쓰고 뒤의 모든 것은 기다립니다. 시도 사이에는 반드시 지연을 둡니다.
- 시도 횟수에 한도를 두고, 그 횟수는 소비자 메모리가 아니라 메시지에 붙여 둡니다. 프로세스 안에 든 횟수는 재시작하면 사라지고 다른 레플리카에게는 보이지도 않습니다. 일부 브로커가 전달 횟수를 메시지 자체에 싣고 다니는 이유가 그것입니다. Service Bus에는 `DeliveryCount`가, RabbitMQ quorum 큐에는 `x-delivery-count`가 있지만, classic 큐는 `redelivered` 표시만 남기고 Kafka는 아무것도 세지 않습니다.
- 지연을 메시지 복사본 예약으로 구현하면 복사본은 새 메시지라서 전달 횟수가 처음부터 다시 셉니다. 시도 번호를 헤더에 직접 실어야 합니다. 그러지 않으면 예산은 영원히 소진되지 않습니다.
- 아무도 보지 않는 데드 레터 큐는 매립지입니다. 첫 메시지가 들어오는 순간의 경보, 담당자, 원인을 고친 뒤 다시 흘려보내는 절차가 문서로 있어야 합니다.
- 순서 보장은 이 모든 것을 어렵게 만듭니다. 파티션 스트림이나 세션 안에서는 독 메시지만 건너뛸 수 없습니다. 그 키의 뒤 전부를 함께 건너뛰어야 하고, 옆으로 빼는 행위 자체가 키 안의 순서가 금지하는 일이기 때문입니다. 멈춤을 받아들이든지, 예산을 다 쓴 메시지는 시퀀스에서 빠지고 그 구멍을 기록으로 남긴다고 미리 정해 두든지 둘 중 하나입니다.
- 나중에 진단할 수 있을 만큼은 남깁니다. 메시지 id, 전달 횟수, 예외, 그리고 보관이 허용된다면 페이로드까지입니다. 메시지를 격리하는 목적 자체가 누군가 원인을 알아낼 수 있게 하는 것입니다.

## .NET에서는

Azure Service Bus가 이 일의 대부분을 대신해 줍니다. `MaxDeliveryCount`가 재시도 예산이고, 소비자가 아니라 브로커가 그것을 셉니다. 예산이 소진되면 메시지는 큐의 데드 레터 하위 큐로 자동으로 옮겨집니다. 남는 일은 일시적 오류와 영구적 오류를 가르는 것, 그리고 그 사이에 지연을 넣는 것입니다.

```csharp
var admin = new ServiceBusAdministrationClient(connectionString);
await admin.CreateQueueAsync(new CreateQueueOptions("orders")
{
    MaxDeliveryCount = 5,                    // 예산. 세는 쪽은 브로커다
    LockDuration = TimeSpan.FromMinutes(1),  // 한 번의 전달이 돌아오기까지 허용되는 시간
});

const int MaxAttempts = 5;
var sender = client.CreateSender("orders");
var processor = client.CreateProcessor("orders", new ServiceBusProcessorOptions
{
    MaxConcurrentCalls = 4,
    AutoCompleteMessages = false,            // 모든 메시지를 명시적으로 정산한다
});

processor.ProcessMessageAsync += async args =>
{
    var token = args.CancellationToken;
    try
    {
        var order = args.Message.Body.ToObjectFromJson<OrderPlaced>();
        await handler.HandleAsync(order, token);
        await args.CompleteMessageAsync(args.Message, token);
    }
    catch (Exception ex) when (IsPermanent(ex))
    {
        // 독. 다음 전달에서도 같은 방식으로 실패하므로 더 쓰지 않는다.
        // 이유는 메시지에 실려서 함께 간다.
        await args.DeadLetterMessageAsync(args.Message, ex.GetType().Name, ex.Message, token);
    }
    catch (Exception ex)
    {
        // 일시적이거나 아직 분류되지 않은 오류. 기다렸다가 줄 뒤에서 다시 시도한다.
        // 복사본을 예약하면 브로커의 전달 횟수가 초기화되므로 시도 번호는 헤더로 나른다.
        var attempt = args.Message.ApplicationProperties.TryGetValue("attempt", out var v) ? (int)v : 1;
        if (attempt >= MaxAttempts)
        {
            await args.DeadLetterMessageAsync(args.Message, "RetryBudgetExhausted", ex.Message, token);
            return;
        }

        var retry = new ServiceBusMessage(args.Message)
        {
            // 새 id. 중복 감지는 예약 메시지도 검사하므로, 원래 MessageId를 단 사본은
            // 받아들여진 뒤 버려지고 그 사이 원본은 아래에서 완료된다.
            MessageId = Guid.NewGuid().ToString(),
        };
        retry.ApplicationProperties["original-message-id"] = args.Message.MessageId;
        retry.ApplicationProperties["attempt"] = attempt + 1;
        var delay = TimeSpan.FromSeconds(5 * Math.Pow(3, attempt - 1));   // 5초, 15초, 45초, ...
        await sender.ScheduleMessageAsync(retry, DateTimeOffset.UtcNow.Add(delay), token);
        await args.CompleteMessageAsync(args.Message, token);
    }
};

static bool IsPermanent(Exception ex) =>
    ex is JsonException or ValidationException or ArgumentException;
```

`IsPermanent`이 설계의 전부이고, 그 바깥의 재시도 정책보다 더 신경 쓸 값어치가 있습니다. 여기서 참이 되는 것은 첫 실패에 바로 데드 레터로 가므로 다섯 번이 아니라 한 번만 쓰고, 나머지는 지연 사다리를 탑니다. 복사본을 예약하는 대신 `AbandonMessageAsync`로 되돌리면 더 간단하고 브로커의 전달 횟수도 유지되지만, 아무 지연 없이 메시지를 곧장 돌려주는 셈이라 장면의 2단계가 말하는 즉시 재전달이 됩니다. 아무것도 정산하지 않고 그냥 반환하면 잠금이 만료될 때까지 메시지가 보이지 않으므로 지연이 생기기는 하지만, 그 대기는 잠금 시간의 상한인 5분을 넘지 못하고 만료 한 번마다 전달 횟수를 하나씩 쓰므로, 백오프 사다리가 아니라 버티는 방법일 뿐입니다.

반대편에서는 데드 레터 큐를 로그가 아니라 큐로 읽습니다. `ServiceBusReceiver`를 `SubQueue.DeadLetter`로 열면 되고, 각 메시지는 원본 본문과 헤더 옆에 `DeadLetterReason`과 `DeadLetterErrorDescription`을 함께 싣고 있습니다. 메시지 수에 대한 경보, 이유를 보여 주는 화면, 버그를 고친 뒤 메시지를 본 큐로 다시 보내는 버튼. 이 셋이 있어야 서랍이 메시지가 잊히러 가는 곳이 아니라 업무 흐름이 됩니다.
