---
title: "Azure Service Bus"
summary: "Azure Service Bus는 Azure의 관리형 메시지 브로커입니다. 명령에는 큐, 팬아웃에는 토픽과 구독을 쓰고, 잠금 기반 소비 모델에서 재전달과 데드레터와 순서 있는 세션은 우리가 짜는 코드가 아니라 서비스에 딸려 오는 장비입니다."
category: "메시징과 이벤트 처리"
related:
  - label: Work Queue
    slug: work-queue
  - label: Web-Queue-Worker
    slug: web-queue-worker
  - label: Competing Consumers
    slug: competing-consumers
  - label: Dead Letter Queue
    slug: dead-letter-queue
  - label: Publish/Subscribe
    slug: publish-subscribe
  - label: Ordering
    slug: ordering
  - label: MassTransit
    slug: masstransit
  - label: RabbitMQ
    slug: rabbitmq
references:
  - title: "What is Azure Service Bus?"
    url: https://learn.microsoft.com/en-us/azure/service-bus-messaging/service-bus-messaging-overview
  - title: "Send and receive messages from an Azure Service Bus queue (.NET)"
    url: https://learn.microsoft.com/en-us/azure/service-bus-messaging/service-bus-dotnet-get-started-with-queues
---

## 언제 쓰나

- 워크로드가 Azure에 있고 메시지가 명령이라면 기본값으로 둡니다. 워커 앞에 큐를 두면 느린 요청이 접수된 요청으로 바뀌고, 관리형 서비스라서 패치할 브로커도 정족수를 지켜 줄 클러스터도 없습니다. SDK도 Functions 트리거도 관리 ID 연동도 나머지 애플리케이션이 도는 플랫폼에 이미 물려 있습니다.
- 이벤트 하나를 서로 무관한 여러 쪽이 읽어야 할 때는 토픽과 구독을 씁니다. 발행자는 토픽으로 보내고 구독마다 자기 필터와 자기 전달 횟수와 자기 데드레터 큐를 가진 사본을 쥡니다. 그래서 느리거나 망가진 소비자는 발행자나 이웃이 아니라 자기 구독만 밀리게 합니다.
- 한 번만 읽고 마는 방식이 아니라 잠금 기반 소비를 원할 때 씁니다. peek-lock 모드에서 받은 메시지는 다른 소비자에게는 보이지 않지만 여전히 브로커에 있습니다. 완료하면 사라지고, 포기하면 곧바로 돌아와 다음 시도를 기다리고, 둘 다 하지 않으면 잠금이 만료되면서 스스로 돌아옵니다. 죽어도 잃지 않는 쪽이 기본값이고, 우리가 덧붙이는 기능이 아닙니다.
- 서로 관련된 메시지 묶음을 한 소비자가 순서대로 처리해야 할 때는 세션을 꺼냅니다. 세션 id는 그 키를 가진 모든 메시지를 세션 잠금이 걸린 수신자 하나에 묶습니다. 소비자를 여러 대 두고도 고객별이나 주문별 순서가 살아남는 방식이 이것입니다.

## 주의점

