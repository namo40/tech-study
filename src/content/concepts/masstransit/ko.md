---
title: "MassTransit"
summary: "MassTransit은 메시지 브로커 위에 얹는 애플리케이션 프레임워크입니다. 소비자와 재시도 정책과 지연 재전송과 사가를 .NET 코드로 한 번 쓰면, 그 아래의 전송은 애플리케이션의 모양이 아니라 설정 한 줄이 됩니다."
category: "메시징과 이벤트 처리"
related:
  - label: Web Queue Worker
    slug: web-queue-worker
  - label: Work Queue
    slug: work-queue
  - label: Competing Consumers
    slug: competing-consumers
  - label: Dead Letter Queue
    slug: dead-letter-queue
  - label: Saga
    slug: saga
  - label: Orchestration
    slug: orchestration
  - label: Transactional Outbox
    slug: transactional-outbox
  - label: Azure Service Bus
    slug: azure-service-bus
  - label: RabbitMQ
    slug: rabbitmq
references:
  - title: MassTransit concepts
    url: https://masstransit.massient.com/concepts
---

## 언제 쓰나

- 메시지를 처리하는 일이 요청을 처리하는 일처럼 보여야 할 때 씁니다. 소비자는 `Consume` 메서드 하나를 가진 클래스이고, 애플리케이션의 다른 모든 것처럼 컨테이너에서 해석되며, 수신 루프와 역직렬화와 확인 응답은 프레임워크가 쥡니다. 호스티드 서비스 안에 파묻힌 브로커 SDK 호출과, 팀이 찾아보고 의존성을 주입하고 테스트할 수 있는 작업 단위의 차이가 이것입니다.
- 재시도와 지연 재전송과 오류 큐를 손으로 짜지 않고 선언으로 두고 싶을 때 씁니다. 일시적인 실패에는 즉시 재시도, 의존 대상이 죽어 있을 때는 몇 분 뒤의 예약 재전송, 시도가 다 떨어지면 오류 큐로 옮기기. 이 셋이 엔드포인트 설정 세 줄이고, 소비자마다 다시 구현하는 대신 모든 소비자에 똑같이 적용됩니다.
- 하나의 대화가 여러 메시지에 걸쳐 있고 어디까지 왔는지를 기억해야 할 때 꺼냅니다. 사가 상태 머신은 그 대화에 명시적인 타입을 줍니다. 상태와 이벤트, 그 사이의 전이, 그리고 상관관계 id로 찾아지는 저장된 인스턴스입니다. `IHostedService` 클래스를 모아 둔 폴더가 저절로 갖추지 못하는 부분이기도 합니다.
- 전송 선택이 설계 결정이 아니라 배포 결정이어야 할 때 고릅니다. 같은 소비자 코드가 테스트에서는 인메모리 전송, 개발자 기계에서는 RabbitMQ, 운영에서는 Azure Service Bus를 상대로 돕니다. 바뀌는 것은 시작 코드의 `UsingRabbitMq`나 `UsingAzureServiceBus` 호출이지 그 주위의 클래스가 아니기 때문입니다.

## 주의점

