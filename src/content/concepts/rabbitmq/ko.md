---
title: "RabbitMQ"
summary: "RabbitMQ는 우리가 직접 운영하는 오픈 소스 브로커입니다. 발행자는 exchange로 보내고 바인딩이 어느 큐에 사본이 갈지를 정합니다. 라우팅은 클라우드 서비스가 대신 정해 주는 것이 아니라 표준 프로토콜 위에서 우리가 브로커에 선언하는 것입니다."
category: "메시징과 이벤트 처리"
related:
  - label: Work Queue
    slug: work-queue
  - label: Web Queue Worker
    slug: web-queue-worker
  - label: Competing Consumers
    slug: competing-consumers
  - label: Dead Letter Queue
    slug: dead-letter-queue
  - label: Publish/Subscribe
    slug: publish-subscribe
  - label: Backpressure
    slug: backpressure
  - label: MassTransit
    slug: masstransit
  - label: Azure Service Bus
    slug: azure-service-bus
references:
  - title: RabbitMQ documentation
    url: https://www.rabbitmq.com/docs
  - title: ".NET/C# Client API Guide"
    url: https://www.rabbitmq.com/client-libraries/dotnet-api-guide
---

## 언제 쓰나

- 브로커가 우리가 도는 곳에서 돌아야 하고 누구의 소유도 아니어야 할 때 고릅니다. 서버에도 컨테이너에도 Kubernetes 클러스터에도 설치되고, AMQP 0-9-1을 쓰고 4.0부터는 AMQP 1.0도 기본으로 지원하기 때문에 클라이언트가 특정 공급자에 묶이지 않습니다. 노트북에서 데이터 센터로, 또 다른 클라우드로 옮겨도 주소만 다른 같은 브로커입니다.
- 라우팅이 소비자가 아니라 브로커에 있어야 할 때 씁니다. exchange 타입이 곧 밖으로 드러난 라우팅 규칙입니다. `direct`는 라우팅 키를 정확히 맞추고, `topic`은 `orders.*.created` 같은 패턴을 맞추고, `fanout`은 자기에게 묶인 모든 곳으로 복사하고, `headers`는 속성으로 맞춥니다. 읽는 쪽을 새로 붙이는 일은 바인딩을 추가하는 일이지 발행자의 코드를 고치는 일이 아닙니다.
- 워커 여러 대에 일을 공정하게 나눠 주는 작업 큐를 만들 때 씁니다. 소비자 여럿이 큐 하나를 나눠 쓰고, 각자가 확인 응답을 하지 않은 메시지를 정해진 개수만큼만 쥡니다. 브로커는 이미 바쁜 워커에게 차례대로 돌리는 대신 여유가 있는 쪽에 다음 메시지를 건넵니다.
- 개발과 테스트와 운영이 같은 브로커여야 할 때 꺼냅니다. 이미지는 몇 초면 뜨고, 관리 UI는 우리 코드가 선언한 exchange와 큐를 그대로 보여 줍니다. 로컬에서 디버깅한 동작이 에뮬레이터의 근사치가 아니라 운영에서 실제로 얻는 동작입니다.

## 주의점