- 잠금 유지 시간은 처리 시간에 대한 약속이고, 그 약속을 어기면 중복으로 값을 치릅니다. 잠금은 길어야 5분입니다. 만료되면 메시지가 다시 보이게 되어, 첫 핸들러가 아직 일하는 중에 다른 쪽으로 전달되고 같은 일이 두 번 일어납니다. 오래 걸리는 작업이 도는 동안 잠금을 갱신하고, `MaxAutoLockRenewalDuration`은 중간값이 아니라 현실적으로 가장 나쁜 경우에 맞춰 잡으세요. 그래도 네트워크 문제로 잠금은 놓칠 수 있으니, 같은 메시지를 두 번 처리해도 결과가 달라지지 않도록 핸들러를 만들어 둡니다.
- 데드레터는 자동이고 조용합니다. 메시지가 `MaxDeliveryCount`를 넘거나, 만료 시 데드레터 옵션이 켜진 채로 만료되면, 브로커가 그 엔터티의 데드레터 하위 큐로 옮기고 더 이상 언급하지 않습니다. 실패하는 것도 없고 경보도 울리지 않으며, 보낸 쪽에서 보면 일이 끝난 것처럼 보입니다. 읽는 사람도 없고 데드레터 깊이에 걸린 경보도 없는 큐는 메시지를 정중하게 잃는 큐입니다.
- 계층은 가격만의 문제가 아니라 기능의 결정입니다. 메시지 크기 한도와 처리량, 대용량 메시지 같은 기능이 Basic과 Standard와 Premium 사이에서 다르고, Premium의 전용 리소스는 지연 시간을 예측 가능하게 만들어 주는 것이기도 합니다. 페이로드가 커져 한도를 넘는 순간 운영에서 천장을 발견하는 것은 설계가 어느 계층을 전제했는지 배우는 가장 비싼 방법입니다.
- 이것은 브로커이지 스트림이 아닙니다. Service Bus는 각각 라우팅과 잠금과 전달 횟수가 필요한 수십만 건 규모의 메시지를 위해 만들어졌습니다. 대량 텔레메트리를 받아 오프셋으로 되감아 읽는 일은 Event Hubs의 몫입니다. 잘못 고르면 오류 메시지가 아니라 비용과 스로틀링으로 드러납니다.

## .NET에서는

- `ServiceBusProcessor`가 수신 루프이고, 잠금 정책이 사는 자리는 그 옵션입니다. 핸들러가 완료와 포기를 직접 정하고, 오류 핸들러는 선택 사항이 아닙니다. 그것이 없으면 펌프 안에서 난 실패가 보이지 않습니다.

```csharp
await using var client = new ServiceBusClient(fullyQualifiedNamespace, new DefaultAzureCredential());

var processor = client.CreateProcessor("orders", new ServiceBusProcessorOptions
{
    MaxConcurrentCalls = 8,
    // Do not settle for us: the handler decides.
    AutoCompleteMessages = false,
    // Long work keeps its lock instead of being redelivered under us.
    MaxAutoLockRenewalDuration = TimeSpan.FromMinutes(10),
});

processor.ProcessMessageAsync += async args =>
{
    try
    {
        await handler.HandleAsync(args.Message.Body.ToObjectFromJson<OrderPlaced>(), args.CancellationToken);
        await args.CompleteMessageAsync(args.Message);
    }
    catch (TransientException)
    {
        // Back to the queue now; the delivery count goes up, and at
        // MaxDeliveryCount the broker dead-letters it without asking.
        await args.AbandonMessageAsync(args.Message);
    }
};

processor.ProcessErrorAsync += args => logger.LogError(args.Exception, "{Source}", args.ErrorSource);
await processor.StartProcessingAsync();
```

- Azure Functions의 Service Bus 트리거는 펌프를 감춘 같은 모델입니다. 바인딩이 메시지마다 함수를 돌리고 반환값으로 정리합니다. 잠금 갱신이나 수동 포기가 필요해지기 전까지는 편하고, 그 지점부터는 위의 프로세서 쪽이 솔직한 모양입니다.
- 데드레터 큐는 평범한 엔터티처럼 읽습니다. 수신자에 `SubQueue.DeadLetter`를 지정해서 주소를 잡고, 메시지마다 `DeadLetterReason`과 `DeadLetterErrorDescription`이 붙어 있습니다. 다시 넣는 일은 사본을 원래 엔터티로 보내는 일이고, 그러면 전달 횟수도 다시 시작합니다.
- 예약 메시지와 중복 검색은 우리가 다시 만들기 전에 알아 둘 만한 브로커 기능입니다. `ScheduleMessageAsync`는 우리 프로세스에 타이머를 두지 않고도 미래 시각에 메시지를 전달하고, 중복 검색은 설정한 시간 창 안에서 같은 `MessageId`가 다시 오면 버립니다. 발행자의 재시도는 이것으로 덮이지만 소비자 쪽의 두 번째 전달은 덮이지 않습니다.