- 브로커 토폴로지를 정하는 쪽은 프레임워크이고, 그 규약을 모르면 브로커 콘솔이 읽히지 않습니다. MassTransit은 메시지 타입으로 라우팅합니다. `OrderPlaced`를 발행하면 그 타입 이름을 딴 교환기나 토픽이 생기고, 그것을 소비하는 쪽마다 그 이름에 바인딩된 큐가 생깁니다. 포털에 보이는 엔터티는 우리가 타이핑한 어떤 이름과도 맞지 않으니, 장애가 난 날 처음 들여다보는 일이 없도록 이름 규칙을 먼저 익혀 두세요.
- 추상화가 감추는 것은 브로커끼리의 차이이지 우리에게서 그 차이를 없애 주는 것이 아닙니다. Service Bus 세션, 파티션 키, RabbitMQ 교환기 타입, 전송별 할당량은 그대로 남아 있고, 거기에 손을 대려면 전송 고유 설정이 필요해져서 코드가 조용히 한 브로커에 묶입니다. 이식성은 평범한 경로에서는 사실이고, 그 바깥에서는 시험해 볼 만한 주장입니다.
- 소비자는 여전히 두 번 호출될 수 있고, 프레임워크가 그 사실을 바꾸지는 않습니다. 재시도와 지연 재전송과 브로커의 최소 한 번 전달은 모두 같은 핸들러가 같은 메시지를 다시 볼 수 있다는 뜻입니다. 그래서 바깥에 부작용을 남기는 소비자에게는 늘 하던 방어가 필요합니다. 메시지 id, 이미 처리한 것에 대한 기록, 또는 발행 쪽의 트랜잭션 아웃박스입니다. 같은 메시지를 두 번 처리해도 결과가 달라지지 않게 만드는 일은 여전히 우리 몫입니다.
- 메이저 버전 사이의 변화 폭이 커서 예제가 빨리 낡습니다. 설정 API도 아웃박스도 스케줄링도 릴리스를 건너며 모양이 바뀌었고, 최신 버전은 라이선스 조건도 달라졌습니다. 버전을 고정하고 그 버전의 문서를 읽고, 메이저 두 개 전의 블로그 글은 지시서가 아니라 힌트로 다루세요.

## .NET에서는

- 등록은 호출 한 번이고, 그 안에서 소비자와 전송과 엔드포인트가 함께 엮입니다. `AddMassTransit`이 소비자를 모으고 전송 호출이 브로커를 고르며, 재시도와 지연 재전송 정책은 핸들러 안이 아니라 수신 엔드포인트에 붙습니다.

```csharp
builder.Services.AddMassTransit(x =>
{
    x.AddConsumer<OrderPlacedConsumer>();

    x.UsingRabbitMq((context, cfg) =>
    {
        cfg.Host("rabbitmq://localhost");

        cfg.ReceiveEndpoint("order-processing", e =>
        {
            // Fast attempts for a transient blip...
            e.UseMessageRetry(r => r.Interval(3, TimeSpan.FromSeconds(2)));
            // ...and a scheduled return to the queue for a dependency that is down.
            e.UseDelayedRedelivery(r => r.Intervals(
                TimeSpan.FromMinutes(1), TimeSpan.FromMinutes(10)));

            e.ConfigureConsumer<OrderPlacedConsumer>(context);
        });
    });
});

public class OrderPlacedConsumer : IConsumer<OrderPlaced>
{
    public async Task Consume(ConsumeContext<OrderPlaced> context)
    {
        // Throwing here is the signal to the endpoint's retry policy; the
        // framework acknowledges only when this method returns.
        await handler.HandleAsync(context.Message, context.CancellationToken);
    }
}
```

- 발행과 전송이 다른 동사인 데에는 이유가 있습니다. `Publish`는 그 타입을 구독하는 모든 소비자에게 메시지를 퍼뜨리고 `Send`는 엔드포인트 하나를 직접 지목합니다. 둘을 잘못 고르면 이벤트가 한 번만 전달되거나 명령이 네 번 전달되는 일이 생깁니다.
- 인메모리 테스트 하네스는 브로커 없이 소비자를 테스트할 수 있게 해 주는 장치입니다. 버스를 프로세스 안에서 띄우고, 테스트가 메시지를 발행한 다음 소비자가 호출되었는지와 기대한 메시지가 나왔는지를 단언하게 해 줍니다. 재시도와 라우팅 설정이 docker-compose 파일이 아니라 평범한 단위 테스트로 덮이는 셈입니다.
- 트랜잭션 아웃박스는 우리가 만드는 것이 아니라 기본 기능입니다. Entity Framework Core 통합과 함께 켜면 나가는 메시지가 상태 변경과 같은 트랜잭션에 기록되고 그다음에 전달됩니다. 데이터베이스 커밋은 성공했는데 발행은 실패하는 틈이 그렇게 닫힙니다.