- 기본값인 무제한 prefetch는 첫날에 고쳐야 할 함정입니다. prefetch는 소비자가 쥘 수 있는 미확인 메시지의 상한입니다. 상한이 없으면 브로커가 먼저 붙은 소비자 한 대에 큐 전체를 밀어 넣습니다. 나머지 워커는 놀고, 메모리는 불어나고, 그 소비자가 죽으면 그 메시지 전부가 다시 전달됩니다. `BasicQosAsync`의 `prefetchCount`를 작은 수로 잡고 필요할 때 의식적으로 올립니다.
- 확인 응답을 받지 못한 작업은 되돌아오고, 그래서 중복은 예외가 아니라 정상입니다. ack 전에 채널이 닫히거나 연결이 끊기면 브로커가 메시지를 큐에 되돌리고 다른 소비자가 그것을 돌립니다. 그러니 바깥에 부작용을 남기는 소비자에게는 메시지 id와 이미 처리한 것에 대한 기록이 필요합니다. 확인 응답은 작업 전이 아니라 작업 뒤에 하고, 재시도로는 절대 고쳐지지 않을 메시지에는 `requeue: false`를 준 `BasicNackAsync`와 dead letter exchange를 씁니다.
- 클래식 큐는 노드 하나에 살고, 클러스터를 묶는다고 그것이 저절로 바뀌지는 않습니다. 그 노드가 내려가면 큐는 쓸 수 없고, 내구성이 없다면 사라집니다. 복제는 명시적인 선택입니다. 노드 하나를 잃어도 살아남아야 하는 것에는 quorum queue를 선언하고, 큐는 durable로 메시지는 persistent로 표시하고, 내구성의 대가는 발행 경로의 디스크 쓰기로 치른다는 점을 기억합니다.
- 운영은 우리 일이고, 관리형 브로커가 감춰 주던 방식으로 고장 납니다. 메모리와 디스크 워터마크는 발행자를 흐름 제어에 걸어 세우고, 짧게 살다 죽는 연결이 수천 개면 파일 디스크립터가 바닥나고, 상한 없는 큐는 끝내 자기 소비자만이 아니라 노드 전체를 막습니다. 큐 길이 한도를 두고 워터마크를 감시하고, 장애가 났을 때가 아니라 일정에 따라 올립니다.

## .NET에서는

- 공식 `RabbitMQ.Client` 패키지가 연결과 채널과 소비자를 줍니다. 토폴로지는 시작할 때 반복해도 안전하게 선언하고, 소비를 시작하기 전에 prefetch를 잡고, 확인 응답은 작업이 성공한 뒤에만 보냅니다.

```csharp
var factory = new ConnectionFactory { HostName = "localhost" };
await using var connection = await factory.CreateConnectionAsync();
await using var channel = await connection.CreateChannelAsync();

// 선언은 여러 번 반복해도 안전합니다. 만들거나 확인할 뿐 중복해서 만들지 않습니다.
await channel.QueueDeclareAsync("orders", durable: true, exclusive: false, autoDelete: false);

// 동시에 떠 있는 메시지 수의 상한입니다. 이것이 없으면 첫 소비자가 전부 가져갑니다.
await channel.BasicQosAsync(prefetchSize: 0, prefetchCount: 16, global: false);

var consumer = new AsyncEventingBasicConsumer(channel);
consumer.ReceivedAsync += async (_, ea) =>
{
    try
    {
        await handler.HandleAsync(Decode(ea.Body.Span), ea.CancellationToken);
        await channel.BasicAckAsync(ea.DeliveryTag, multiple: false);
    }
    catch (PoisonMessageException)
    {
        // 큐로 되돌리지 않습니다. 큐에 붙은 데드 레터 exchange가 여기서 받아 갑니다.
        await channel.BasicNackAsync(ea.DeliveryTag, multiple: false, requeue: false);
    }
};

await channel.BasicConsumeAsync("orders", autoAck: false, consumer: consumer);
```

- 연결은 비싸고 채널은 스레드에 안전하지 않습니다. 애플리케이션마다 오래 사는 연결 하나를 열고 소비자나 발행 스레드마다 자기 채널을 줍니다. 채널을 스레드끼리 나눠 쓰면 프로토콜 프레임이 깨지고, 브로커의 버그처럼 보이는 실패가 납니다. 클라이언트의 자동 복구는 네트워크가 끊긴 뒤 연결과 채널과 소비자를 다시 열어 주니 켜 두는 편이 좋습니다.
- `autoAck: true`는 최대 한 번이고, 우리가 원하는 경우는 드뭅니다. 전달하는 순간에 확인 응답을 해 버려서 핸들러 도중에 죽으면 메시지가 조용히 사라집니다. 위의 재전달을 가능하게 하는 것은 수동 확인 응답입니다.
- 발행자 확인은 메시지를 잃지 않는 이야기의 나머지 절반입니다. 발행은 브로커가 확인해 주기 전까지는 보내고 잊는 것이라서, 작업을 흘리면 안 되는 발행자는 확인을 기다립니다. durable 큐와 persistent 메시지와 발행자 확인, 이 셋이 브로커 재시작을 넘기는 온전한 조합입니다.
